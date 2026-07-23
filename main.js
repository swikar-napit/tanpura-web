// ===== Audio engine (Web Audio API, pattern-aware seamless looping) =====
//
// A tanpura recording has a repeating pluck cycle (e.g. Pa-Sa-Sa-Sa).
// Just trimming silence off the edges isn't enough if the cut point
// lands at a different phase of that cycle than the start — you get
// a real dip/gap because that's genuinely what the audio sounds like
// at that instant (mid-decay, waiting for the next pluck).
//
// This version:
//  1. Finds where real audio starts (skips any leading silence/padding).
//  2. Uses autocorrelation on the amplitude envelope to detect the
//     natural repeat period of the pluck pattern.
//  3. Searches near an exact multiple of that period for the sample
//     offset where the waveform best matches the start (so the cut
//     lands at the same phase of the cycle, not a random point).
//  4. Applies a short crossfade at that well-aligned boundary as a
//     final smoothing pass.

const SILENCE_THRESHOLD = 0.015;
const MIN_PERIOD_SEC = 1.2;   // shortest plausible pluck-cycle length to search for
const MAX_PERIOD_SEC = 6.0;   // longest plausible pluck-cycle length to search for
const REFINE_WINDOW_SEC = 0.12; // how far to search around the period estimate for the best match
const COMPARE_WINDOW_SAMPLES = 900; // window size used when comparing candidate cut points
const LOOP_FADE_SEC = 0.15;   // short final smoothing crossfade at the aligned boundary

const audioCache = {};
let audioCtx = null;
let masterGain = null;
let currentSource = null;
let isPlaying = false;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = volSlider.value / 100;
    masterGain.connect(audioCtx.destination);
  }
  return audioCtx;
}

// ---- Step 1: find where real audio starts/ends (skip silence/padding) ----
function detectSoundBounds(buffer, threshold) {
  const length = buffer.length;
  const channels = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));

  const ampAt = (i) => {
    let max = 0;
    for (const data of channels) {
      const v = Math.abs(data[i]);
      if (v > max) max = v;
    }
    return max;
  };

  let start = 0;
  for (let i = 0; i < length; i++) { if (ampAt(i) > threshold) { start = i; break; } }

  let end = length - 1;
  for (let i = length - 1; i >= 0; i--) { if (ampAt(i) > threshold) { end = i; break; } }

  if (end <= start) { start = 0; end = length - 1; }
  return { start, end };
}

// ---- Step 2: build a coarse amplitude envelope (mono, RMS per hop) ----
function computeEnvelope(buffer, coreStart, coreEnd, hop) {
  const channels = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));

  const length = coreEnd - coreStart;
  const numFrames = Math.max(1, Math.floor(length / hop));
  const env = new Float32Array(numFrames);

  for (let f = 0; f < numFrames; f++) {
    const s = coreStart + f * hop;
    let sum = 0;
    for (let i = 0; i < hop; i++) {
      let v = 0;
      for (const data of channels) {
        const a = Math.abs(data[s + i] || 0);
        if (a > v) v = a;
      }
      sum += v * v;
    }
    env[f] = Math.sqrt(sum / hop);
  }
  return env;
}

// ---- Step 3: autocorrelate the envelope to find the repeat period ----
function findPeriodSamples(env, sr, hop, minSec, maxSec) {
  const minLag = Math.max(1, Math.floor((minSec * sr) / hop));
  const maxLag = Math.min(env.length - 1, Math.floor((maxSec * sr) / hop));
  if (maxLag <= minLag) return null;

  const mean = env.reduce((a, b) => a + b, 0) / env.length;
  const norm = new Float32Array(env.length);
  for (let i = 0; i < env.length; i++) norm[i] = env[i] - mean;

  let bestLag = -1;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0, count = 0;
    for (let i = 0; i + lag < norm.length; i++) {
      score += norm[i] * norm[i + lag];
      count++;
    }
    if (count === 0) continue;
    score /= count;
    if (score > bestScore) { bestScore = score; bestLag = lag; }
  }

  if (bestLag < 0) return null;
  return bestLag * hop; // period expressed in samples
}

// ---- Step 4: near an exact multiple of the period, find the sample
//      offset whose waveform best matches the head (same cycle phase) ----
function refineLoopEnd(buffer, coreStart, approxEnd, refineWindowSamples, compareLen) {
  const channels = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));

  const searchFrom = Math.max(coreStart + compareLen, approxEnd - refineWindowSamples);
  const searchTo = Math.min(buffer.length - compareLen, approxEnd + refineWindowSamples);
  if (searchTo <= searchFrom) return approxEnd;

  let bestOffset = approxEnd;
  let bestError = Infinity;

  for (let candidate = searchFrom; candidate <= searchTo; candidate += 4) {
    let error = 0;
    for (const data of channels) {
      for (let i = 0; i < compareLen; i += 3) { // stride for speed
        const diff = data[coreStart + i] - data[candidate - compareLen + i];
        error += diff * diff;
      }
    }
    if (error < bestError) { bestError = error; bestOffset = candidate; }
  }

  return bestOffset;
}

// ---- Step 5: crossfade the aligned boundary and build the final buffer ----
function makeSeamlessLoop(buffer, threshold, fadeSec) {
  const ctx = getAudioContext();
  const sr = buffer.sampleRate;

  const { start: coreStart, end: coreEndInclusive } = detectSoundBounds(buffer, threshold);
  const coreEndMax = coreEndInclusive + 1;

  const hop = 512;
  const env = computeEnvelope(buffer, coreStart, coreEndMax, hop);
  const periodSamples = findPeriodSamples(env, sr, hop, MIN_PERIOD_SEC, MAX_PERIOD_SEC);

  let loopEnd;
  if (periodSamples) {
    const available = coreEndMax - coreStart;
    const cycles = Math.max(1, Math.floor(available / periodSamples));
    const approxEnd = coreStart + cycles * periodSamples;
    const refineWindow = Math.floor(REFINE_WINDOW_SEC * sr);
    loopEnd = refineLoopEnd(buffer, coreStart, Math.min(approxEnd, coreEndMax), refineWindow, COMPARE_WINDOW_SAMPLES);
  } else {
    loopEnd = coreEndMax; // fallback: no clear period found, just use detected silence bounds
  }

  const coreLength = loopEnd - coreStart;
  const fadeLen = Math.min(Math.floor(fadeSec * sr), Math.floor(coreLength / 4));
  const newLength = coreLength - fadeLen;

  const outBuffer = ctx.createBuffer(buffer.numberOfChannels, newLength, sr);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const input = buffer.getChannelData(ch);
    const output = outBuffer.getChannelData(ch);

    for (let i = fadeLen; i < coreLength - fadeLen; i++) {
      output[i - fadeLen] = input[coreStart + i];
    }
    for (let i = 0; i < fadeLen; i++) {
      const t = i / fadeLen;
      const fadeIn = Math.sin((t * Math.PI) / 2);
      const fadeOut = Math.cos((t * Math.PI) / 2);
      output[i] = input[coreStart + i] * fadeIn + input[loopEnd - fadeLen + i] * fadeOut;
    }
  }

  return outBuffer;
}

async function loadNoteBuffer(note) {
  const key = note.replace('#', 's');
  if (audioCache[key]) return audioCache[key];

  const fileNote = note.toLowerCase();
  const url = `audio/${encodeURIComponent(fileNote)}tanpura.mp3`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}`);

  const arrayBuffer = await res.arrayBuffer();
  const rawBuffer = await getAudioContext().decodeAudioData(arrayBuffer);
  const loopBuffer = makeSeamlessLoop(rawBuffer, SILENCE_THRESHOLD, LOOP_FADE_SEC);

  audioCache[key] = loopBuffer;
  return loopBuffer;
}

async function startTanpura(note) {
  stopTanpura();
  const buffer = await loadNoteBuffer(note);
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(masterGain);
  source.start(0);

  currentSource = source;
  isPlaying = true;
}

function stopTanpura() {
  if (currentSource) {
    try { currentSource.stop(); currentSource.disconnect(); } catch (e) {}
    currentSource = null;
  }
  isPlaying = false;
}

// ===== Volume slider =====
const volSlider = document.getElementById('volSlider');
const volValue = document.getElementById('volValue');

volSlider.addEventListener('input', () => {
  volValue.textContent = volSlider.value + '%';
  volSlider.style.setProperty('--fill', volSlider.value + '%');
  if (masterGain) {
    masterGain.gain.setTargetAtTime(volSlider.value / 100, audioCtx.currentTime, 0.05);
  }
});

// ===== Pitch grid =====
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const grid = document.getElementById('pitchGrid');
const selectedPitch = document.getElementById('selectedPitch');
let selectedNote = "C";

NOTES.forEach(note => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pitch-btn' + (note === selectedNote ? ' selected' : '');
  btn.textContent = note;
  btn.setAttribute('aria-pressed', note === selectedNote);

  btn.addEventListener('click', async () => {
    document.querySelectorAll('.pitch-btn').forEach(b => {
      b.classList.remove('selected');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('selected');
    btn.setAttribute('aria-pressed', 'true');
    selectedNote = note;
    selectedPitch.textContent = note;

    if (isPlaying) {
      await startTanpura(selectedNote);
    }
  });

  grid.appendChild(btn);
});

// ===== Play / Stop button =====
const transportBtn = document.getElementById('transportBtn');

transportBtn.addEventListener('click', async () => {
  if (isPlaying) {
    stopTanpura();
    transportBtn.textContent = '▶ Start';
    transportBtn.classList.remove('playing');
    transportBtn.setAttribute('aria-pressed', 'false');
  } else {
    transportBtn.textContent = '… Analyzing';
    try {
      await startTanpura(selectedNote);
      transportBtn.textContent = '■ Stop';
      transportBtn.classList.add('playing');
      transportBtn.setAttribute('aria-pressed', 'true');
    } catch (err) {
      console.error(err);
      transportBtn.textContent = '▶ Start';
      alert(`Could not load audio for ${selectedNote}. Check that audio/${selectedNote.toLowerCase()}tanpura.mp3 exists.`);
    }
  }
});

// ===== Madhyam Shruthi toggle =====
const shruthiToggle = document.getElementById('shruthiToggle');
let tuningMode = 'pancham';

shruthiToggle.addEventListener('change', async () => {
  const isOn = shruthiToggle.checked;
  tuningMode = isOn ? 'madhyam' : 'pancham';
  console.log('Madhyam Shruthi:', isOn ? 'on' : 'off');
});
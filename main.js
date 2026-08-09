// ===== Audio engine — real .wav samples, seamless loop =====
//
// Files live in audio/ folder:
//   Pancham: audio/c.wav, audio/cs.wav, ... audio/b.wav
//   Madhyam: audio/mc.wav, audio/mcs.wav, ... audio/mb.wav
//
// Note name → filename mapping:
//   C→c, C#→cs, D→d, D#→ds, E→e, F→f,
//   F#→fs, G→g, G#→gs, A→a, A#→as, B→b

const NOTE_FILE = {
  "C": "c", "C#": "cs", "D": "d", "D#": "ds",
  "E": "e", "F": "f",  "F#": "fs", "G": "g",
  "G#": "gs", "A": "a", "A#": "as", "B": "b"
};

let audioCtx    = null;
let gainNode    = null;
let sourceNode  = null;
let audioBuffer = null;
let isPlaying   = false;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = audioCtx.createGain();
    gainNode.gain.value = volSlider.value / 100;
    gainNode.connect(audioCtx.destination);
  }
  return audioCtx;
}

function playBuffer(buffer) {
  if (sourceNode) {
    try { sourceNode.stop(0); } catch(e) {}
    sourceNode = null;
  }
  const ctx = getAudioContext();
  sourceNode = ctx.createBufferSource();
  sourceNode.buffer = buffer;
  sourceNode.loop = true;
  sourceNode.connect(gainNode);
  sourceNode.start(0);
}

// Cache of decoded buffers, keyed by filename (e.g. "c", "mc")
const bufferCache = new Map();
// Tracks in-flight loads so we never fetch/decode the same file twice in parallel
const loadingPromises = new Map();

async function loadAndDecode(filename) {
  if (bufferCache.has(filename)) return bufferCache.get(filename);
  if (loadingPromises.has(filename)) return loadingPromises.get(filename);

  const ctx = getAudioContext();
  const url = `audio/${filename}.wav`;

  const promise = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load ${url}`);
      return res.arrayBuffer();
    })
    .then((arr) => ctx.decodeAudioData(arr))
    .then((buffer) => {
      bufferCache.set(filename, buffer);
      loadingPromises.delete(filename);
      return buffer;
    })
    .catch((err) => {
      loadingPromises.delete(filename);
      throw err;
    });

  loadingPromises.set(filename, promise);
  return promise;
}

// Quietly preload every note (both shruthi modes) in the background
// so switching pitch/mode later is instant. The currently-selected note
// (default "C") goes first so it's ready as fast as possible.
function preloadAllNotes(priorityNote) {
  const priorityBase = priorityNote ? NOTE_FILE[priorityNote] : null;
  const bases = Object.values(NOTE_FILE);
  const ordered = priorityBase
    ? [priorityBase, ...bases.filter((b) => b !== priorityBase)]
    : bases;

  ordered.forEach((base) => {
    loadAndDecode(base).catch(() => {});       // Pancham
    loadAndDecode("m" + base).catch(() => {}); // Madhyam
  });
}

async function startTanpura(note) {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") await ctx.resume();

  const madhyam  = shruthiToggle.checked ? "m" : "";
  const filename = madhyam + NOTE_FILE[note];

  const buffer = await loadAndDecode(filename);
  audioBuffer = buffer;
  playBuffer(buffer);
  isPlaying = true;
}

function stopTanpura() {
  if (sourceNode) {
    try { sourceNode.stop(0); } catch(e) {}
    sourceNode = null;
  }
  audioBuffer = null;
  isPlaying   = false;
}

// ===== Volume slider =====
const volSlider = document.getElementById("volSlider");
const volValue  = document.getElementById("volValue");

volSlider.addEventListener("input", () => {
  volValue.textContent = volSlider.value + "%";
  volSlider.style.setProperty("--fill", volSlider.value + "%");
  if (gainNode) {
    gainNode.gain.setTargetAtTime(volSlider.value / 100, audioCtx.currentTime, 0.05);
  }
});

// ===== Pitch grid =====
const NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const grid  = document.getElementById("pitchGrid");
const selectedPitch = document.getElementById("selectedPitch");
let selectedNote = "C";

NOTES.forEach(note => {
  const btn = document.createElement("button");
  btn.type        = "button";
  btn.className   = "pitch-btn" + (note === selectedNote ? " selected" : "");
  btn.textContent = note;
  btn.setAttribute("aria-pressed", note === selectedNote);

  btn.addEventListener("click", async () => {
    document.querySelectorAll(".pitch-btn").forEach(b => {
      b.classList.remove("selected");
      b.setAttribute("aria-pressed", "false");
    });
    btn.classList.add("selected");
    btn.setAttribute("aria-pressed", "true");
    selectedNote = note;
    selectedPitch.textContent = note;

    if (isPlaying) {
      transportBtn.textContent = "… Loading";
      try {
        await startTanpura(selectedNote);
        transportBtn.textContent = "■ Stop";
      } catch(err) {
        console.error(err);
        stopTanpura();
        transportBtn.textContent = "▶ Start";
        transportBtn.classList.remove("playing");
        transportBtn.setAttribute("aria-pressed", "false");
        alert(`Could not load audio for ${note}. Make sure audio/${NOTE_FILE[note]}.wav exists.`);
      }
    }
  });

  grid.appendChild(btn);
});

// ===== Play / Stop button =====
const transportBtn = document.getElementById("transportBtn");

transportBtn.addEventListener("click", async () => {
  if (isPlaying) {
    stopTanpura();
    transportBtn.textContent = "▶ Start";
    transportBtn.classList.remove("playing");
    transportBtn.setAttribute("aria-pressed", "false");
  } else {
    transportBtn.textContent = "… Loading";
    transportBtn.disabled = true;
    try {
      await startTanpura(selectedNote);
      transportBtn.textContent = "■ Stop";
      transportBtn.classList.add("playing");
      transportBtn.setAttribute("aria-pressed", "true");
    } catch(err) {
      console.error(err);
      transportBtn.textContent = "▶ Start";
      alert(`Could not load audio/${NOTE_FILE[selectedNote]}.wav — make sure the file exists.`);
    } finally {
      transportBtn.disabled = false;
    }
  }
});

// ===== Background preload =====
// Fetching + decodeAudioData do NOT require a user gesture — only actually
// starting sound output does. So we kick off preloading immediately when the
// page loads, well before the user ever touches Start. By the time they
// click, the buffer for the selected note (and usually all of them) is
// already decoded and sitting in memory, so playback starts with ~0 delay.
getAudioContext();          // safe to create early; starts "suspended", that's fine
preloadAllNotes("C");       // starts fetch+decode for all 24 files, "C" first

// ===== Metronome =====
// Uses the standard Web Audio "lookahead scheduler" pattern: a JS timer
// wakes up frequently just to check the clock, but the actual click sounds
// are scheduled against audioCtx.currentTime, which is sample-accurate and
// immune to JS/UI thread jitter. This is what keeps tempo rock-solid even
// if the tab is busy re-rendering something else.
const bpmSlider    = document.getElementById("bpmSlider");
const bpmValue     = document.getElementById("bpmValue");
const tapTempoBtn  = document.getElementById("tapTempoBtn");
const beatsSelect  = document.getElementById("beatsSelect");
const beatDotsEl   = document.getElementById("beatDots");
const metroBtn     = document.getElementById("metroBtn");

const SCHEDULE_AHEAD_TIME = 0.1;  // seconds — how far ahead we schedule audio
const LOOKAHEAD_INTERVAL  = 25;   // ms — how often the scheduler wakes up

let bpm            = parseInt(bpmSlider.value, 10);
let beatsPerBar     = 4;
let metroIsPlaying = false;
let metroTimerId   = null;
let nextNoteTime   = 0;
let currentBeat    = 0;
let tapTimes       = [];

function buildBeatDots() {
  beatDotsEl.innerHTML = "";
  for (let i = 0; i < beatsPerBar; i++) {
    const dot = document.createElement("span");
    dot.className = "beat-dot" + (i === 0 ? " accent" : "");
    beatDotsEl.appendChild(dot);
  }
}
buildBeatDots();

function flashBeat(beatIndex) {
  const dots = beatDotsEl.querySelectorAll(".beat-dot");
  dots.forEach((d) => d.classList.remove("active"));
  if (dots[beatIndex]) {
    dots[beatIndex].classList.add("active");
    setTimeout(() => dots[beatIndex].classList.remove("active"), 100);
  }
}

// Short synthesized click — accented beat is higher pitched/louder.
function scheduleClick(beatIndex, time) {
  const ctx = getAudioContext();
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();

  const isAccent = beatIndex === 0;
  osc.frequency.value = isAccent ? 1500 : 1000;

  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(isAccent ? 0.9 : 0.55, time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.07);

  // Sync the visual flash to when the click actually sounds, not to "now".
  const delayMs = Math.max(0, (time - ctx.currentTime) * 1000);
  setTimeout(() => flashBeat(beatIndex), delayMs);
}

function metroScheduler() {
  const ctx = getAudioContext();
  while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_TIME) {
    scheduleClick(currentBeat, nextNoteTime);
    nextNoteTime += 60.0 / bpm;
    currentBeat = (currentBeat + 1) % beatsPerBar;
  }
  metroTimerId = setTimeout(metroScheduler, LOOKAHEAD_INTERVAL);
}

async function startMetronome() {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  currentBeat  = 0;
  nextNoteTime = ctx.currentTime + 0.05;
  metroScheduler();
  metroIsPlaying = true;
}

function stopMetronome() {
  clearTimeout(metroTimerId);
  metroTimerId = null;
  metroIsPlaying = false;
  beatDotsEl.querySelectorAll(".beat-dot").forEach((d) => d.classList.remove("active"));
}

bpmSlider.addEventListener("input", () => {
  bpm = parseInt(bpmSlider.value, 10);
  bpmValue.textContent = bpm + " BPM";
  const pct = ((bpm - 40) / (208 - 40)) * 100;
  bpmSlider.style.setProperty("--fill", pct + "%");
});

beatsSelect.addEventListener("click", (e) => {
  const btn = e.target.closest(".beats-btn");
  if (!btn) return;
  beatsSelect.querySelectorAll(".beats-btn").forEach((b) => b.classList.remove("selected"));
  btn.classList.add("selected");
  beatsPerBar = parseInt(btn.dataset.beats, 10);
  buildBeatDots();
  currentBeat = 0;
});

// Tap tempo: average the gaps between the last few taps (up to 8),
// discarding stale taps if the user pauses for more than 2 seconds.
tapTempoBtn.addEventListener("click", () => {
  const now = performance.now();
  if (tapTimes.length && now - tapTimes[tapTimes.length - 1] > 2000) {
    tapTimes = [];
  }
  tapTimes.push(now);
  if (tapTimes.length > 8) tapTimes.shift();

  if (tapTimes.length >= 2) {
    const intervals = [];
    for (let i = 1; i < tapTimes.length; i++) {
      intervals.push(tapTimes[i] - tapTimes[i - 1]);
    }
    const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const tappedBpm = Math.round(60000 / avgMs);
    bpm = Math.min(208, Math.max(40, tappedBpm));
    bpmSlider.value = bpm;
    bpmValue.textContent = bpm + " BPM";
    const pct = ((bpm - 40) / (208 - 40)) * 100;
    bpmSlider.style.setProperty("--fill", pct + "%");
  }
});

metroBtn.addEventListener("click", async () => {
  if (metroIsPlaying) {
    stopMetronome();
    metroBtn.textContent = "♩ Start Metronome";
    metroBtn.classList.remove("playing");
    metroBtn.setAttribute("aria-pressed", "false");
  } else {
    await startMetronome();
    metroBtn.textContent = "■ Stop Metronome";
    metroBtn.classList.add("playing");
    metroBtn.setAttribute("aria-pressed", "true");
  }
});

// ===== Madhyam Shruthi toggle =====
const shruthiToggle = document.getElementById("shruthiToggle");

shruthiToggle.addEventListener("change", async () => {
  if (isPlaying) {
    transportBtn.textContent = "… Loading";
    try {
      await startTanpura(selectedNote);
      transportBtn.textContent = "■ Stop";
    } catch(err) {
      console.error(err);
      stopTanpura();
      transportBtn.textContent = "▶ Start";
      transportBtn.classList.remove("playing");
      transportBtn.setAttribute("aria-pressed", "false");
    }
  }
});
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
      transportBtn.disabled = true;
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
      } finally {
        transportBtn.disabled = false;
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
const bpmSlider     = document.getElementById("bpmSlider");
const bpmMainWrap   = document.getElementById("bpmMainWrap");
const bpmMainEl     = document.getElementById("bpmMain");
const bpmGhostUpEl  = document.getElementById("bpmGhostUp");
const bpmGhostDnEl  = document.getElementById("bpmGhostDown");
const tempoNameEl   = document.getElementById("tempoName");
const tapTempoBtn   = document.getElementById("tapTempoBtn");
const metroLightsEl = document.getElementById("metroLights");
const metroBtn      = document.getElementById("metroBtn");
const metroPlayIcon = document.getElementById("metroPlayIcon");

const beatsValueEl  = document.getElementById("beatsValue");
const beatsMinusBtn = document.getElementById("beatsMinusBtn");
const beatsPlusBtn  = document.getElementById("beatsPlusBtn");

const bpmMinus1Btn  = document.getElementById("bpmMinus1");
const bpmMinus5Btn  = document.getElementById("bpmMinus5");
const bpmPlus1Btn   = document.getElementById("bpmPlus1");
const bpmPlus5Btn   = document.getElementById("bpmPlus5");

const SCHEDULE_AHEAD_TIME = 0.1;  // seconds — how far ahead we schedule audio
const LOOKAHEAD_INTERVAL  = 25;   // ms — how often the scheduler wakes up
const BPM_MIN = 40;
const BPM_MAX = 208;
const BEATS_MIN = 1;
const BEATS_MAX = 16;

let bpm            = parseInt(bpmSlider.value, 10);
let beatsPerBar    = 4;
let metroIsPlaying = false;
let metroTimerId   = null;
let nextNoteTime   = 0;
let currentBeat    = 0;
let tapTimes       = [];

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

// Classic Italian tempo markings, used just for the label next to the slider.
const TEMPO_NAMES = [
  { max: 45,  name: "Larghissimo" },
  { max: 60,  name: "Largo" },
  { max: 66,  name: "Larghetto" },
  { max: 76,  name: "Adagio" },
  { max: 108, name: "Andante" },
  { max: 120, name: "Moderato" },
  { max: 156, name: "Allegro" },
  { max: 176, name: "Vivace" },
  { max: 200, name: "Presto" },
  { max: Infinity, name: "Prestissimo" },
];

function tempoNameFor(value) {
  return TEMPO_NAMES.find((t) => value <= t.max).name;
}

function updateBpmDisplay(syncSlider = true) {
  bpmGhostUpEl.textContent = bpm > BPM_MIN ? bpm - 1 : "";
  bpmGhostDnEl.textContent = bpm < BPM_MAX ? bpm + 1 : "";
  tempoNameEl.textContent = tempoNameFor(bpm);
  if (syncSlider) bpmSlider.value = bpm;
  const pct = ((bpm - BPM_MIN) / (BPM_MAX - BPM_MIN)) * 100;
  bpmSlider.style.setProperty("--fill", pct + "%");
}

function setBpm(value) {
  cancelBpmRoll();
  bpm = clamp(value, BPM_MIN, BPM_MAX);
  bpmMainEl.textContent = bpm;
  bpmMainEl.setAttribute("aria-label", `${bpm} beats per minute`);
  updateBpmDisplay();
}

// One continuously moving strip, rather than separate animations per BPM.
// A +5 therefore glides through 85, 86, 87, 88, 89 and 90 without pausing.
let bpmRollEl = null;

function cancelBpmRoll() {
  if (!bpmRollEl) return;
  bpmRollEl.remove();
  bpmRollEl = null;
  bpmMainEl.style.opacity = "1";
}

function setBpmAnimated(value) {
  const target = clamp(value, BPM_MIN, BPM_MAX);
  if (target === bpm) return;

  cancelBpmRoll();
  const start = bpm;
  const direction = target > start ? 1 : -1;
  const steps = Math.abs(target - start);
  const values = Array.from({ length: steps + 1 }, (_, index) => start + (index * direction));
  const roll = document.createElement("span");
  roll.className = "bpm-roll-track";
  roll.innerHTML = values.map((number) => `<span>${number}</span>`).join("");
  bpmMainWrap.appendChild(roll);
  bpmRollEl = roll;

  bpmMainEl.style.opacity = "0";
  bpm = target;
  bpmMainEl.textContent = bpm;
  bpmMainEl.setAttribute("aria-label", `${bpm} beats per minute`);
  updateBpmDisplay();

  const distance = steps * bpmMainWrap.clientHeight;
  const duration = Math.max(220, steps * 95);
  requestAnimationFrame(() => {
    if (bpmRollEl !== roll) return;
    roll.style.transition = `transform ${duration}ms linear`;
    roll.style.transform = `translateY(${-distance}px)`;
  });

  roll.addEventListener("transitionend", () => {
    if (bpmRollEl !== roll) return;
    roll.remove();
    bpmRollEl = null;
    bpmMainEl.style.opacity = "1";
  }, { once: true });

  // Reduced-motion preferences or an interrupted browser animation should
  // never leave the main number hidden.
  setTimeout(() => {
    if (bpmRollEl !== roll) return;
    roll.remove();
    bpmRollEl = null;
    bpmMainEl.style.opacity = "1";
  }, duration + 100);
}

updateBpmDisplay();

bpmSlider.addEventListener("input", () => {
  setBpmAnimated(parseInt(bpmSlider.value, 10));
});

bpmMinus1Btn.addEventListener("click", () => setBpmAnimated(bpm - 1));
bpmPlus1Btn.addEventListener("click", () => setBpmAnimated(bpm + 1));
bpmMinus5Btn.addEventListener("click", () => setBpmAnimated(bpm - 5));
bpmPlus5Btn.addEventListener("click", () => setBpmAnimated(bpm + 5));

// Beats per bar: simple 1-16 stepper.
function updateBeatsDisplay() {
  beatsValueEl.textContent = beatsPerBar;
  beatsMinusBtn.disabled = beatsPerBar <= BEATS_MIN;
  beatsPlusBtn.disabled = beatsPerBar >= BEATS_MAX;
}

function setBeatsPerBar(value) {
  beatsPerBar = clamp(value, BEATS_MIN, BEATS_MAX);
  currentBeat = 0;
  updateBeatsDisplay();
  buildMetroLights();
}

beatsMinusBtn.addEventListener("click", () => setBeatsPerBar(beatsPerBar - 1));
beatsPlusBtn.addEventListener("click", () => setBeatsPerBar(beatsPerBar + 1));

function buildMetroLights() {
  metroLightsEl.innerHTML = "";
  for (let i = 0; i < beatsPerBar; i++) {
    const light = document.createElement("span");
    light.className = "metro-light" + (i === 0 ? " accent" : "");
    metroLightsEl.appendChild(light);
  }
}
buildMetroLights();
updateBeatsDisplay();

function flashBeat(beatIndex) {
  const lights = metroLightsEl.querySelectorAll(".metro-light");
  lights.forEach((l) => l.classList.remove("lit"));
  if (lights[beatIndex]) {
    lights[beatIndex].classList.add("lit");
    setTimeout(() => lights[beatIndex].classList.remove("lit"), 100);
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
  metroLightsEl.querySelectorAll(".metro-light").forEach((l) => l.classList.remove("lit"));
}

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
    setBpm(Math.round(60000 / avgMs));
  }
});

const PLAY_ICON = '<path d="M8 5v14l11-7Z" />';
const STOP_ICON = '<rect x="6" y="6" width="12" height="12" rx="1.5" />';

metroBtn.addEventListener("click", async () => {
  if (metroBtn.disabled) return;

  if (metroIsPlaying) {
    stopMetronome();
    metroBtn.classList.remove("playing");
    metroBtn.setAttribute("aria-pressed", "false");
    metroBtn.setAttribute("aria-label", "Start metronome");
    metroPlayIcon.innerHTML = PLAY_ICON;
  } else {
    metroBtn.disabled = true;
    try {
      await startMetronome();
      metroBtn.classList.add("playing");
      metroBtn.setAttribute("aria-pressed", "true");
      metroBtn.setAttribute("aria-label", "Stop metronome");
      metroPlayIcon.innerHTML = STOP_ICON;
    } finally {
      metroBtn.disabled = false;
    }
  }
});


// ===== Madhyam Shruthi toggle =====
const shruthiToggle = document.getElementById("shruthiToggle");

shruthiToggle.addEventListener("change", async () => {
  if (isPlaying) {
    transportBtn.textContent = "… Loading";
    transportBtn.disabled = true;
    try {
      await startTanpura(selectedNote);
      transportBtn.textContent = "■ Stop";
    } catch(err) {
      console.error(err);
      stopTanpura();
      transportBtn.textContent = "▶ Start";
      transportBtn.classList.remove("playing");
      transportBtn.setAttribute("aria-pressed", "false");
    } finally {
      transportBtn.disabled = false;
    }
  }
});
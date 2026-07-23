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
// so switching pitch/mode later is instant.
function preloadAllNotes() {
  Object.values(NOTE_FILE).forEach((base) => {
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
// AudioContext can't do real work until a user gesture happens (browser
// autoplay policy), so kick off preloading on the first click/touch/keydown
// anywhere on the page — this happens before the user even presses Start.
let preloadStarted = false;
function triggerPreloadOnce() {
  if (preloadStarted) return;
  preloadStarted = true;
  getAudioContext();
  preloadAllNotes();
}
["pointerdown", "keydown"].forEach((evt) =>
  document.addEventListener(evt, triggerPreloadOnce, { once: true, passive: true })
);

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
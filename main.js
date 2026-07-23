// ===== Volume slider =====
const volSlider = document.getElementById('volSlider');
const volValue = document.getElementById('volValue');

volSlider.addEventListener('input', () => {
  volValue.textContent = volSlider.value + '%';
  volSlider.style.setProperty('--fill', volSlider.value + '%');
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

  btn.addEventListener('click', () => {
    document.querySelectorAll('.pitch-btn').forEach(b => {
      b.classList.remove('selected');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('selected');
    btn.setAttribute('aria-pressed', 'true');
    selectedNote = note;
    selectedPitch.textContent = note;
    // TODO: when the audio engine is wired up, change the drone's pitch here
  });

  grid.appendChild(btn);
});

// ===== Play / Stop button =====
const transportBtn = document.getElementById('transportBtn');
let playing = false;

transportBtn.addEventListener('click', () => {
  playing = !playing;
  transportBtn.textContent = playing ? '■ Stop drone' : '▶ Start drone';
  transportBtn.classList.toggle('playing', playing);
  transportBtn.setAttribute('aria-pressed', playing);
  // TODO: when the audio engine is wired up, start/stop the drone here
});

// ===== Madhyam Shruthi toggle =====
const shruthiToggle = document.getElementById('shruthiToggle');
let tuningMode = 'pancham';

shruthiToggle.addEventListener('change', () => {
  const isOn = shruthiToggle.checked;
  tuningMode = isOn ? 'madhyam' : 'pancham';
  console.log('Madhyam Shruthi:', isOn ? 'on' : 'off');
});

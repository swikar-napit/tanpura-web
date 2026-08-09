# 🎵 Web Tanpura
> 🎶 *Your Digital Tanpura Drone & Metronome — Practice Nepali Classical Music Anywhere*

![GitHub repo size](https://img.shields.io/github/repo-size/swikar-napit/tanpura-web)
![GitHub stars](https://img.shields.io/github/stars/swikar-napit/tanpura-web?style=social)
![GitHub forks](https://img.shields.io/github/forks/swikar-napit/tanpura-web?style=social)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Made with Love](https://img.shields.io/badge/Made%20with-%E2%9D%A4-red)
![Nepal](https://img.shields.io/badge/Made%20in-Nepal%20🇳🇵-blue)

---

## 🌐 Live Demo

👉 [Click here to open Web Tanpura](https://tanpura-web.vercel.app/)

---

## 📌 Table of Contents

- [Introduction](#-introduction)
- [Features](#-features)
- [Why This App?](#-why-this-app)
- [Tech Stack](#-tech-stack)
- [Installation](#-installation)
- [Usage](#-usage)
- [Project Structure](#-project-structure)
- [Roadmap](#-roadmap)
- [Credits](#-credits)
- [License](#-license)
- [Author](#-author)

---

## 📖 Introduction

**Web Tanpura** is a browser-based practice companion built for Nepali classical music students and performers, pairing an authentic tanpura drone with a built-in metronome.

A tanpura is a long-necked string instrument that provides a continuous harmonic drone — the sonic foundation of every Nepali classical music performance and riyaz session.

This app brings that drone to your browser, alongside a metronome to keep your taal steady. Select your shruthi (pitch), toggle tuning mode, dial in your tempo, and practice with both running side by side.

> No app. No install. No login. Just open and play.

---

## ✨ Features

- 🎵 **Real tanpura recordings** — authentic `.wav` samples, not electronic synthesis
- 🎼 **12 pitch options** — all semitones from C to B
- 🔄 **Pancham & Madhyam Shruthi** — toggle between the two standard tanpura tuning modes
- 🔁 **Seamless looping** — audio loops without any gap or click
- 🔊 **Smooth volume control** — real-time gain slider
- ⏱️ **Built-in metronome** — sample-accurate Web Audio scheduling, so tempo never drifts
- 👆 **Tap tempo** — tap along and it works out your BPM automatically
- 🎚️ **1–208 BPM range** with Italian tempo names (Largo, Andante, Allegro, Prestissimo, etc.)
- 🔢 **Adjustable beats per bar** — from 1 to 16, with a lit accent on the downbeat
- 💡 **Live beat lights** — visual pulse in sync with every click, so you can follow along without sound
- 📱 **Fully responsive** — works on phones, tablets, and desktops
- ⚡ **Zero dependencies** — pure HTML, CSS, and JavaScript, no frameworks

---

## 🌟 Why This App?

Musicians practicing Nepali classical music always need a tanpura drone — and a steady metronome — running in the background. Physical tanpuras are expensive and not always available, separate metronome apps mean switching between tools mid-practice, and existing options are either paid, require installation, or sound artificial.

Web Tanpura solves that:

- Real instrument recordings, not synthesis 🎵
- Drone and metronome together, no app-switching ⏱️
- Available 24/7 from any browser 🕐
- Completely free and open source 💸
- Works offline once loaded 📶
- No account or login needed 🔓

---

## 🛠 Tech Stack

| Technology | Purpose |
|---|---|
| HTML5 | Structure and layout |
| CSS3 | Dark UI styling and responsive design |
| JavaScript (ES6+) | Audio engine and UI logic |
| Web Audio API | Sample loading, decoding, and looping |
| GitHub Pages | Free static hosting |

---

## 🚀 Installation

Clone the repo and serve it locally:

```bash
git clone https://github.com/swikar-napit/tanpura-web.git
cd tanpura-web

# Using Python
python3 -m http.server 5500

# Or using Node.js
npx serve .
```

Then open `http://localhost:5500` in your browser.

> ⚠️ Must be served via a local server — opening `index.html` directly as `file://` won't work due to browser audio security restrictions.

---

## 🎹 Usage

**Tanpura:**
1. Select your **pitch** (Sa) from the grid
2. Toggle **Madhyam Shruthi** if you need the 4th string drone instead of the 5th
3. Hit **▶ Start** — the drone will begin playing
4. Press **■ Stop** when your practice session is done

**Metronome:**
1. Set your **tempo** with the `-1 / +1 / -5 / +5` step buttons, the slider, or **Tap Tempo**
2. Choose **beats per bar** (1–16) — the downbeat lights up in a distinct color
3. Press the **play button** to start the click, alongside the tanpura or on its own
4. Press it again to stop

---

## 📁 Project Structure

```text
tanpura-web/
│
├── audio/               # 24 real tanpura .wav samples
│   ├── c.wav ... b.wav  # Pancham shruthi (12 notes)
│   └── mc.wav ... mb.wav # Madhyam shruthi (12 notes)
│
├── index.html           # App layout and markup
├── main.js              # Audio engine — loader, decoder, looper
├── style.css            # Dark UI styling
└── README.md            # Project documentation
```

---

## 🗺 Roadmap

- [x] Pitch selection grid (all 12 semitones)
- [x] Pancham & Madhyam shruthi toggle
- [x] Real `.wav` sample playback
- [x] Seamless audio looping
- [x] Volume slider
- [x] Mobile responsive design
- [x] GitHub Pages deployment
- [x] Built-in metronome with tap tempo and adjustable beats per bar
- [ ] Dark/light theme toggle
- [ ] Offline PWA support

---

## 📄 License

MIT — free to use, modify, and share.

---

## 👨‍💻 Author

**Swikar Napit**
- GitHub: [@swikar-napit](https://github.com/swikar-napit)
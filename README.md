# WOTG Teleprompter

A mobile-first **camera teleprompter PWA** with video recording.

See yourself on camera while reading your script — like a professional teleprompter on your phone.

## Features

- **📷 Camera Overlay** — Front/back camera as background with adjustable text opacity
- **⏺ Video Recording** — Record yourself delivering your script (video + audio)
- **📜 Script Management** — Create, edit, save, delete scripts (IndexedDB)
- **▶️ Smooth Scrolling** — Adjustable speed with nudge forward/backward
- **🪞 Mirror Mode** — Flip text for beam-splitter setups
- **🌙/☀️ Dark/Light Mode** — Toggle themes
- **⚙️ Full Customization** — Font, size, line height, width, margins, opacity, guide line
- **📱 PWA** — Installable on iOS & Android, works offline
- **🔗 Install Page** — Shareable link with step-by-step install instructions

## Install

Share this link: **`goteleprompter.netlify.app/install`**

## Controls

| Action | Touch | Keyboard |
|--------|-------|----------|
| Play/Pause | Double-tap | Space |
| Nudge forward | ⏩ button | Arrow Down/Right |
| Nudge backward | ⏪ button | Arrow Up/Left |
| Reset | ⏮ button | R |
| Mirror | 🪞 button | M |
| Camera | 📷 button | C |

## Tech Stack

- Single HTML file, zero dependencies
- IndexedDB + localStorage for persistence
- MediaRecorder API for video capture
- Service Worker for offline PWA
- Netlify for hosting

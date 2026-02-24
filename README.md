# WOTG Teleprompter

A mobile-first teleprompter web app for sermon delivery and presentations.

## Features

- **📜 Script Management** — Create, edit, save, delete scripts (IndexedDB browser database)
- **▶️ Smooth Scrolling** — Adjustable speed (0.5x to 20x) with play/pause
- **🪞 Mirror Mode** — Flip text horizontally for beam-splitter teleprompter setups
- **🌙/☀️ Dark/Light Mode** — Toggle themes instantly
- **⚙️ Full Customization** — Font size, family, line height, text width, margins, colors
- **📏 Guide Line** — Adjustable reading position guide
- **📱 Mobile First** — Touch gestures, responsive design
- **⌨️ Keyboard Shortcuts** — Space (play/pause), Arrow keys (speed), M (mirror), R (reset)
- **💾 Persistent Storage** — All scripts and settings saved in browser (IndexedDB + localStorage)
- **🚀 Netlify Ready** — Static HTML, zero dependencies, instant deploy

## Controls

| Action | Touch | Keyboard |
|--------|-------|----------|
| Play/Pause | Double-tap screen | Spacebar |
| Manual scroll | Swipe up/down | Mouse wheel |
| Speed up | ⏩ button | Arrow Up |
| Speed down | ⏪ button | Arrow Down |
| Reset | ⏮ button | R |
| Mirror toggle | 🪞 button | M |

## Deploy to Netlify

1. Push to GitHub
2. Connect repo in Netlify
3. Build command: (leave empty)
4. Publish directory: `/`
5. Deploy!

## Tech Stack

- HTML/CSS/JavaScript (single file, no dependencies)
- IndexedDB for script storage
- localStorage for settings
- Netlify for hosting

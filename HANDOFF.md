# HANDOFF — WOTG Teleprompter

## Studio-quality audio + 1080p (added Nov 21, 2026)

**Problem:** recordings had thin, quiet, mono sound. The app asked the browser for a
plain mic (`audio: true`), which turns on "phone call" processing (echo cancel, noise
gate, auto volume) and records mono at a low bitrate. Video was capped at 720p.

**Now (matches the OBS setup):**
- Mic opened with echo cancel / noise suppression / auto gain **off**, 48 kHz, stereo.
- Sound goes through a small Web Audio chain: Mic Boost (default +6 dB) → compressor
  → stereo output (a mono mic is copied to both left and right).
- Audio recorded at 192 kbps (`REC_AUDIO_BPS`).
- Camera asks for 1920×1080 at 30 fps; video bitrate 8 Mbps (`REC_VIDEO_BPS`) ≈ 3.6 GB/hour.
- New Settings: **Microphone** (pick Yeti etc., saved as `tp_mic`) and **Mic Boost**
  (Off / +3 / +6 / +9 / +12 dB, saved as `tp_mic_boost`).
- Service worker cache bumped to `wotg-tp-v7` so phones pick up the update.
- **Save folder (computer only, Chrome/Edge):** Settings → "Save videos to" → 📁 pick a
  folder (Mike uses `/Volumes/Wotg Drive Mike/Raw Videos`, same as OBS). The folder is
  remembered (IndexedDB `tp-fs`); Chrome may ask "Allow" once per session when Record is
  pressed. If no folder/permission, it falls back to the normal download to Downloads.
  Only used when "Send to server" is off. Not shown on iPhone (Safari can't do this).
  Cache bumped to `wotg-tp-v8`.
- **OBS-style sound chain (v10):** Noise Removal (RNNoise, same engine as OBS) → Mic Boost
  → compressor → limiter at -1 dB → stereo. RNNoise files are vendored in `vendor/noise/`
  (from npm `@sapphi-red/web-noise-suppressor` 0.4.1, MIT). Settings → **Noise Removal**
  On/Off (`tp_noise`). If RNNoise fails to load, recording continues without it.
- **v11:** Mouse click / Magic Mouse tap on the text = play/pause (mouse only; phone keeps
  double-tap). First Record on a computer with no save folder opens the folder picker once.
  Best launched as a bare app window via `/Volumes/Wotg Drive Mike/obs/Open Teleprompter.command`
  (`Chrome --app=...`, no tabs/address bar). Toolbar ⛶ button (v12): in a tab it reopens
  the app in a small pop-up window (no tabs); in its own window it toggles full screen.
- **v13 Voice follow (🎤 button / V key):** browser speech recognition (Chrome/Safari, needs
  internet) listens while you read; the script is split into word spans (`renderScriptWords`),
  the last ~6 heard words are matched (typo-tolerant) against the next ~80 script words
  (`locateSpoken`), and the text glides so the current word sits on the blue line. Read words
  dim. Play/pause (Space, mouse tap, clicker) pauses listening. Language: Settings →
  "Voice follow language" Auto/Filipino/English (`tp_voice_lang`).
- **v17:** stricter voice matching — the last word heard must equal the script word it lands
  on (fixes jumping from "lindol" to the 2nd "sakuna"); skipped/misheard words cost points;
  search window 40 words; jumps > 6 words ahead need 3 matches.
- **v16:** voice follow order = read → gray → move up. Words gray only after heard; the text
  moves only when the last word of a line is heard (next line then glides onto the blue line).
  Big forward jumps (>12 words) need 3 matching words (scripts repeat phrases).
- **v14:** while voice follow is on, nothing else moves the text: auto-scroll can't start,
  mouse wheel / Magic Mouse swipes and touch drags are ignored; clicker up/down jumps a
  line and re-syncs voice follow to that spot (`voiceNudge`).
- **v13 Reading line at the top:** default Guide 15% / Top Margin 15% (v15, lowered a bit), one-time migration
  (`tp_guide_top` = '2'); `placeGuide()` keeps the blue line just below the toolbar (or at the very
  top when the toolbar is hidden with H).
- **Recording protection (v9):**
  - Pieces saved every 4 s to the device's storage are now kept as a backup for 2 days
    after the file is saved/downloaded (`savedAt` on the session), instead of deleted.
  - If the app/computer crashes mid-recording, reopening shows "recording was rescued —
    tap here to save it" (asks folder permission on that tap, then saves).
  - Camera or mic unplugged → recording stops cleanly and saves what was recorded.
  - Closing/reloading the app while recording shows a "Leave site?" warning.

## Live-save recordings to the server (added Nov 14, 2026)

**Problem:** the app kept the whole video in the iPhone's memory until Stop. A 1-hour
recording (several GB) would crash Safari and the video would be lost.

**Now:** every 4 seconds the recorder produces a small piece of video. Each piece is
1. saved to the phone's storage (IndexedDB, not memory), then
2. uploaded to the Ryzen box. Once the server confirms it, the phone copy is deleted.
3. On Stop, the server joins all pieces into one MP4.

If Wi-Fi drops, pieces wait on the phone and upload when the connection is back —
even if the app was closed and reopened. Tested with a simulated Wi-Fi drop mid-recording.

Other changes in the same update:
- Records MP4 first (plays on iPhone/Windows/editors); the old code named every file `.webm`.
- Bitrate fixed at ~5 Mbps → about 2.3 GB per hour of video.
- Screen is kept awake while recording (screen lock would stop the recording on iPhone).
- The app no longer auto-reloads for updates during a recording or upload.
- Service worker no longer touches requests to other sites (cache version bumped to v6).
- Timer shows hours (1:02:15).
- Settings → "☁️ Save Recordings to Server": on/off, server address, access code,
  Test connection, 🎬 My recordings.

## Server (Ryzen box, `aistaff`)

| What | Where |
|---|---|
| Code (copy kept here in `server/server.js`) | `/srv/apps/teleprompter-recorder/server.js` |
| Settings + access code | `/srv/apps/teleprompter-recorder/.env` (`TP_TOKEN`, `REC_DIR`, `PORT=9470`) |
| Videos | `/home/mike/teleprompter-recordings/` (unfinished pieces in `.incoming/`) |
| Service | `systemctl --user status teleprompter-recorder` |
| Tunnel | `systemctl --user status cloudflared-teleprompter-recorder` — config `~/.cloudflared/teleprompter-recorder.yml`, tunnel id `70b2eb69-3061-4705-9eba-aa01688d3f02` |
| Public address | https://teleprompter.marga.biz |
| Recordings page | `https://teleprompter.marga.biz/?token=<access code>` |

Endpoints: `PUT /chunk?id&seq`, `GET /status?id`, `POST /finish?id&total&ext&name`,
`GET /recordings`, `GET /recordings/<file>`, `GET /health`. All except `/health` need the
access code in header `X-TP-Token` (or `?token=`).

To update the server: copy `server/server.js` to the Ryzen path above, then
`systemctl --user restart teleprompter-recorder`.

## Known limits / to-do
- Videos are on the Ryzen's main (system) drive for now (681 GB free on Nov 14). Move
  `REC_DIR` to the Wotg Sept02 drive or the Synology once that's mounted.
- Not part of the Bosgame continuity mirror — if the Ryzen is down, recordings fall back
  to waiting on the phone until it's back.
- iPhone: the app must stay open on screen while recording (iOS stops the camera in the background).
- Stray DNS record `rec.aistaff.click.marga.biz` was created by mistake — delete it in Cloudflare.

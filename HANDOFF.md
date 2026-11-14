# HANDOFF — WOTG Teleprompter

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

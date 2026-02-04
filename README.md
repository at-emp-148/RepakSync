# Steam Syncer

Electron app that detects local games and adds them to Steam as Non‑Steam Games, with optional SteamGridDB artwork.

## Features
- Auto sync on app launch
- Tray icon with quick actions
- Watches for Steam launch and syncs before relaunching Steam
- Scan custom folders plus known store folders (Epic, GOG)
- Optional artwork download via SteamGridDB API

## Setup
1. Install Node.js 18+ and npm.
2. Install dependencies:
   - `npm install`
3. Build TS:
   - `npm run build`
4. Start app:
   - `npm start`

## Notes
- Steam must be closed to update `shortcuts.vdf`. The app will close and relaunch it when needed.
- Add your SteamGridDB API key in the UI under Artwork.
- Tray icon expects `assets/tray.png`. Replace with your own 16-32px PNG.

## Roadmap
- Better detection per store manifests
- More artwork types (hero, logo)
- Per‑game confirmation before adding
- Cross‑platform support for macOS/Linux paths and Steam locations

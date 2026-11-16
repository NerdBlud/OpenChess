# OpenChess

**Rook Edition · version 1.5.** Start with the [feature overview](../README.md) or see the [Game Review preview](media/game-review.png). Advanced controls live under Lines, Settings, and Tools.

If OpenChess is already installed, reload the extension from your browser's extensions/developer page, then refresh Chess.com to replace the existing overlay.

A free, local Chess.com analysis extension, written independently of ChessAssist. No login, payment checks, premium features, telemetry or analysis server. Source is included and licensed GPL-3.0-or-later. Stockfish and chess.js retain their respective licenses.

## Install

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on**.
3. Select `dist/firefox/manifest.json` in this folder.
4. Open or refresh a Chess.com board.

This is a temporary developer installation: Firefox removes it when restarted. A permanent installation in standard Firefox requires Mozilla signing; this project has not been submitted or signed. This build does not use a background service worker, so it avoids the original extension's `background.service_worker is currently disabled` error. It targets Firefox 128 or newer, but Firefox runtime compatibility has not been tested here.

### Chrome / Chromium / Edge

1. Open the browser's extensions page and enable **Developer mode**.
2. Choose **Load unpacked** and select the `dist/chrome` folder.
3. Open or refresh a Chess.com board.

Disable ChessAssist while testing to avoid competing overlays and move controls.

## Features

- Local Stockfish 19: **Lite** for lower memory use, or the **full neural-network engine** for stronger analysis. Both are included and free.
- Automatic position updates, colored arrows on the actual Chess.com board, and white-positive evaluation. There is no duplicate board inside the extension.
- One, three or five principal variations, rendered in chess notation.
- Analysis time from 0.25 to 10 seconds. New installations default to 0.5 seconds and one candidate line; existing saved time/line preferences are retained.
- Twelve strength presets affect the suggested/played move and corresponding arrow color. Presets below 1320 are approximate beginner styles; higher rated presets use native engine targets. None are calibrated Chess.com ratings.
- **Play move** and optional automatic play follow the chosen strength, with a configurable delay. Automatic play resets to Off when the panel opens. Stale positions and unavailable move controls are rejected.
- Pause/resume, hide arrows, and collapse the overlay with its OpenChess launcher, close button, or Escape.
- Paste a full FEN, copy the current FEN, and export analysis as JSON.
- A linked standalone analysis window through **Tools → Separate window**. It mirrors the source results without starting another engine. It cannot play moves or change the source's settings.
- No backend or account dependency. After installation the engine works offline; Chess.com itself still needs its normal connection.

The browser toolbar popup is a standalone FEN-analysis panel. The overlay on the Chess.com page is the panel that follows that page's board.

## Small screens

The overlay starts collapsed on narrow screens or coarse-pointer devices, so it does not cover the board. The launcher displays the suggested move. Tapping it opens a bottom sheet; the close button or launcher collapses it. Primary controls are at least 44px tall, settings scroll within the sheet, and the layout adapts to portrait and short landscape viewports.

Responsive viewport tests passed at 320×568, 390×844 and 740×360 in Chromium. These are layout/interaction tests, not verification on physical phones or every mobile browser. Installing the extension still requires a browser with compatible extension support.

Routine success messages are suppressed. A spinner on Analyze indicates work in progress; errors, missing-position notices and requested feedback such as copying a FEN remain visible when useful.

## Strength presets

| Preset | Engine target | Arrow color |
| --- | --- | --- |
| Starter | ≈300 beginner style | Sage |
| Learner | ≈500 beginner style | Soft green |
| Rookie | ≈700 beginner style | Seafoam |
| Challenger | ≈1000 beginner style | Turquoise |
| Apprentice | 1320 | Mint |
| Club | 1500 | Cyan |
| Tactician | 1800 | Blue |
| Expert | 2100 | Violet |
| Master | 2400 | Gold |
| Grandmaster | 2700 | Orange |
| Elite | 3000 | Rose |
| Unbound | Unrestricted | Crimson |

Selecting a rated preset enables `UCI_LimitStrength` and sets `UCI_Elo`; Unbound disables the limit. The included engines advertise a supported Elo range of 1320–3190. Hardware, think time and engine model affect actual strength. The suggested move/arrow follows the limited-strength `bestmove`; candidate lines and the position evaluation describe the engine's strongest continuations, which may differ. See the [official Stockfish FAQ](https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html) for the strength controls.

For the four sub-1320 styles, the engine runs at its supported minimum of 1320. A separate legal-move policy replaces that recommendation with another uniformly sampled legal move with probability 85%, 65%, 45%, or 20% respectively. Suggestions, arrows, manual play and auto-play all use this selected move. Promotion, check and en-passant legality are handled by chess.js. The labels are uncalibrated difficulty approximations, not measured ratings or a model of human play; random alternatives can occasionally be better than the baseline move. Native target settings are never sent values below 1320.

## Performance changes

- Default think budget reduced from 1500 to 500 ms, and default candidate count from three to one. These are work-budget reductions, not a guaranteed wall-clock speedup.
- Engine hash reduced from 32 to 16 MiB; the neural-network/model memory is additional.
- Rapid engine updates are coalesced before expensive notation conversion (at most one batch every 80 ms, plus the final flush). A test verifies 100 queued updates produce one latest variation.
- UI updates are batched and unchanged lines are not replaced. The duplicate-board renderer and its SVG assets have been removed.
- Piece mutations drive board scans; a 1.5-second discovery check handles absent or replaced boards instead of rescanning all pieces every 350 ms.
- The detached window mirrors the source over a local BroadcastChannel; it launches no second engine worker.

## Reading the board

The page adapter first tries the board's current FEN API. When that is available, move execution validates the exact current position and matches a move in the site's legal-move list before requesting it.

If FEN is unavailable, a DOM tracker can follow legal moves from the standard starting position. It preserves turn, castling and en-passant state through chess.js. It does not invent missing history for an arbitrary midgame board. In that situation, paste a complete FEN or start from a recognized initial position. DOM-only tracking does not enable automatic moves.

The page adapter is isolated in `src/bridge.js`; Chess.com's private page interface may change. The extension is for standard chess and does not claim support for every variant, every Chess.com page or every multiplayer mode.

## Build and test

Node.js and npm are required to rebuild; the built extension folders are already included.

```sh
npm ci
npm run build
npm test
npx playwright install chromium
npm run test:browser
```

`npm run check` runs build, unit tests and browser tests. The browser integration test loads the actual unpacked Chromium extension and real WASM engines against a simulated Chess.com board; it does not play a live game.

## Verification performed

- Thirteen core/engine tests pass, including beginner policy legality, terminal positions, supported strength commands, update coalescing and stale-search cancellation.
- Real Chromium extension integration passes: actual lite and full WASM engines, exact-board connection, legal automatic move submission, following a position update, pause, invalid-FEN feedback, and a linked detached analysis window.
- All twelve presets were exercised with real engine searches and their actual page-arrow colors checked. Completed analysis has zero idle line-DOM mutations in the one-second check; the detached window has zero engine workers.
- A separate read-only check on Chess.com's current computer-play page confirmed the board API and successful local analysis. No move was played in that live-site check.

Firefox has not been run here. Live move execution was tested on the simulated adapter, not a live Chess.com game. This is a working first version, not verified feature-for-feature parity with ChessAssist: it does not recreate Maia personalities, multiple proprietary engines, cloud services or all of its streamer features.

## Source map

| File | Responsibility |
| --- | --- |
| `src/bridge.js` | Main-world Chess.com FEN and move adapter |
| `src/content.js` | Isolated overlay, DOM tracking and board arrows |
| `src/core.js` | Position validation, UCI score parsing and chess rules |
| `src/engine.js` | Local UCI worker lifecycle, search cancellation and queueing |
| `src/panel.js` | Analysis interface, settings, automatic move scheduling and detached window |
| `scripts/build.mjs` | Separate Chrome and Firefox manifests and bundles |
| `tests/` | Core and real-extension integration tests |

The full Stockfish network is about 99 MB, so each browser build is approximately 100 MB. Lite is the default and the full network loads only when selected. No compiled ChessAssist code, binaries, branding or backend keys are included.

See `THIRD_PARTY.md` for engine source, license and build information.

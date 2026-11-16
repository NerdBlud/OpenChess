# Licenses and corresponding source

OpenChess's newly written source is GPL-3.0-or-later; the GPL text is in `LICENSE`.

## Stockfish.js 19.0.1

The extension contains unmodified `stockfish-19-lite-single.js/.wasm` and `stockfish-19-single.js/.wasm` from the pinned npm package `stockfish@19.0.1`. These are GPL-3.0 engine builds by the Stockfish team, Nathan Rugg and contributors.

- Exact upstream release: https://github.com/nmrugg/stockfish.js/tree/v19.0.1
- Source archive included: `third_party/stockfish-v19.0.1-source.tar.gz`
- Upstream build instructions and required neural-network downloads: the README and build scripts in that source archive.
- Engine license: `LICENSE` and `dist/*/licenses/Stockfish-GPL-3.0.txt`.

Reinstalling the pinned npm package restores the same prebuilt engine files. The included archive is upstream engine source, not the generated WebAssembly binary or the Emscripten toolchain. Upstream build scripts fetch any required network assets; preserve the corresponding-source and license information if redistributing builds.

## chess.js 1.4.0

Chess rules, FEN validation and notation conversion use `chess.js@1.4.0`, under BSD-2-Clause.

- Source: https://github.com/jhlywa/chess.js
- License included in each build under `licenses/chess.js-BSD-2-Clause.txt`.
- The dependency is pinned in `package-lock.json`.

esbuild and Playwright are development dependencies, not runtime cloud services.

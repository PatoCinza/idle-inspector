# Building the extension

The extension is bundled with esbuild (bundled, not minified). To reproduce the Firefox package submitted to addons.mozilla.org from this source:

Requirements: Node.js 22 or newer and npm 10 or newer. Any OS works; esbuild produces the same output on macOS and Linux.

```sh
npm ci
npm run build:ext
```

The Firefox package is the content of `dist/extension/firefox/` (the Chrome build goes to `dist/extension/chrome/`).

- Entry points, listed in `scripts/build-extension.js`: `extension/page/hook.js`, `extension/content/index.js`, `extension/background.js` and `extension/options/options.js`. Each one is bundled into a single file with the code it imports from `src/`.
- `data/game.json` (game tables extracted from the public game client) is bundled into `content.js`.
- The item icons in `site/img/items/` are copied as they are.
- The manifest is `extension/manifest.json`, with the per-browser fields added by `scripts/build-extension.js`.

`npm run package:ext` runs the same build and writes the release files to `dist/release/`: the Firefox package, the Chrome/Opera zip (the Chrome build, which Opera also loads) and this source archive.

// Builds the non-popup extension entry points (background service worker,
// content script, and the DevTools panel/entry) into dist/, which Vite does NOT
// build (vite.config only has popup/index.html as an input). Run after
// `vite build` (see package.json).
//
// Uses the esbuild that ships with Vite, so no extra dependency is added.
import esbuild from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outDir = resolve(root, 'dist');

const entries = [
  { src: 'background.ts', out: 'background.js', format: 'esm' },
  { src: 'content-script.ts', out: 'content-script.js', format: 'iife' },
  // P1.5-2: the DevTools history panel. manifest.json's `devtools_page` points
  // at devtools/index.html, which loads devtools.ts (creates the panel pointing
  // at devtools/panel.html), which loads panel.tsx (the React UI). Chrome can't
  // load .ts/.tsx as ES modules, so both are bundled into dist/devtools/ and the
  // HTML refs are rewritten to the built .js.
  { src: 'devtools/devtools.ts', out: 'devtools/devtools.js', format: 'esm' },
  { src: 'devtools/panel.tsx', out: 'devtools/panel.js', format: 'esm' },
];

// NOTE: do NOT `rm -rf dist` here — vite build already wrote the popup into
// dist/ (popup/, assets/) and we run AFTER it. We only add the workers + static
// assets, overwriting any stale copies.
await mkdir(outDir, { recursive: true });

for (const entry of entries) {
  await mkdir(resolve(outDir, dirname(entry.out)), { recursive: true });
  await esbuild.build({
    entryPoints: [resolve(root, entry.src)],
    bundle: true,
    format: entry.format,
    target: ['chrome110'],
    platform: 'browser',
    outfile: resolve(outDir, entry.out),
    // sourcemap: true, // enable if you need to debug the workers
    logLevel: 'info',
  });
  console.log(`built ${entry.out}`);
}

// Copy manifest + icons into dist/ so dist/ is a loadable unpacked extension.
await copyFile(resolve(root, 'manifest.json'), resolve(outDir, 'manifest.json'));
await mkdir(resolve(outDir, 'icons'), { recursive: true });
await copyFile(resolve(root, 'icons', 'icon.svg'), resolve(outDir, 'icons', 'icon.svg'));

// P1.5-2: copy the DevTools HTML entry points into dist/devtools/, rewriting
// the .ts/.tsx script refs to the bundled .js the build just produced. (Chrome
// loads devtools_page relative to the extension root, which is dist/ for a
// built unpacked ext.)
async function copyDevtoolsHtml(srcName) {
  const src = resolve(root, 'devtools', srcName);
  const html = (await readFile(src, 'utf-8'))
    .replace('./devtools.ts', './devtools.js')
    .replace('./panel.tsx', './panel.js');
  await writeFile(resolve(outDir, 'devtools', srcName), html);
}
await copyDevtoolsHtml('index.html');
await copyDevtoolsHtml('panel.html');

// Vite writes the popup to dist/popup and dist/assets; this script only handles
// the workers + static assets. The npm build script runs vite first, then this.
console.log('workers + assets built into dist/');

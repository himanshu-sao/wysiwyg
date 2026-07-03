// Builds the non-popup extension entry points (background service worker and
// content script) into dist/, which Vite does NOT build (vite.config only has
// popup/index.html as an input). Run after `vite build` (see package.json).
//
// Uses the esbuild that ships with Vite, so no extra dependency is added.
import esbuild from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outDir = resolve(root, 'dist');

const entries = [
  { src: 'background.ts', out: 'background.js', format: 'esm' },
  { src: 'content-script.ts', out: 'content-script.js', format: 'iife' },
];

// NOTE: do NOT `rm -rf dist` here — vite build already wrote the popup into
// dist/ (popup/, assets/) and we run AFTER it. We only add the workers + static
// assets, overwriting any stale copies.
await mkdir(outDir, { recursive: true });

for (const entry of entries) {
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

// Vite writes the popup to dist/popup and dist/assets; this script only handles
// the workers + static assets. The npm build script runs vite first, then this.
console.log('workers + assets built into dist/');

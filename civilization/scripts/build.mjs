/**
 * Zero-dependency bundler: compiles modular ES source files + CSS into a single self-contained HTML file
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const moduleOrder = [
  'src/constants.js',
  'src/hex.js',
  'src/mapgen.js',
  'src/engine.js',
  'src/ai.js',
  'src/audio.js',
  'src/renderer.js',
  'src/main.js',
];

function stripModuleSyntax(code) {
  return code
    // Remove multi-line or single-line import statements
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    // Convert `export class/function/const/let/var` to plain declarations
    .replace(/^export\s+(?=(?:class|function|const|let|var)\s)/gm, '');
}

const css = fs.readFileSync(path.join(rootDir, 'styles/main.css'), 'utf8');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

const bundledJs = [
  '(function () {',
  "  'use strict';",
  ...moduleOrder.map(rel => {
    const raw = fs.readFileSync(path.join(rootDir, rel), 'utf8');
    return `\n  // ===== ${rel} =====\n` + stripModuleSyntax(raw);
  }),
  '})();',
].join('\n');

const outputHtml = html
  .replace('<link rel="stylesheet" href="styles/main.css" />', `<style>\n${css}\n  </style>`)
  .replace('<script type="module" src="src/main.js"></script>', `<script>\n${bundledJs}\n  </script>`);

const distDir = path.join(rootDir, 'dist');
fs.mkdirSync(distDir, { recursive: true });
const distFile = path.join(distDir, 'web-civilization.html');
fs.writeFileSync(distFile, outputHtml, 'utf8');

console.log(`Built standalone HTML: ${distFile} (${(Buffer.byteLength(outputHtml) / 1024).toFixed(1)} KB)`);

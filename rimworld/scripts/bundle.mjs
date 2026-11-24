/**
 * Zero-dependency bundler that compiles the modular ES source files + styles.css
 * into a single self-contained playable HTML file for Canvas preview & offline distribution.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const moduleOrder = [
  'src/constants.js',
  'src/mapGen.js',
  'src/pathfinding.js',
  'src/colonists.js',
  'src/ai.js',
  'src/simulation.js',
  'src/audio.js',
  'src/renderer.js',
  'src/main.js',
];

function stripModuleSyntax(code) {
  return code
    // Remove multi-line or single-line import statements
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    // Replace export keywords while preserving declarations
    .replace(/^\s*export\s+(?=(const|let|var|function|class)\b)/gm, '');
}

const css = fs.readFileSync(path.join(rootDir, 'styles.css'), 'utf8');
const htmlTemplate = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

const bundledJs = [
  '(function() {',
  '  "use strict";',
  ...moduleOrder.map((relPath) => {
    const raw = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
    return `\n// ===== ${relPath} =====\n${stripModuleSyntax(raw)}`;
  }),
  '})();',
].join('\n');

const finalHtml = htmlTemplate
  .replace(
    '<link rel="stylesheet" href="./styles.css" />',
    `<style>\n${css}\n  </style>`
  )
  .replace(
    '<script type="module" src="./src/main.js"></script>',
    `<script>\n${bundledJs}\n  </script>`
  );

// Write to project dist/ and workspace output/
const distDir = path.join(rootDir, 'dist');
fs.mkdirSync(distDir, { recursive: true });
const distOut = path.join(distDir, 'web-rimworld.html');
fs.writeFileSync(distOut, finalHtml, 'utf8');

const workspaceOutDir = path.resolve(rootDir, '../../output');
fs.mkdirSync(workspaceOutDir, { recursive: true });
const workspaceOut = path.join(workspaceOutDir, 'web-rimworld.html');
fs.writeFileSync(workspaceOut, finalHtml, 'utf8');

console.log(`Bundled standalone HTML -> ${distOut} (${finalHtml.length} bytes)`);
console.log(`Copied Canvas deliverable -> ${workspaceOut}`);

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const moduleOrder = [
  'src/engine/constants.js',
  'src/engine/chart.js',
  'src/engine/judge.js',
  'src/data/songs.js',
  'src/engine/audio.js',
  'src/engine/renderer.js',
  'src/ui/app.js',
];

function stripModuleSyntax(code) {
  return code
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/\bexport\s+(?=(?:const|let|var|function|class)\b)/g, '');
}

const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const bundledJs = [
  '(function () {',
  '  "use strict";',
  ...moduleOrder.map((rel) => {
    const content = fs.readFileSync(path.join(root, rel), 'utf8');
    return `\n  // ===== ${rel} =====\n${stripModuleSyntax(content)}`;
  }),
  '})();',
].join('\n');

const standaloneHtml = html
  .replace('<link rel="stylesheet" href="./src/styles.css" />', `<style>\n${css}\n  </style>`)
  .replace('<script type="module" src="./src/ui/app.js"></script>', `<script>\n${bundledJs}\n  </script>`);

const distDir = path.join(root, 'dist');
fs.mkdirSync(distDir, { recursive: true });
const outFile = path.join(distDir, 'taiko-standalone.html');
fs.writeFileSync(outFile, standaloneHtml, 'utf8');

console.log(`Built standalone bundle: ${outFile} (${standaloneHtml.length} bytes)`);

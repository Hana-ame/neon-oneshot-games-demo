import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

const moduleOrder = [
  'constants.js',
  'rng.js',
  'items.js',
  'dungeon.js',
  'entities.js',
  'engine.js',
  'audio.js',
  'renderer.js',
  'main.js'
];

function stripModuleSyntax(code) {
  return code
    // Remove import blocks (single-line or multi-line)
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    // Convert `export const/let/var/function/class` to plain declarations
    .replace(/^export\s+(?=(const|let|var|function|class)\b)/gm, '');
}

const bundledJs = moduleOrder
  .map((file) => {
    const raw = fs.readFileSync(path.join(srcDir, file), 'utf8');
    return `// ===== ${file} =====\n${stripModuleSyntax(raw)}`;
  })
  .join('\n\n');

const htmlTemplate = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const standaloneHtml = htmlTemplate.replace(
  '<script type="module" src="./src/main.js"></script>',
  `<script>\n(function() {\n'use strict';\n${bundledJs}\n})();\n</script>`
);

const distDir = path.join(rootDir, 'dist');
fs.mkdirSync(distDir, { recursive: true });
const distOut = path.join(distDir, 'isaac-standalone.html');
fs.writeFileSync(distOut, standaloneHtml, 'utf8');

// Also write to final Canvas output directory if present
const canvasOut = path.resolve(rootDir, '../../output/isaac-web-game.html');
fs.mkdirSync(path.dirname(canvasOut), { recursive: true });
fs.writeFileSync(canvasOut, standaloneHtml, 'utf8');

console.log(`Built standalone HTML (${standaloneHtml.length} bytes):`);
console.log(` - ${distOut}`);
console.log(` - ${canvasOut}`);

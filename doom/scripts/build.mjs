import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const MODULE_ORDER = [
  'src/constants.js',
  'src/math.js',
  'src/levels.js',
  'src/entities.js',
  'src/audio.js',
  'src/textures.js',
  'src/engine.js',
  'src/renderer.js',
  'src/main.js',
];

function stripModuleSyntax(code, relPath) {
  // Remove static import lines (single-line and multi-line)
  let cleaned = code.replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '');
  // Strip leading `export ` keyword on declarations
  cleaned = cleaned.replace(/^export\s+(?=(const|let|var|function|class)\b)/gm, '');
  return `// === ${relPath} ===\n${cleaned.trim()}\n`;
}

export function buildSingleFileBundle() {
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const bundledParts = MODULE_ORDER.map((rel) => {
    const abs = path.join(ROOT, rel);
    return stripModuleSyntax(fs.readFileSync(abs, 'utf8'), rel);
  });

  const iife = `<script>\n(function () {\n'use strict';\n\n${bundledParts.join('\n')}\n})();\n</script>`;
  const scriptTagRegex = /<script\s+type="module"\s+src="\.\/src\/main\.js"><\/script>/;
  if (!scriptTagRegex.test(indexHtml)) {
    throw new Error('Could not find <script type="module" src="./src/main.js"></script> in index.html');
  }

  const outHtml = indexHtml.replace(scriptTagRegex, () => iife);
  const distDir = path.join(ROOT, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const distPath = path.join(distDir, 'web-doom.html');
  fs.writeFileSync(distPath, outHtml, 'utf8');
  return { distPath, bytes: Buffer.byteLength(outHtml, 'utf8') };
}

if (process.argv[1] === __filename) {
  const result = buildSingleFileBundle();
  console.log(`Built ${result.distPath} (${result.bytes} bytes)`);
}

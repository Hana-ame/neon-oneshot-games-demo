// Zero-dependency bundler: combines index.html + main.css + ES modules into a single standalone HTML file.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const moduleOrder = [
  'src/engine/math.js',
  'src/engine/audio.js',
  'src/game/constants.js',
  'src/game/dungeon.js',
  'src/game/gameEngine.js',
  'src/game/renderer.js',
  'src/main.js'
];

function stripModuleSyntax(code) {
  // Remove import statements (single-line and multi-line)
  let out = code.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '');
  // Replace export declarations with plain declarations
  out = out.replace(/^export\s+(?=(?:function|class|const|let|var)\s)/gm, '');
  return out.trim();
}

const htmlTemplate = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const cssContent = fs.readFileSync(path.join(rootDir, 'src/styles/main.css'), 'utf8');

const bundledJsParts = moduleOrder.map((relPath) => {
  const raw = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
  return `// ===== ${relPath} =====\n${stripModuleSyntax(raw)}`;
});

const bundledJs = `(() => {\n'use strict';\n\n${bundledJsParts.join('\n\n')}\n})();`;

let standaloneHtml = htmlTemplate.replace(
  '<link rel="stylesheet" href="src/styles/main.css" />',
  `<style>\n${cssContent}\n  </style>`
);

standaloneHtml = standaloneHtml.replace(
  '<script type="module" src="src/main.js"></script>',
  `<script>\n${bundledJs}\n  </script>`
);

const standaloneDir = path.join(rootDir, 'standalone');
fs.mkdirSync(standaloneDir, { recursive: true });
const standalonePath = path.join(standaloneDir, 'bullet-dungeon.html');
fs.writeFileSync(standalonePath, standaloneHtml, 'utf8');

console.log(`Built standalone HTML: ${standalonePath} (${standaloneHtml.length} bytes)`);

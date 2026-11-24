// Zero-dependency bundler: compiles modular ES source files + index.html into a single self-contained HTML5 game.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const MODULE_ORDER = [
  'src/constants.js',
  'src/fighters.js',
  'src/inputBuffer.js',
  'src/physics.js',
  'src/ai.js',
  'src/audio.js',
  'src/engine.js',
  'src/renderer.js',
  'src/main.js'
];

function stripModuleSyntax(code, filename) {
  let out = code;
  // Remove multi-line or single-line import statements from local modules
  out = out.replace(/^\s*import\s+[\s\S]*?from\s+['"]\.\/[^'"]+['"];?\s*$/gm, '');
  // Replace export declarations
  out = out.replace(/^\s*export\s+(?=(const|let|var|function|class)\b)/gm, '');
  return `// ===== ${filename} =====\n${out.trim()}\n`;
}

function build() {
  const htmlTemplate = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
  const bundledJs = MODULE_ORDER.map((relPath) => {
    const fullPath = path.join(projectRoot, relPath);
    const content = fs.readFileSync(fullPath, 'utf8');
    return stripModuleSyntax(content, relPath);
  }).join('\n');

  const inlineScript = `<script>\n(() => {\n'use strict';\n${bundledJs}\n})();\n</script>`;
  const finalHtml = htmlTemplate.replace(
    /<!-- BUNDLE_SCRIPT_PLACEHOLDER -->\s*<script type="module" src="\.\/src\/main\.js"><\/script>/,
    inlineScript
  );

  const distDir = path.join(projectRoot, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const distOut = path.join(distDir, 'kof_web_game.html');
  fs.writeFileSync(distOut, finalHtml, 'utf8');
  console.log(`Built single-file playable HTML: ${distOut} (${finalHtml.length} bytes)`);
}

build();

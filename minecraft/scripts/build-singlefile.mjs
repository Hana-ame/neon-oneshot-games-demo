import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const MODULE_ORDER = [
  'src/core/constants.js',
  'src/core/math.js',
  'src/core/noise.js',
  'src/world/chunk.js',
  'src/world/generator.js',
  'src/world/mesher.js',
  'src/world/world.js',
  'src/world/raycast.js',
  'src/player/physics.js',
  'src/player/inventory.js',
  'src/engine/textures.js',
  'src/engine/renderer.js',
  'src/engine/audio.js',
  'src/main.js',
];

function stripModuleSyntax(code) {
  // Remove multi-line and single-line ES import statements
  let out = code.replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '');
  // Convert `export const|let|var|function|class` to plain declarations
  out = out.replace(/^export\s+(?=(const|let|var|function|class)\b)/gm, '');
  return out.trim();
}

function build() {
  const htmlTemplate = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
  const cssContent = fs.readFileSync(path.join(projectRoot, 'styles.css'), 'utf8');

  const bundledParts = MODULE_ORDER.map((relPath) => {
    const absPath = path.join(projectRoot, relPath);
    const raw = fs.readFileSync(absPath, 'utf8');
    return `// ===== ${relPath} =====\n${stripModuleSyntax(raw)}`;
  });

  const bundledJs = `'use strict';\n(function() {\n${bundledParts.join('\n\n')}\n})();`;

  let finalHtml = htmlTemplate.replace(
    /<link\s+rel="stylesheet"\s+href="styles\.css"\s*\/?>/,
    `<style>\n${cssContent}\n</style>`
  );

  finalHtml = finalHtml.replace(
    /<script\s+type="module"\s+src="src\/main\.js"><\/script>/,
    `<script>\n${bundledJs}\n</script>`
  );

  const distDir = path.join(projectRoot, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const distFile = path.join(distDir, 'web-minecraft.html');
  fs.writeFileSync(distFile, finalHtml, 'utf8');

  const outputDir = path.resolve(projectRoot, '..', '..', 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputFile = path.join(outputDir, 'web-minecraft.html');
  fs.writeFileSync(outputFile, finalHtml, 'utf8');

  console.log(`Built single-file bundle:\n  - ${distFile} (${finalHtml.length} bytes)\n  - ${outputFile}`);
}

build();

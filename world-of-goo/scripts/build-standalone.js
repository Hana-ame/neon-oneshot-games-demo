#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const indexPath = path.join(projectRoot, 'index.html');
const standaloneDir = path.join(projectRoot, 'standalone');
const standaloneOut = path.join(standaloneDir, 'world-of-goo.html');

const scriptOrder = [
  'src/engine/math.js',
  'src/engine/physics.js',
  'src/levels/levels.js',
  'src/audio/sound.js',
  'src/engine/game.js',
  'src/ui/renderer.js',
  'src/ui/app.js'
];

function stripCommonJSBranch(code) {
  return code.replace(
    /if\s*\(typeof module === 'object' && module\.exports\)\s*\{[\s\S]*?\}\s*else\s*\{/g,
    '{'
  );
}

function build() {
  const html = fs.readFileSync(indexPath, 'utf8');
  const bundledJs = scriptOrder
    .map(rel => {
      const full = path.join(projectRoot, rel);
      const code = stripCommonJSBranch(fs.readFileSync(full, 'utf8'));
      return `/* ===== ${rel} ===== */\n${code}`;
    })
    .join('\n\n');

  const markerRegex = /<!-- BUILD_SCRIPTS_START -->[\s\S]*?<!-- BUILD_SCRIPTS_END -->/;
  if (!markerRegex.test(html)) {
    throw new Error('Missing BUILD_SCRIPTS markers in index.html');
  }

  const standaloneHtml = html.replace(
    markerRegex,
    `<script>\n${bundledJs}\n  </script>`
  );

  fs.mkdirSync(standaloneDir, { recursive: true });
  fs.writeFileSync(standaloneOut, standaloneHtml, 'utf8');
  console.log(`Built standalone HTML: ${standaloneOut} (${standaloneHtml.length} bytes)`);

  if (process.argv[2]) {
    const extraOut = path.resolve(process.argv[2]);
    fs.mkdirSync(path.dirname(extraOut), { recursive: true });
    fs.writeFileSync(extraOut, standaloneHtml, 'utf8');
    console.log(`Copied standalone HTML to: ${extraOut}`);
  }
}

build();

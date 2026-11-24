#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.join(projectRoot, 'src');
const templatePath = path.join(srcDir, 'template.html');

const modules = [
  'constants.js',
  'physics.js',
  'builder.js',
  'audio.js',
  'renderer.js',
  'app.js'
];

function stripNodeRequires(code) {
  // Replace UMD require('./...') branches with direct browser namespace access for standalone HTML bundle
  return code
    .replace(
      /typeof module !== 'undefined' && module\.exports\s*\?\s*require\('\.\/constants'\)\s*:\s*root\.KSP\.Constants/g,
      'root.KSP.Constants'
    )
    .replace(
      /typeof module !== 'undefined' && module\.exports\s*\?\s*require\('\.\/physics'\)\s*:\s*root\.KSP\.Physics/g,
      'root.KSP.Physics'
    );
}

const template = fs.readFileSync(templatePath, 'utf8');
const bundledJs = modules
  .map((file) => {
    const raw = fs.readFileSync(path.join(srcDir, file), 'utf8');
    const code = stripNodeRequires(raw);
    return `// === Module: src/${file} ===\n${code}`;
  })
  .join('\n\n');

const outputHtml = template.replace(
  '<!-- BUNDLED_SCRIPTS -->',
  `<script>\n${bundledJs}\n</script>`
);

const projectIndex = path.join(projectRoot, 'index.html');
fs.writeFileSync(projectIndex, outputHtml, 'utf8');

const canvasOutput = path.resolve(projectRoot, '../../output/kerbal-space-program.html');
fs.mkdirSync(path.dirname(canvasOutput), { recursive: true });
fs.writeFileSync(canvasOutput, outputHtml, 'utf8');

console.log(`Built self-contained bundle:\n  - ${projectIndex} (${outputHtml.length} bytes)\n  - ${canvasOutput}`);

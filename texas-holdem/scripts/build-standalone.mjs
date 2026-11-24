/**
 * build-standalone.mjs - 零依赖构建脚本
 * 将模块化 src/ (JS + CSS) 与 index.html 合并为单个离线可双击运行的 HTML 文件
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const moduleOrder = [
  'src/engine/cards.js',
  'src/engine/evaluator.js',
  'src/engine/potManager.js',
  'src/engine/gameEngine.js',
  'src/engine/aiEngine.js',
  'src/ui/sound.js',
  'src/ui/app.js',
];

function stripImportsAndExports(code) {
  return code
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*export\s+(?=(const|let|var|function|class)\b)/gm, '');
}

const css = fs.readFileSync(path.join(rootDir, 'src/ui/styles.css'), 'utf8');
const htmlTemplate = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

const bundledJs = moduleOrder
  .map((rel) => {
    const raw = fs.readFileSync(path.join(rootDir, rel), 'utf8');
    return `// ===== ${rel} =====\n${stripImportsAndExports(raw)}`;
  })
  .join('\n\n');

const standaloneHtml = htmlTemplate
  .replace(
    '<link rel="stylesheet" href="./src/ui/styles.css" />',
    `<style>\n${css}\n  </style>`
  )
  .replace(
    '<script type="module" src="./src/ui/app.js"></script>',
    `<script>\n(function () {\n'use strict';\n${bundledJs}\n})();\n  </script>`
  );

const outProjectFile = path.join(rootDir, 'texas-holdem-standalone.html');
fs.writeFileSync(outProjectFile, standaloneHtml, 'utf8');
console.log(`Built standalone HTML: ${outProjectFile} (${standaloneHtml.length} bytes)`);

// 若传入输出路径参数，同时复制一份
if (process.argv[2]) {
  const extraOut = path.resolve(process.argv[2]);
  fs.mkdirSync(path.dirname(extraOut), { recursive: true });
  fs.writeFileSync(extraOut, standaloneHtml, 'utf8');
  console.log(`Copied standalone HTML to: ${extraOut}`);
}

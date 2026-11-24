#!/usr/bin/env node
/**
 * 零依赖单文件构建脚本
 * 将 index.html、styles/main.css 与 src/*.js 按依赖拓扑顺序内联打包为单个独立 HTML 文件
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const moduleOrder = [
  'src/config.js',
  'src/math.js',
  'src/audio.js',
  'src/engine.js',
  'src/renderer.js',
  'src/main.js',
];

function stripModuleSyntax(code) {
  return code
    // 移除相对路径的 import 语句（含多行 import）
    .replace(/^import\s+[\s\S]*?from\s+['"]\.\/[^'"]+['"];?\s*$/gm, '')
    // 移除 export 关键字
    .replace(/^export\s+(const|let|var|function|class)\s+/gm, '$1 ');
}

function build() {
  const htmlTemplate = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const cssContent = fs.readFileSync(path.join(rootDir, 'styles/main.css'), 'utf8');

  const bundledJs = moduleOrder
    .map((rel) => {
      const raw = fs.readFileSync(path.join(rootDir, rel), 'utf8');
      return `// ===== ${rel} =====\n${stripModuleSyntax(raw).trim()}`;
    })
    .join('\n\n');

  const wrappedJs = `(function () {\n'use strict';\n\n${bundledJs}\n})();`;

  let outputHtml = htmlTemplate
    .replace(
      /<link\s+rel="stylesheet"\s+href="\.\/styles\/main\.css"\s*\/?>/,
      `<style>\n${cssContent}\n  </style>`
    )
    .replace(
      /<script\s+type="module"\s+src="\.\/src\/main\.js"><\/script>/,
      `<script>\n${wrappedJs}\n  </script>`
    );

  const distDir = path.join(rootDir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const outPath = path.join(distDir, 'vampire-survivors.html');
  fs.writeFileSync(outPath, outputHtml, 'utf8');

  const sizeKb = (Buffer.byteLength(outputHtml, 'utf8') / 1024).toFixed(1);
  console.log(`[build] Generated single-file bundle: ${outPath} (${sizeKb} KB)`);
}

build();

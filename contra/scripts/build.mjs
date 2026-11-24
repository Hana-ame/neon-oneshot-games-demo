// 零依赖单文件构建脚本：将模块化 src/*.js 与 css/style.css 打包为单文件 dist/contra-standalone.html

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const moduleOrder = [
  'src/constants.js',
  'src/audio.js',
  'src/input.js',
  'src/level.js',
  'src/entities.js',
  'src/engine.js',
  'src/renderer.js',
  'src/main.js'
];

function stripModuleSyntax(code) {
  return code
    // 移除多行或单行本地 import 语句
    .replace(/^import[\s\S]*?from\s+['"]\.\/[^'"]+['"];\s*$/gm, '')
    // 移除 export 关键字
    .replace(/^export\s+(?=(const|let|var|function|class)\s)/gm, '');
}

const htmlTemplate = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const cssContent = fs.readFileSync(path.join(projectRoot, 'css/style.css'), 'utf8');

const bundledJsParts = moduleOrder.map((relPath) => {
  const raw = fs.readFileSync(path.join(projectRoot, relPath), 'utf8');
  return `// ===== ${relPath} =====\n${stripModuleSyntax(raw).trim()}\n`;
});

const bundledJs = `(() => {\n'use strict';\n\n${bundledJsParts.join('\n')}\n})();`;

const standaloneHtml = htmlTemplate
  .replace(
    '<link rel="stylesheet" href="css/style.css" />',
    `<style>\n${cssContent}\n</style>`
  )
  .replace(
    '<script type="module" src="src/main.js"></script>',
    `<script>\n${bundledJs}\n</script>`
  );

const distDir = path.join(projectRoot, 'dist');
fs.mkdirSync(distDir, { recursive: true });
const outFile = path.join(distDir, 'contra-standalone.html');
fs.writeFileSync(outFile, standaloneHtml, 'utf8');

console.log(`构建成功: ${outFile} (${standaloneHtml.length} 字节)`);

/**
 * 零依赖单文件打包脚本
 * 将 src/ 下的所有 ES Module 与样式内联为可离线双击游玩的单文件 HTML（dist/web-hoi-standalone.html），
 * 同时输出一份至沙箱交付目录供 Canvas 直接交互预览。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const orderedModules = [
  'src/data/mapData.js',
  'src/data/nations.js',
  'src/data/technologies.js',
  'src/data/focuses.js',
  'src/engine/combat.js',
  'src/engine/economy.js',
  'src/engine/supply.js',
  'src/engine/diplomacy.js',
  'src/engine/ai.js',
  'src/engine/gameEngine.js',
  'src/ui/audio.js',
  'src/ui/renderer.js',
  'src/ui/app.js',
];

function stripModuleSyntax(code) {
  return code
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*export\s+(?=(const|let|var|function|class)\b)/gm, '');
}

const css = fs.readFileSync(path.join(rootDir, 'src/styles/main.css'), 'utf8');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

const bundledJs = orderedModules
  .map((relPath) => {
    const raw = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
    return `// ===== ${relPath} =====\n${stripModuleSyntax(raw)}`;
  })
  .join('\n\n');

const standaloneHtml = html
  .replace('<link rel="stylesheet" href="./src/styles/main.css" />', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="./src/ui/app.js"></script>', `<script>\n${bundledJs}\n</script>`);

const distDir = path.join(rootDir, 'dist');
fs.mkdirSync(distDir, { recursive: true });
const distOut = path.join(distDir, 'web-hoi-standalone.html');
fs.writeFileSync(distOut, standaloneHtml, 'utf8');

console.log(`Built standalone HTML: ${distOut} (${standaloneHtml.length} bytes)`);

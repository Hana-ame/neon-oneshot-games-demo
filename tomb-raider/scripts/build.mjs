/**
 * 零依赖单文件构建脚本
 * 将 src/ 下的模块化源码与 styles/main.css 打包为可直接运行及 Canvas 预览的单文件 HTML
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.resolve(projectRoot, '../../output');

const MODULE_ORDER = [
  'src/constants.js',
  'src/levels.js',
  'src/physics.js',
  'src/engine.js',
  'src/audio.js',
  'src/renderer.js',
  'src/main.js'
];

function stripModuleSyntax(code) {
  return code
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*export\s+(?=(const|let|var|function|class)\b)/gm, '');
}

function build() {
  const css = fs.readFileSync(path.join(projectRoot, 'styles/main.css'), 'utf8');
  const bundledJs = MODULE_ORDER.map((relPath) => {
    const raw = fs.readFileSync(path.join(projectRoot, relPath), 'utf8');
    return `/* ===== ${relPath} ===== */\n${stripModuleSyntax(raw)}`;
  }).join('\n\n');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>古墓丽影：太阳圣殿 · Tomb Raider Web</title>
  <style>
${css}
  </style>
</head>
<body>
  <div class="app-shell">
    <header class="hud-bar">
      <div class="hud-group">
        <span class="brand-title">古墓丽影 · TOMB RAIDER</span>
        <div class="hp-box">
          <div class="hp-track"><div id="hpFill" class="hp-fill"></div></div>
          <span id="hpText" class="stat-pill">100 / 100</span>
        </div>
        <span class="stat-pill">关卡 <strong id="levelLabel">第一关：丛林外殿</strong></span>
        <span class="stat-pill">圣物 <strong id="relicCount">0/3</strong></span>
        <span class="stat-pill">得分 <strong id="scoreVal">0</strong></span>
        <span class="stat-pill">计时 <strong id="timerVal">00:00</strong></span>
      </div>
      <div class="toolbar-btns">
        <button id="btnMute" class="hud-btn" type="button">音效</button>
        <button id="btnPause" class="hud-btn" type="button">暂停</button>
        <button id="btnRestart" class="hud-btn" type="button">重玩</button>
        <button id="btnTouchToggle" class="hud-btn" type="button">手柄</button>
      </div>
    </header>

    <main id="stageWrap" class="stage-wrap">
      <canvas id="gameCanvas" aria-label="古墓丽影游戏画布"></canvas>

      <div id="bossHud" class="boss-hud hidden">
        <div id="bossName" class="boss-name">黑曜石守卫</div>
        <div class="boss-track"><div id="bossHpFill" class="boss-fill"></div></div>
      </div>

      <div id="toast" class="toast" role="status" aria-live="polite"></div>

      <div id="overlay" class="overlay">
        <div class="overlay-card">
          <h1 id="overlayTitle">古墓丽影：太阳圣殿</h1>
          <p id="overlayDesc"></p>
          <div id="overlayStats" class="overlay-stats"></div>
          <div class="overlay-actions">
            <button id="primaryActionBtn" class="btn-primary" type="button">开始探险</button>
            <button id="secondaryActionBtn" class="btn-secondary hidden" type="button">重头开始</button>
          </div>
          <div id="levelSelectRow" class="level-select-row">
            <button class="hud-btn" type="button" data-level="0">第一关：丛林外殿</button>
            <button class="hud-btn" type="button" data-level="1">第二关：机关地宫</button>
            <button class="hud-btn" type="button" data-level="2">第三关：太阳圣殿</button>
          </div>
          <div class="controls-legend">
            操作：A/D 或 ←/→ 移动 · W/S 攀爬藤蔓 · 空格 跳跃/抓崖上翻 · Shift 翻滚闪避 · J / 鼠标左键 双枪射击 · E 触发拉杆 · P 暂停
          </div>
        </div>
      </div>
    </main>

    <div id="hintBar" class="hint-bar"></div>

    <div id="touchControls" class="touch-controls">
      <div class="dpad">
        <button id="tcLeft" class="tc-btn" type="button">←</button>
        <button id="tcRight" class="tc-btn" type="button">→</button>
        <button id="tcUp" class="tc-btn" type="button">↑</button>
        <button id="tcDown" class="tc-btn" type="button">↓</button>
      </div>
      <div class="action-pad">
        <button id="tcJump" class="tc-btn" type="button">跳跃</button>
        <button id="tcShoot" class="tc-btn" type="button">射击</button>
        <button id="tcRoll" class="tc-btn" type="button">翻滚</button>
        <button id="tcInteract" class="tc-btn" type="button">机关</button>
      </div>
    </div>
  </div>

  <script>
(function () {
  'use strict';
${bundledJs}
})();
  </script>
</body>
</html>
`;

  fs.mkdirSync(outputDir, { recursive: true });
  const distPath = path.join(outputDir, 'tomb_raider_web.html');
  const projectIndexPath = path.join(projectRoot, 'index.html');
  fs.writeFileSync(distPath, html, 'utf8');
  fs.writeFileSync(projectIndexPath, html, 'utf8');
  console.log(`Built single-file app successfully:\n - ${distPath}\n - ${projectIndexPath}`);
}

build();

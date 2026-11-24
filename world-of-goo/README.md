# 网页版《黏黏世界》(Web World of Goo)

基于 **Verlet 质点-弹簧物理引擎** 与 **HTML5 Canvas 2D** 实现的零依赖网页版《黏黏世界》益智建构游戏。包含模块化源码、Web Audio 合成音效、5 个递增难度关卡、完整自动化测试套件、单文件离线打包脚本与技术报告。

## 目录结构

```text
web-world-of-goo/
├── index.html                   # 模块化开发入口页（本地静态服务运行）
├── package.json                 # 项目配置与 test / build 脚本（零外部依赖）
├── README.md                    # 项目说明文档
├── standalone/
│   └── world-of-goo.html        # 单文件离线可玩版（双击浏览器即可直接运行）
├── src/
│   ├── engine/
│   │   ├── math.js              # 二维向量、线段投影与几何碰撞检测
│   │   ├── physics.js           # Verlet 物理积分、距离约束迭代、浮力/风力与碰撞
│   │   └── game.js              # 游戏状态机、拖拽吸附、绿球拆解、爬行AI与时间虫撤销
│   ├── levels/
│   │   └── levels.js            # 5 个物理验证关卡定义与配色主题
│   ├── audio/
│   │   └── sound.js             # 纯 Web Audio API 合成音效引擎
│   └── ui/
│       ├── renderer.js          # Canvas 2D 渲染器（视差背景、张力变色、眨眼动画、粒子）
│       └── app.js               # 指针/触控事件绑定、快捷键与 HUD 控制器
├── tests/
│   ├── math.test.js             # 几何与碰撞单元测试
│   ├── physics.test.js          # 物理引擎稳定性、拉断、浮力与快照测试
│   ├── game.test.js             # 拖拽连接、绿球复用、撤销与暂停测试
│   └── levels.test.js           # 全 5 关静态平衡与第 1 关端到端自动通关测试
├── scripts/
│   └── build-standalone.js      # 将模块化源码内联为单文件 HTML 的构建脚本
└── docs/
    ├── TECHNICAL_REPORT.md      # 完整技术报告（Markdown 版）
    └── TECHNICAL_REPORT.pdf     # 完整技术报告（PDF 排版版）
```

## 快速开始

### 1. 直接试玩（无需安装任何依赖）
直接用任意现代浏览器打开 `standalone/world-of-goo.html` 即可离线游玩。

### 2. 运行自动化测试（需 Node.js >= 18）
```bash
npm test
```

### 3. 重新打包单文件网页版
```bash
npm run build
```

## 操作指南

- **鼠标左键 / 触屏拖拽**：抓取在桁架上爬行的自由黏黏球（或已放置的绿色可拆球、粉色气球），拖动到已有结构附近出现虚线吸附提示后松手即可连接。
- **黑球（普通球）**：连接 2–3 个节点，搭建稳固的三角形桁架。
- **绿球（常春藤球）**：搭建后仍可随时拆下重复利用。
- **粉色气球**：连接单个节点并提供持续向上浮力，用于托起悬桥或跨越尖刺深渊。
- **快捷键**：`Z` 时间虫撤销 · `R` 重开本关 · `Space` 暂停/继续 · `M` 开关音效。

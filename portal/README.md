# 网页《传送门》(Web Portal)

基于原生 HTML5 Canvas 2D、ES Modules 与 Web Audio API 构建的 2D 物理传送门解谜游戏完整工程，包含核心物理引擎、5 个渐进式光圈测试舱、零外部音频资源依赖的程序化音效、自动化测试套件与技术报告。

## 目录结构

```text
web-portal-project/
├── index.html                  # 模块化版本入口（需本地静态服务运行）
├── standalone.html             # 单文件自包含版本（双击即可直接游玩）
├── package.json                # Node.js 测试脚本与项目元信息
├── README.md                   # 项目说明与快速启动指南
├── styles/
│   └── main.css                # 响应式光圈实验室 UI 样式
├── src/
│   ├── constants.js            # 物理常量、瓦片枚举与配色定义
│   ├── physics.js              # 2D 向量、DDA 射线检测、AABB 碰撞与动量守恒算法
│   ├── levels.js               # 5 关测试舱网格定义与解析器
│   ├── audio.js                # Web Audio API 程序化音效合成器
│   ├── engine.js               # 无头游戏引擎（解耦 DOM，支持 Node.js 测试）
│   ├── renderer.js             # HTML5 Canvas 2D 渲染器
│   └── main.js                 # 浏览器主循环、键鼠/触屏输入与 HUD 绑定
├── tests/
│   ├── physics.test.js         # 物理引擎与传送门算法单元测试
│   └── engine.test.js          # 游戏引擎与关卡集成测试
└── docs/
    └── TECHNICAL_REPORT.md     # 完整技术报告
```

## 快速启动

1. **零配置直接试玩**：用任意现代浏览器直接打开 `standalone.html`。
2. **本地开发服务器运行模块化源码**：
   ```bash
   python3 -m http.server 8080
   # 浏览器访问 http://localhost:8080
   ```
3. **运行自动化测试**（需 Node.js ≥ 18）：
   ```bash
   npm test
   # 或直接运行
   node --test tests/*.test.js
   ```

## 操作说明

- `A` / `D` 或 `←` / `→`：左右移动
- `W` / `↑` / `Space`：跳跃（支持土狼时间与跳跃缓冲）
- `鼠标左键`：向瞄准点发射蓝色传送门
- `鼠标右键` 或 `Q`：向瞄准点发射橙色传送门
- `E`：拾取 / 放下同伴方块
- `C`：手动清除当前传送门
- `R`：重置当前测试舱
- 移动端 / 触屏：支持底部屏幕按键与蓝/橙门模式切换

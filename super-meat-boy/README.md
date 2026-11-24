# 超级食肉男孩（Super Meat Boy Web）

基于 HTML5 Canvas 2D、原生 ES Modules 与 Web Audio API 构建的网页版《超级食肉男孩》平台跳跃游戏完整项目，包含确定性 60Hz 物理引擎、6 个主题关卡、持久化血迹贴花、全死亡同步回放系统、自动化测试套件与技术报告。

## 快速开始

### 1. 直接游玩
双击打开项目根目录的 `index.html`，或在本地静态服务器中运行即可立即开始游戏（零构建依赖、零外部音频/图片资源）。

### 2. 运行自动化测试
需要 Node.js >= 18（使用内置 `node:test` 与 `node:assert/strict`，无需 `npm install`）：

```bash
npm test
```

## 操作说明

| 操作 | 键盘按键 | 触屏按钮 |
| :--- | :--- | :--- |
| 左右移动 | `A / D` 或 `← / →` | 底部 `←` / `→` |
| 跳跃 / 蹬墙跳 | `Space` / `W` / `↑` / `K` / `X` | 底部 `跳跃` |
| 冲刺加速 | `Shift` / `J` / `Z` | 底部 `冲刺` |
| 瞬间重开 | `R` | 顶部 `重开` |
| 暂停 / 恢复 | `P` 或 `Esc` | 顶部 `暂停` |
| 音效开关 | `M` | 顶部 `音效` |
| 跳过通关回放 | `Space` / `Enter` / 点击画布 | 点击 `跳跃` 或画布 |

## 项目目录结构

```text
super-meat-boy-web/
├── index.html                  # 单文件独立可运行版（内联全部模块）
├── package.json                # 项目配置与 npm test 脚本
├── README.md                   # 项目说明与快速上手指南
├── src/
│   ├── constants.js            # 物理常量、瓦片类型、主题色板与游戏状态枚举
│   ├── levels.js               # 6 大手绘关卡数据与运行时世界解析器
│   ├── physics.js              # 固定步长物理引擎、碰撞检测与机关逻辑
│   ├── audio.js                # Web Audio API 实时程序化音效合成器
│   ├── renderer.js             # Canvas 2D 渲染器（角色、锯齿、血迹、粒子与回放残影）
│   └── game.js                 # 状态机、全尝试回放录制、本地存档与主循环
├── tests/
│   ├── physics.test.js         # 物理引擎单元测试（重力、冲刺、可变跳、土狼时间、缓冲、蹬墙跳）
│   ├── hazards.test.js         # 危险机关与交互机制测试（尖刺、圆锯、弹簧、碎裂砖、绷带、终点）
│   ├── levels.test.js          # 关卡完整性、尺寸一致性与出生点安全校验
│   └── game-flow.test.js       # 状态机、死亡重生、全尝试回放与评级集成测试
└── docs/
    └── TECHNICAL_REPORT.md     # 完整技术报告
```

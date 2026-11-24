# Web COD — Operation Ironline（网页版使命召唤战术 FPS）

基于纯原生 HTML5 Canvas 2.5D/3D 纹理光线投射引擎与 Web Audio API 程序化音效构建的零外部依赖网页端战术第一人称射击游戏。

## 项目结构

```text
web-cod/
├── index.html                 # 独立单文件完整版入口（双击即可离线畅玩）
├── package.json               # 项目配置与自动化测试入口
├── README.md                  # 项目说明文档
├── src/
│   ├── config.js              # 武器库、双地图、敌军兵种与连杀奖励配置
│   ├── map.js                 # 战术地图、圆形碰撞滑动解析、DDA 光线投射与视线检测
│   ├── weapons.js             # 武器状态机、后坐力、ADS 瞄准、换弹与距离衰减弹道
│   ├── player.js              # 玩家移动物理、护甲吸收、自动回血与连杀奖励系统
│   ├── ai.js                  # 敌军有限状态机（巡逻/追击/交火/侧移）与波次生成器
│   ├── engine.js              # 游戏主仿真引擎、命中判定、补给掉落与战绩统计
│   ├── renderer.js            # 纹理光线投射渲染、Z-Buffer 精灵绘制、狙击镜与战术 HUD
│   ├── audio.js               # Web Audio API 实时程序化枪声/命中/爆炸合成器
│   └── main.js                # 浏览器输入控制（Pointer Lock + 拖拽 + 触屏）与主循环
├── tests/
│   ├── map.test.js            # 地图碰撞、DDA 射线投射与视线遮挡测试
│   ├── weapons.test.js        # 射速、弹匣消耗、换弹、后坐力与伤害衰减测试
│   ├── ai.test.js             # AI 状态转移、攻击冷却与波次难度测试
│   ├── player.test.js         # 护甲吸收、脱战回血与连杀奖励触发测试
│   └── integration.test.js    # 端到端完整战斗循环与波次推进集成测试
└── docs/
    └── TECHNICAL_REPORT.md    # 完整技术架构与测试验证报告
```

## 快速启动

1. **直接运行**：双击打开根目录下的 `index.html` 即可离线运行，无需联网或构建。
2. **本地静态服务器运行**：
   ```bash
   npm start
   # 访问 http://localhost:8080
   ```

## 运行自动化测试

项目采用 Node.js 18+ 原生测试框架（`node:test`），无需安装任何第三方依赖：

```bash
npm test
```

## 操作指南

| 操作 | 键盘 / 鼠标 | 说明 |
| :--- | :--- | :--- |
| 移动 | `W / A / S / D` | 前后左右战术移动 |
| 视角转向 | 鼠标移动 / 拖拽 / `← →` | 支持 Pointer Lock 与非锁定拖拽 |
| 开火 | 鼠标左键 / `Space` | 全自动步枪支持按住连射 |
| 机械瞄具 / 开镜 (ADS) | 鼠标右键 / `F` | 缩窄 FOV 提升精准度，AWP 开启 3x 狙击镜 |
| 换弹 | `R` | 战术换弹（打空自动触发） |
| 切换武器 | `1 / 2 / 3 / 4` 或滚轮 | M4A1 / MP5 / M870 / AWP |
| 冲刺 / 下蹲 | `Shift` / `C` | 冲刺加速，下蹲降低受弹命中率 |
| 连杀奖励 | `Q` (UAV) / `E` (空袭) | 3 连杀解锁 UAV，5 连杀解锁精确空袭 |
| 暂停 | `Esc` / `P` | 暂停或继续战斗 |

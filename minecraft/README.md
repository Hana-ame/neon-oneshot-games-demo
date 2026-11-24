# VoxelCraft Web — 网页版 Minecraft 体素沙盒

基于原生 **HTML5 / ES Modules / WebGL / Web Audio API** 实现的零外部依赖网页版 Minecraft 完整工程项目，包含模块化源码、自动化测试套件、单文件离线构建脚本以及完整中文技术报告。

## 快速开始

### 方式一：直接离线试玩（推荐）
直接用现代浏览器打开 `dist/web-minecraft.html` 即可开始游玩，无需本地服务器或网络连接。

### 方式二：模块化源码开发模式
在项目根目录启动任意静态 HTTP 服务（浏览器加载 ES Modules 需要 HTTP 协议）：

```bash
npm run serve
# 然后在浏览器访问 http://localhost:8080/index.html
```

### 运行自动化测试与单文件打包
需要 Node.js 18+：

```bash
# 运行全部 8 个测试套件（25 项单元测试与集成测试）
npm test

# 将模块化源码打包为单文件 dist/web-minecraft.html
npm run build
```

## 操作说明

| 按键 / 交互 | 功能 |
| :--- | :--- |
| `W A S D` / 方向键 | 前后左右移动 |
| `鼠标移动`（锁定指针或按住拖拽） | 旋转第一人称视角 |
| `Space` | 跳跃 / 水中上浮 / 飞行上升（创造模式双击切换飞行） |
| `Shift` | 冲刺 / 飞行下降 |
| `鼠标左键` | 破坏准星瞄准的方块 |
| `鼠标右键` | 在瞄准面的法线方向放置方块 |
| `1 - 9` / `滚轮` | 切换快捷栏方块 |
| `E` | 打开 / 关闭方块图鉴 |
| `F` | 切换飞行模式（创造模式） |
| `F3` | 显示 / 隐藏实时调试面板（FPS、DrawCall、三角形数、坐标、群系） |
| `M` | 静音 / 开启 Web Audio 合成音效 |
| `Esc` | 打开设置菜单（模式切换、视距、昼夜时间、世界种子、本地存档） |

移动端或触屏设备会自动显示左下角虚拟方向键与右下角挖掘/放置/跳跃按钮。

## 项目目录结构

```text
web-minecraft/
├── index.html                   # 模块化开发入口页
├── styles.css                   # 响应式 HUD、菜单与触控样式
├── package.json                 # ESM 配置与 test / build / serve 脚本
├── README.md                    # 项目说明文档
├── src/
│   ├── core/
│   │   ├── constants.js         # 方块注册表（17 种方块）、物理与世界常量
│   │   ├── math.js              # 4x4 列主序矩阵、透视/视图变换、AABB 工具
│   │   └── noise.js             # Mulberry32 PRNG、2D/3D Perlin 噪声与 FBM
│   ├── world/
│   │   ├── chunk.js             # 16×64×16 扁平化 Uint8Array 区块存储
│   │   ├── generator.js         # 多生物群系地形、树木、水域、矿脉与洞穴生成
│   │   ├── mesher.js            # 面剔除 + 顶点环境光遮蔽（AO）+ 透明分通道网格化
│   │   ├── world.js             # 动态区块加载、跨区块边界脏标记、增量存档序列化
│   │   └── raycast.js           # 3D Amanatides-Woo DDA 体素射线步进
│   ├── player/
│   │   ├── physics.js           # AABB 轴分离碰撞、重力、跳跃、游泳与飞行
│   │   └── inventory.js         # 9 格快捷栏、方块图鉴、创造/生存模式规则
│   ├── engine/
│   │   ├── textures.js          # Canvas 2D 程序化 16×16 像素风纹理图集（18 块贴图）
│   │   ├── renderer.js          # WebGL 双通道渲染管线、昼夜天空/雾效、选中线框
│   │   └── audio.js             # Web Audio API 程序化合成音效引擎
│   └── main.js                  # 主循环、键鼠/触控输入、HUD 与设置/存档交互
├── scripts/
│   └── build-singlefile.mjs     # 零依赖单文件 HTML 构建脚本
├── tests/                       # 8 个测试文件，共 25 项自动化测试
├── docs/
│   └── TECHNICAL_REPORT.md      # 完整中文技术报告
└── dist/
    └── web-minecraft.html       # 单文件离线可运行构建产物
```

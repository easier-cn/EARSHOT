# HUSH 开发交接文档

> 面向"接手的人 / 下一个会话的 AI"。目标：读完这一篇就能跑起来、知道代码在哪、知道哪些坑踩过、下一步做什么。
>
> 最后更新：v0.7.13（commit `5754f23`）

---

## 1. 项目是什么

全黑画面里的声呐潜行游戏：看不见任何东西，只能靠声波打在墙上的反弹点知道房间形状，而每一次发声都会把猎手引向你。

现在的完整形态是**肉鸽式地图探索**：

- 主流程：`房间 → 迷宫 → ……` 共 21 张地图，目前建成 2 张
- 每张图有钥匙、出口、护符/道具、被动型猎手（听见才动）
- 护符 10 种（含 3 级升级）、道具 8 种、6 格背包 + 4 快捷键 + 4 护符槽 + 2 格工作台
- 另有"五层肉鸽"旧模式（`startRun`）与编辑器模式

---

## 2. 跑起来

| 方式 | 命令 | 说明 |
|---|---|---|
| 一键（推荐） | 双击 `play.cmd` | 自动找空闲端口、起服务、开浏览器；重复运行会复用已在跑的 HUSH |
| 指定端口 | `play.cmd 8135` | 端口被占会自动往后找 |
| 单文件 | 打开 `dist/hush.html` | 无服务器也能玩（file://） |
| 手动 | `python -m http.server 8080 --bind 127.0.0.1` | 然后访问 `http://127.0.0.1:8080/` |

没有 Python 时 `play.ps1` 会退化成直接打开 `dist/hush.html`。

**改了源码必须重新构建单文件**，否则 `dist/` 还是旧版本：

```bash
node tools/build.mjs     # 生成 dist/hush.html（约 250KB）
```

浏览器里改完记得 **Ctrl+F5**：`index.html` 已经加了 `no-store`，但旧标签页仍可能吃缓存。

---

## 3. 目录结构

```
ni/
├─ index.html            # 入口：canvas + UI 根节点，按顺序 import
├─ style.css             # 全量样式（无框架）
├─ play.cmd / play.ps1   # 启动器（端口探测 + 打开浏览器）
├─ dist/hush.html        # 单文件构建产物（由 tools/build.mjs 生成）
├─ docs/
│  ├─ DEVELOPMENT.md     # 本文
│  └─ img/*.jpg          # README 用截图
├─ src/
│  ├─ main.js            # 启动、URL 调试参数、错误浮层
│  ├─ game.js            # 核心状态机（最大文件，约 1700 行）
│  ├─ util.js            # clamp/lerp/dist/mulberry32/echoPan...
│  ├─ input.js           # 键盘鼠标（keys/pressed/consume）
│  ├─ pathfind.js        # A*（8 向、禁止切角）+ 视线检测
│  ├─ levelgen.js        # 旧版"密室"关卡
│  ├─ rooms.js           # 五层肉鸽的房间图生成（走廊优先）
│  ├─ worldgen.js        # 地图模式：buildRoomMap / buildMazeMap
│  ├─ maps.js            # 21 张地图的节点表与顺序
│  ├─ entities.js        # Player / Hunter(4 种) / Skitter
│  ├─ loot.js            # CHARMS / ITEMS / Inventory（背包与合成）
│  ├─ desc.js            # 护符与道具的文言文案、SVG 纹样
│  ├─ render.js          # 全部绘制：射线、接触点、实体、UI 世界层
│  ├─ ui.js              # 无字界面：标题/暂停/死亡/结算/背包/选图/浮窗
│  ├─ audio.js           # 全程序化 WebAudio（无音频文件）
│  ├─ chambers.js        # 旧 8 密室配置
│  └─ editor.js          # 创造模式（画墙、放碎片/门/怪）
└─ tools/                # 全部是 Node 脚本，见第 6 节
```

`src/` 里模块之间的依赖是单向的：`util → pathfind → levelgen/rooms/worldgen → maps → entities → loot/desc → audio → chambers → editor → ui → render → game → main`。`tools/build.mjs` 的 `MODULES` 数组就是这个顺序，**新增文件必须同时加进去**。

---

## 4. 核心数据与状态

### 存档（localStorage）

| key | 内容 |
|---|---|
| `hush.save.v1` | `{unlocked, cleared, last, best:{...}, worldCleared, worldBest, bestRun, floorCleared}` |
| `hush.map.v1` | 编辑器里画的地图（`{cells, w, h}`） |

### 游戏状态机（`game.state`）

`title` → `playing` ⇄ `paused`，死亡 `dead`，区域完成 `complete`，通关 `victory`，编辑器 `edit`。

### 三种"区域"模式

| 模式 | 入口 | 说明 |
|---|---|---|
| `mapMode` | `startMap(id, seed)` | 地图模式（当前主线），`mapId/mapSeed/mapKey/mapExits/mapNodes` |
| `floorMode` | `startRun(seed)` / `startFloor(depth)` | 五层肉鸽：每层是一张房间图，`depth` 1..5 |
| `worldMode` / `customData` / 密室 | `startWorld` / `startCustom` / `startChamber` | 旧内容，保留可玩 |

**这五种入口都会把 `_entryPending` 置 true**，`update()` 第一帧拍 `entryState` 快照（背包、金币、钻石、生命、应激层数），时间逆流就靠它还原。

### 背包（`loot.js` 的 `Inventory`）

- `pack[6]`：`{kind:'item', id, n}` 或 `{kind:'charm', id, lvl}`
- `hot[4]`：**引用**背包条目（`take()` 会清引用）
- `charms[4]`：只有装进槽位的护符生效
- `work[2]`：工作台，两枚同名同级 → 成果格合成
- 升级只能在工作台发生；背包里的护符不生效

---

## 5. 操作与调试参数

### 游戏内

| 按键 | 作用 |
|---|---|
| WASD / 方向键 | 移动（按住 Shift 潜行：不出声线、移动变慢，但仍能看见所有声线） |
| 鼠标左键 | 声呐；选中投掷物后改为投掷 |
| 空格 / J | 声呐 |
| F | 拾取（靠近道具时浮窗提示） |
| Tab | 背包 / 拖拽装配 |
| 1 2 3 4 | 快捷键（投掷类为开关，再按一次取消） |
| M | 静音 |
| Esc | 暂停 / 关闭面板 |
| R | 死亡或暂停时重开（**会清空背包**） |
| `~` | 调试模式（显示猎手类型/路径） |
| `1`（调试中） | 冻结所有物体 |
| `2`（调试中） | 打开选图窗 |

### URL 参数（`src/main.js`）

| 参数 | 作用 |
|---|---|
| `?map=room\|maze&seed=123` | 直接进入某张地图 |
| `?run=123` | 直接开始五层肉鸽 |
| `?c=0..7` | 旧密室 |
| `?world=1` / `?edit=1` | 旧世界 / 编辑器 |
| `?static=1` | 关掉 CSS 动画（无头截图用） |
| `?sim=2.4&every=0.7&wave=0.45` | 推进模拟后冻结（截图定帧） |
| `?ping` / `?move=1` | 模拟中自动发声 / 自动向右走 |
| `?doc=pause\|dead\|clear\|victory\|worldwin` | 直接弹对应面板 |
| `?debug=1` / `?hunt=1` / `?red=1` / `?blue=1` | 调试场景 |

---

## 6. 工具链

全部是 Node 原生脚本（无依赖），需要本机有 Edge（路径写死在 `tools/*.mjs` 顶部）。

| 工具 | 命令 | 用途 |
|---|---|---|
| 构建 | `node tools/build.mjs` | 把 `src/` 里全部模块内联成单文件 |
| 单测 | `npm test` | 37 项：连通性、AI、背包、地图生成 |
| 端到端 | `node tools/playtest.mjs` | CDP 真实按键：开局→移动→投掷→通关→编辑器 |
| 单表达式 | `node tools/probe.mjs "<js>"` | 在真实页面执行一段代码并回值（最常用） |
| 真实时间截图 | `node tools/live.mjs "<js>" out.png 800` | 注入场景、等真实毫秒、截图（抓"冻结时间看不出来"的渲染问题） |
| 真实按键 | `node tools/keytest.mjs` | 排查快捷键问题（CDP `Input.dispatchKeyEvent`） |
| 投掷复现 | `node tools/repro-throw.mjs` | 按键只选中、左键才消耗的回归验证 |
| 地图 ASCII | `node tools/printmap.mjs` | 把网格打成字符画，肉眼查墙与连通 |
| 房间统计 | `node tools/checkrooms.mjs` | 150 种子连通性/房间数统计 |
| 性能 | `node tools/perf.mjs` | 720 帧 p95 |
| 难度压力 | `node tools/pressure.mjs` | 幽灵走完美路线，统计死亡时间 |

验证约定：

1. 逻辑改动 → `npm test` 必须 37/37。
2. 交互改动 → `node tools/playtest.mjs` 必须 `errors: []`。
3. 视觉改动 → 至少一张 `shots/*.png` 截图，自己看一眼再提交。
4. 改了 `dist` 相关 → 用 `file://` 再跑一次 playtest。

---

## 7. 已经踩过的坑（**别再踩**）

### 构建

- **单文件构建曾经从 v0.7.0 起就是坏的**：`levelgen/rooms/worldgen` 各自 `const TILE`，`pathfind/rooms` 各自 `const DIRS`，内联后重复声明直接白屏；`MODULES` 还漏了 `editor.js`。
  → 构建脚本现在会逐行去重"同名同值的单行 const"，但**新增全局常量请先 grep 是否重名**。
- `python -c` 写文件时 `\b` 会被当退格吃掉，中文脚本请用文件写入或 `write` 工具。

### 生成器

- BSP 曾经**只记录墙的位置用于打洞，却从未把墙写进网格** → 整张"房间图"其实是一个空大厅，连通性测试全绿但玩法完全不对。
  → 房间图必须"先填墙、再开门洞"，并用 `printmap.mjs` 肉眼确认。
- 装饰（柱子、隔断）会堵死走廊：每次装饰后跑全图 `connected()`，失败就回滚网格快照。
- 钥匙坐标已经是像素，别再乘 `tile`（曾把钥匙扔到 4 万 px 外）。
- 迷宫图没有 `level.key`，任何读 `L.key.x` 的代码都要判空（归家期盼曾因此崩溃）。

### 射线与实体

- 脚步/声呐射线如果从实体中心发出，第一步就会命中自己，全部染成"命中红"并原地反弹 → 表现成"只有一坨红点"。
  → 无标签射线（`tag:null`）只与墙壁交互；有标签射线才与实体交互。
- `updateShocks` 曾插进 `updateTitle()`，正式游玩里永远不更新（看着像没实现）。
- 渲染里大量颜色写死过（射线头部、波前辉光），改 tint 时要顺着"头部/拖尾/接触点/环"四层一起改。

### 状态与存档

- `restart()` 只重建关卡、不重建背包 → 死亡重开带着上一局物品（已修：`resetRunState()`）。
- 时间逆流曾写死 `startFloor(this.depth)`，地图模式下 depth 是旧楼层值 → 复活进"以前的关卡"（已修：`restoreEntry()` 按模式重开）。
- 时间逆流曾不还原背包 → 可以"捡装备→逆流→再捡"无限刷（已修：进区域快照）。
- 不死图腾曾只加 `stressCharges`，而受伤判定读护符等级 → 图腾等于没装（已修：先消耗层数）。
- 投掷物曾经"先生成、后扣数量"，数量为 0 时会白嫖（已修：先 `consume` 再生成）。
- 投掷起点在身体中心，贴墙时第一帧就撞墙 → "按一下就没"（已修：起点前移并回退检查）。

### UI

- 无字 UI 重写时按钮绑定表写成 `g.retry`，而方法叫 `restart` → 三个按钮全炸（已修，并补了"五屏按钮逐个点"回归）。
- 护符副本漏了 `kind:'charm'` → `ITEM_TEXT[sleep]` 未定义 → 读取 `.name` 崩溃。
- HUD 的 SVG 图标曾因缺少 `stroke` 规则而完全不可见。

### 环境

- Windows 的 `http.server` 带 SO_REUSEADDR，**端口被占用时 bind 也会成功**，不能用 bind 判断端口是否空闲；要 TCP connect 探测。
- 无头 Edge 的 `--virtual-time-budget` 下 rAF 推进很慢，靠它截不到真实动画；要定帧请用 `debugSimulate`，要真实时间请用 `tools/live.mjs`。

---

## 8. 当前进度与下一步

### 已完成（v0.7.x）

- 两张地图：房间（BSP 多房间 + 内饰 + 钥匙/出口/三扇门）、迷宫（递归回溯 + 口袋）
- 无字 UI、护符/道具/背包/工作台、投掷与瞄准、区域名、弹幕、引导
- 地图选择窗、调试冻结/选图、单文件构建修复

### 待做（按优先级）

1. **移动迷宫**：双层 9×2 房间、每 20 秒上下层交换、交界处画红色声线、电梯播报音、中间房特殊移动规则。
2. **机械地牢**：左右两半、牢门钥匙、紫色反光门、猎犬/死徒/镇守者（子弹可反弹三次）。
3. **地图连接**：`enterMapExit` 已支持 `to/require/color`，但只建了 room↔maze 两条边；补完 21 张图的图结构后，把 `BUILT_MAPS` 逐个放开。
4. **城堡钥匙**：第一个击杀掉落（字段已留 `castleKey`，掉落逻辑未接）。
5. **吸收门**：草原门应吸收声波不再反弹（`absorb` 集合已生成，`updateRays` 未消费）。
6. **科技树**（用户已给格式：缩进父子、`名称 | 前置 | 价格 | 效果`；需先定"局外永久/局内"与货币量级）。
7. 剩余道具效果细化：扫描仪最短路、驱虫器对猎犬、尸骸对死徒。
8. 移动端适配（触屏摇杆 + 点击发声）。

### 新增一张地图的最小步骤

1. `src/maps.js`：在 `MAPS` 里加节点（`id/name/sub/kind`），并加入 `MAP_ORDER`。
2. `src/worldgen.js`：写 `buildXxxMap(seed)`，返回 `{w,h,grid,tile,spawn,key,exits,absorb,monsters,loot}`，保证 `mapConnected(level) === true`。
3. `src/game.js`：`startMap()` 里按 `node.kind` 选择生成器；把 id 加进 `BUILT_MAPS`。
4. `node tools/printmap.mjs` 肉眼看图 + `npm test` + `node tools/playtest.mjs`。
5. `CHANGELOG.md` 记一条，提交并打 tag。

---

## 9. 版本与提交约定

- 语义化版本 `v0.x.y`，**每个可见改动都打 tag**，并在 `CHANGELOG.md` 写"改了什么 + 为什么"。
- 提交信息用 `fix:` / `feat:` / `docs:` / `perf:` 前缀，一句话说清根因（例：`fix: rewind revived into a stale floor`）。
- 提交前检查：`npm test` 37/37、`playtest` 无异常、`dist` 已重建。
- 截图不进仓库（`.gitignore` 忽略 `shots*/`），README 用的图放 `docs/img/`。

---

## 10. 五分钟上手清单

```bash
cd C:\Users\浩\Desktop\ni
npm test                       # 37 项应全绿
node tools/build.mjs           # 重建 dist
start http://127.0.0.1:8080/   # 或双击 play.cmd
```

想直接看某张图：

```
http://127.0.0.1:8080/?map=maze&seed=777&static=1
http://127.0.0.1:8080/?map=room&seed=1234&static=1
```

想在控制台里改状态：

```js
const g = window.__hush;
g.startMap('room', 42);
g.inv.addCharm('rewind');       // 进背包
g.inv.showInventory?.();        // 或用 Tab
g.debugInvincible = true;       // 调试无敌（~ 也会开）
```

遇到"改了没反应"：先 `node tools/build.mjs`，再 Ctrl+F5，再看 `dist/hush.html` 的控制台报错。

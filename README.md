# HUSH

> 你什么都看不见。黑暗在听。

一款用**声呐**当眼睛的极简潜行游戏。发一次脉冲，墙壁的轮廓在黑暗中亮起一瞬——同时，猎手听见了你。

![status](https://img.shields.io/badge/status-playable-7fe3d4) ![deps](https://img.shields.io/badge/dependencies-0-7fe3d4)

## 开始

**Windows：双击 `play.cmd`** —— 它会按需拉起本地服务器，并在浏览器里打开游戏。

手动启动（任意静态服务器均可）：

```bash
python -m http.server 8080 --bind 127.0.0.1
# 打开 http://127.0.0.1:8080
```

点击 / 按任意键开始（浏览器要求先有用户手势才能播放声音）。建议戴耳机。

## 操作

- `WASD` / 方向键 — 移动
- 鼠标左键 / `J` — 声呐脉冲
- `空格` — 放轻脚步（很慢，几乎无声）；**站定**后按住，才能听出声源方向
- `Shift` — 奔跑（更快，也更响）
- `R` — 重开 · `Esc` — 暂停 · `M` — 静音

## 玩法

收集密室里的全部**碎片**，然后走到**出口**。
碎片会发出微弱的铃声，猎手会被它吸引；你的声呐会照亮它，也会照亮你。
跑步很响，走路很轻，站着不动几乎无声。

八个密室有四种空间风格——厅堂、蜂巢、空腔、长廊——分别偏向小房间、大空场、
长走廊，学会用地形而不只是反应。

## 项目结构

```
index.html        入口
style.css         视觉与 UI
src/
  main.js         启动
  game.js         状态机、模拟、胜负
  render.js       声呐渲染器
  levelgen.js     程序化密室生成
  pathfind.js     A* / 视线检测
  entities.js     玩家、猎手、碎片
  audio.js        WebAudio 程序化音频
  ui.js           DOM 界面
  chambers.js     8 个密室配置
  util.js         数学 / 随机数
tests/            node --test 逻辑测试
DESIGN.md         设计与数值
```

## 开发

```bash
npm test            # 逻辑测试（关卡连通性、寻路、碰撞）
npm run playtest    # 无头浏览器自动试玩（真实按键 + 截图）
npm run balance     # 每个密室的最短步行路线（配速参考）
npm run serve       # 本地服务器
```

调试用 URL 参数：`?c=0..7` 直接进关、`?static` 关闭入场动画、`?ping` 自动脉冲、`?sim=秒` 快进模拟、`?freeze=毫秒` 定格、`?doc=dead|clear|victory` 预览结算界面。

## 版本

见 [CHANGELOG.md](CHANGELOG.md)。

- **v0.2** 四种空间风格、聆听必须站定、方向箭头修复
- **v0.1.1** 声音提示、结算面板修正、自动化试玩、Windows 一键启动
- **v0.1** 可玩核心：声呐渲染、8 密室、猎手 AI、程序化音频、存档

# Changelog

All notable changes to HUSH. The format follows [Keep a Changelog](https://keepachangelog.com/),
and the game follows [SemVer](https://semver.org/).

## [0.3.2] - 2026-11-05

### Added
- **A single continuous map (experimental).** `generateWorld()` builds one
  60×76-tile cave (37 rooms, 16 shards, 10 hunters, 4 mimics) instead of eight
  sealed chambers. Walk it with `?world=1`; tests assert every shard, hunter,
  mimic and the exit are reachable from spawn. The chamber mode is still the
  default while the world grows its own progression and gates.

## [0.3.1] - 2026-11-05

### Added
- **The mimic (拟声者) and the echo door.** The creature that used to only
  click now repeats any sound it hears, about a second later, from wherever it
  is standing — hunters turn toward the answer instead of you, and the room
  shows a ring where it spoke. Chambers VI and VII end at a door that will not
  open for a single sound: it wants the same sound answered from another
  direction. No prompt, no key. Ping, hear it answer, watch the door open.
- Echo audio: a detuned, wetter copy of the sound it repeats, panned to where
  the mimic stands. Sealed doors hum every ~3.6s once you hold every shard, so
  there is something for the mimic to answer.

### Fixed
- `audio.skitterTick` was referenced but never implemented.

## [0.3.0] - 2026-11-05

### Changed
- **Sonar is no longer a wall outline.** Each pulse now throws 96 sparks that
  travel outward, reflect off walls (up to three bounces) and leave short comet
  tails; every impact leaves a contact glow that lingers for ~1.7s. The room
  you are standing in is drawn by where the sound *hit*, not by a shader that
  knows the map. Faint contact memory is the only thing you keep between pulses.

## [0.2.4] - 2026-11-05

### Fixed
- **Walls did not block movement and hunters never moved.** `generateLevel`
  never returned its tile size, so every position was divided by `undefined`;
  coordinates became NaN, the collision sweep ran over an empty range, and A*
  was handed NaN tiles. Unit tests missed it because they passed `TILE`
  explicitly. Levels now carry `tile`, plus regression tests that exercise
  `level.tile` itself and a playtest that pushes the player into a wall and
  checks that hunters actually move.

## [0.2.3] - 2026-11-05

### Added
- An "it heard that" stinger: when a hunter first wakes to a noise, a low sour
  cue pans toward it. Rate-limited to 0.75s and silent while it is already
  tracking, so it reads as a reaction rather than a metronome.
- `tools/probe.mjs`: evaluate one expression inside the running game.

## [0.2.2] - 2026-11-05

### Added
- `tools/pressure.mjs`: simulates a ghost walking the shortest route with real
  hunter hearing and contact, across three play styles, to measure how hard the
  hunters actually push. Findings written into DESIGN.md.
- `tools/perf.mjs`: rAF frame-time probe for the heaviest chamber (5 hunters,
  214 wall segments, pings every 120ms). p95 = 16.7ms, 60fps steady.

## [0.2.1] - 2026-11-05

### Added
- `npm run build` produces `dist/hush.html`: one self-contained file with CSS
  and all modules inlined, so the game can be opened by double-click with no
  server and no Python. Inline module scripts are allowed under `file://`.
- Pause screen lists the controls, so nobody has to remember them mid-run.

## [0.2.0] - 2026-11-05

### Added
- Four room-shape presets (`halls`, `cavern`, `warren`, `gallery`) assigned per
  chamber, so the eight rooms differ in topology, not just shard count. The
  generator falls back to `halls` if a tight preset starves.

### Changed
- Listening now requires standing still: holding Space while walking only muffles
  your steps, the directional sense fades in after ~0.26s of stillness. This
  removes the "silent walk with perfect awareness" dominant strategy.

### Fixed
- Directional chevrons never rendered in normal play (`game.listen` was never set).

### Added
- `npm run balance` — reports the shortest walking route through every chamber
  (lower bound on level length, used for pacing).

### Changed
- Starting a chamber is now idempotent: pressing Space on the title screen can no
  longer start the level twice through the focused button.
- Losing window focus pauses the run instead of letting hunters keep moving.

## [0.1.1] — 2026-11-05

### Added
- First-ping hint toast ("声呐也暴露了你").
- `play.cmd` — one double-click boots a local server (only if the port is free) and
  opens the game.
- Playtest now drives a full clear (collect every shard, reach the exit) and
  captures the clear panel.

### Fixed
- Intro line and toast no longer sit on top of the death / clear panels.
- The HUD is always hidden behind an end screen.
- Death screen could be skipped when the simulation was frozen.

## [0.1.0] — 2026-11-05

First playable build.

### Added
- Eight seeded chambers (I–VIII) generated from rooms, MST corridors and loops.
- Analytic sonar rendering: wavefronts light wall segments, brightness decays into
  an afterglow, walls keep a faint memory of what you have seen.
- Blind hunters that wander, investigate sound and search; ping, footsteps and
  shard pickups all make noise.
- Procedural WebAudio (drone, ping, heartbeat, footsteps, gate, death), no assets.
- Pause, death, clear and victory screens, saved progress in `localStorage`.
- Node test suite (level connectivity, determinism, A*, line of sight, collision)
  and a headless CDP playtest.

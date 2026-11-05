# Changelog

All notable changes to HUSH. The format follows [Keep a Changelog](https://keepachangelog.com/),
and the game follows [SemVer](https://semver.org/).

## [Unreleased]

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

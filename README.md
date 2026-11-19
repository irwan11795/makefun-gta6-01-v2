# SOLHAVEN — Make GTA 6

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/irwan11795/makefun-gta6-01-v2/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/irwan11795/makefun-gta6-01-v2/reward.svg)](https://make.fun/bounty/gta6-01)

SOLHAVEN is a low-poly Three.js open-city crime game, built by an AI agent
for make.fun's "Make GTA 6" bounty ($1,666 in USDC, top 100 share the pot).

You are a new wheelman in Solhaven, a sun-soaked coastal city. Madame Sol
has six jobs for you — take the gold-trimmed hero car, run deliveries,
outrun the law, and pull off the last score. The city is yours: drive it,
walk it, steal cars, dodge traffic and pedestrians, and watch the wanted
stars climb every time you make a mess.

## What is in the game

- An open world to explore on foot and by car: four colourful districts
  (Marina, Downtown, Old Town, Hills), a beachfront, traffic, pedestrians,
  and a living street grid.
- A luxury hero car with gold trim, plus traffic cars you can steal and drive.
- A wanted system: crimes raise your stars, they decay slowly when you lay
  low. Police patrol, chase, and ram; a helicopter joins at 3 stars; at
  4 stars the siege closes in with roadblocks.
- A 6-mission story chain with a win screen after the last score, and a
  lose screen when you get busted.
- A HUD with speed, wanted stars, mission objective with distance and
  timer, and a live minimap showing you, the police, and your target.
- Synthesized sound (engine, sirens, crashes, chimes) — no audio files.
- A start menu, pause, and a save that remembers your progress.

## Controls

- W / A / S / D or arrow keys — drive / walk
- E — enter or exit a car (steal it)
- Space — handbrake
- P — pause, M — mute

## Missions

1. First Wheels — take the gold hero car.
2. Sunset Delivery — a package to the Marina before the clock runs out.
3. Checkpoint Rush — five checkpoints against the clock.
4. Tail the Courier — follow the courier without losing him.
5. Heat Escape — shake a 3-star wanted level.
6. The Last Score — the vault, then outrun the siege to the hideout.

## Run it

Serve `game/` with any static HTTP server and open `game/index.html` in
desktop Chrome. It plays fully offline: every file it loads lives under
`game/` (Three.js is vendored as `game/vendor/three.module.min.js`).

## Layout

- `game/` — the playable game (static files, no build step)
- `game/src/` — the game's own source, one file per system
- `screenshots/` — real renders of the game in a browser
- `main.ts` — the entry program: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json`
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged

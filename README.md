# The Infernal Fechtschule — Procedural Edition

A browser fencing brawler with a Little Fighter 2–inspired rhythm: depth-lane movement, responsive cut chains, readable anticipation, group hits, and committed finishers. The player is a fictionalized Joachim Meyer, fighting through a Renaissance setting with a longsword, dussack, and improvised weapons.

**Version 0.2.0.** This is a playable historical-arcade vertical slice. The fencing and narrative are adaptations, not a training simulator or a verified reconstruction.

## The overhaul

Every fighter, weapon, environment, combat effect, and interface illustration is generated from code. The renderer uses articulated poses, analytic two-bone inverse kinematics, tapered cloth geometry, shaded faces and steel, layered architecture, deterministic masonry, and cached code-drawn scenery. There are no character sprites, sprite sheets, bitmap backgrounds, external fonts, or downloaded game textures. Install icons are reproducibly generated from the checked-in SVG.

Phone play has a dedicated movement rail and separated Cut, Finish, Guard, Step, and Swap controls. Landscape keeps both thumbs outside the field. Portrait uses a tall, undistorted viewport rather than shrinking the game into a small widescreen strip. The camera frames the local player and the controls respect safe-area insets.

The core remains deterministic TypeScript with a Canvas 2D view, DOM menus/HUD, Web Audio effects, and no runtime framework dependency. The previous sprite/background pipeline and 952 tracked art files have been removed; their history remains in Git.

## Play locally

The compiled `site/` directory is included:

```sh
node tools/serve.mjs
```

Open `http://localhost:4173`. Use a local HTTP server rather than opening the HTML with `file://`. For a different port:

```sh
PORT=4187 node tools/serve.mjs
```

For source changes, run `npm ci`, `npm run build`, and `npm test`. The build compiles `src/` into `site/js/`, generates the versioned offline cache, and updates an explicitly armed preview copy.

## Controls and routes

| Action | Touch | Keyboard |
|---|---|---|
| Move | Virtual stick; optional calibrated tilt | Arrow keys or W A S D |
| Quick cut | CUT | J / Z |
| Committed attack | FINISH | K / X |
| Guard / timed parry | GUARD | I / V / Shift |
| Crouch / directional step | STEP | L / C |
| Swap / take marked item / throw | SWAP / TAKE | U / Space |
| Pause | Pause button | Escape |

Basic **Cut → Cut → Cut** and **Cut → Cut → Finish** chains work from the first wave. Confirmed light hits can link out of recovery. A whiff, a blocked cut, and a committed heavy retain their recovery costs. Strings have a four-cut cap; holding Cut does not repeat attacks.

A fresh follow-up occupies one expiring **260 ms** slot. Separate taps on adjacent simulation ticks remain separate. A simultaneous Cut + Finish chord chooses Cut. Hit-stop ages the buffer, preventing a stale tap from executing much later.

The longsword's **Guard → direction → Cut** routes are available within **450 ms** of the Guard tap:

| Direction | Arcade adaptation |
|---|---|
| Forward | Long-point entry |
| Up | High-cover crosscut — Zwerchhau |
| Down | Rising cut from below — Unterhau |
| Back | Retreating cut — Abzug |

Directions are relative to facing at the Guard tap. The dussack has its own shorter one-handed variants. Direction + Step → Cut produces a passing cut; neutral Step → Cut/Finish attacks low. A timed parry grants a Cut or Finish answer, including while Guard remains held. Each timed parry is consumed once and cannot be armed during an attack, switch, dodge, hit reaction, or guard break.

The in-game **Move guide** explains the routes and pauses the fight. Lessons improve the starting repertoire. Marked items can be collected before taking an open exit; improvised weapons can break or be thrown. Active stick input takes priority over optional tilt.

## Campaign and co-op

The existing five-level, seven-wave campaign remains, with four visual settings: cobbled streets, town gate, fencing hall, and castle court. Enemies include cudgel fighters, spear soldiers, armoured captains, and the invented grotesque boss. Clear a place, collect what remains on the road, and walk through its eastern exit. Two lesson choices provide six possible upgrades.

The Co-op screen retains manual, host-authoritative WebRTC pairing. The host creates an invitation; the guest creates an answer; the host applies that answer and starts. Two isolated browser peers were tested on one Mac. This does not establish cross-network reliability or performance on two physical phones. HTTPS/localhost is needed for secure-context browser features; network conditions may prevent direct peer connectivity.

## Testing

```sh
npm test
npm run test:browser       # live Chrome / emulated phone layouts
npm run test:runtime       # actual browser input and combat state transitions
node tools/offline-peer-audit.mjs
node tools/live-soak.mjs --headed
npm run test:webkit       # requires a working Playwright WebKit installation
```

The browser scripts expect `http://localhost:4187` and Google Chrome. Start `PORT=4187 node tools/serve.mjs` first. The first three browser audits support `BASE_URL`; the live-soak script uses the local test address. Playwright is a development dependency only. Emulation checks pointer events, viewport geometry, safe layout, and browser behavior; it is not a physical-device benchmark.

See [validation and evidence](docs/VALIDATION.md) and [review resolutions](docs/PROCEDURAL_REWORK.md). Browser screenshots are essential: the first automated pass missed toy-like anatomy, overlapping controls, and a postage-stamp portrait field. Independent review and subsequent live testing prompted additional changes.

## Deployment and debugging

GitHub Pages continues to deploy the prebuilt `site/` tree through the existing workflow. The content-hashed service worker caches only the procedural runtime and generated install icons; it looks up its own cache and ignores URL query strings. No game-art downloads are needed. Older caches are retained rather than deleting other stored builds; their storage can be managed through browser site settings.

Useful local query parameters: `?debug=1`, `?autostart=1`, and `?autostart=1&skipCountdown=1&seed=17`. `window.__FECHTSCHULE__.snapshot()` returns serializable state. `window.advanceTime(ms)` switches the current run to deterministic test stepping; restarting restores the live clock.

## Source map

`src/sim/` owns combat, AI, commands, items, and progression. `src/render/` owns procedural rigs, scenery, projection, and effects. `src/input/` owns physical edges and pointer ownership. `src/ui/` owns the menus and HUD. `src/network/` retains peer transport, and `src/app/` coordinates fixed-step updates, pause, lifecycle, and rendering. The compiled mirror lives in `site/js/`.

## Historical and intellectual-property boundaries

The cuts refer to broad distinctions in Meyer's 1570 text. Health, guard points, button commands, invulnerable steps, group hits, knockback, and the supernatural story are arcade inventions or adaptations. The journey in this game is fiction, not a documented itinerary. [Historical method and move-source notes](docs/HISTORICAL_METHOD.md) identify the source and limits. No professional HEMA reconstruction review has been performed.

Little Fighter 2 is a pacing and genre reference. No LF2 code, characters, art, music, stages, or interface assets are included. The graphics and synthesized audio are original code-generated work. The result is stylized 2D procedural illustration, not photorealistic 3D rendering.

## License

MIT for the included code and original illustrations. Historical scans, translations, fonts, or commissioned assets added later require their own license review. No font files or historical source images are distributed here.

# The Infernal Fechtschule — vertical slice

A GitHub Pages-ready, mobile-first historical-arcade horde brawler prototype. On his journey into Italy, Joachim Meyer fights through cobbled streets, a town gate, a fencing hall, and a castle court with a longsword and dussack, chooses behavioral lessons between major waves, and confronts a chained grotesque loosed from the castle crypt.

This repository contains a playable vertical slice, its TypeScript source, a progressive web app shell, an experimental two-phone WebRTC mode, tests, deployment automation, the proposed full-game layout, and a staged production roadmap.

> **Project status:** combat prototype / vertical slice. The art, move names, tuning, historical annotations, accessibility pass, and online connection flow are placeholders for testing.

## What is playable

- Arena movement on horizontal and depth axes, with soft automatic alignment when attacks start
- Tilt movement in landscape orientation, plus virtual stick, keyboard, and gamepad-ready input boundaries
- Joachim Meyer with freely switchable longsword and dussack kits, plus a short improvised kit for any weapon he picks up
- Light, heavy, mobility, guard/parry, and weapon-switch actions
- Dropped arms and health draughts on the road: the road marks what your hands can take, and Switch picks it up — press it again to hurl the find, which splits after a few landed blows
- Short buffered combo routes and hit-confirmed switch entries
- A Provoke → Take → Hit doctrine that rewards provoking attacks, parries/interceptions, and committed finishers
- Four enemy archetypes: thugs, spear soldiers, an armoured captain, and a two-phase grotesque boss
- Five levels over seven waves, each wave one idea: a crowd, a gate, a duel, a trap, a flood, a stand, and the thing the castle bound. A level is a place — one road, one setting — and its waves are fought along it; only its last wave opens the doorway east
- Two lesson choices, drawn from six behavioral upgrades
- Solo play and experimental host-authoritative two-phone co-op
- Procedural placeholder art and Web Audio cues; no external game assets are required
- Installable/offline-capable PWA packaging after the first successful load

## Run it

The compiled site is already included. No installation is required for ordinary play.

```bash
cd infernal-fechtschule-vertical-slice
node tools/serve.mjs
```

Open `http://localhost:4173`. A local server is required because browser modules, service workers, motion permission, and WebRTC do not behave reliably from `file://` URLs.

To edit the TypeScript source:

```bash
npm install
npm run build
npm test
npm start
```

`npm run build` compiles `src/` into `site/js/`, regenerates the service worker's complete precache list, and refreshes an armed preview copy (see `.freebuff/run.md`).

`npm run measure` plays the campaign with two bot policies and reports what each encounter costs — a wave's difficulty is a property of its shape rather than of a number, so it is measured rather than asserted (`--fresh` refills the bar at every wave line, `--seeds` and `--json` for more evidence).

## Levels and waves

A level is one place: a road, a setting, and the waves fought along it. Its waves arrive in order — nobody is ever placed inside the picture, so every fighter walks in from off the edge of the screen — and clearing one only brings the next on: the road, the view and anything the fallen dropped stay exactly where they were. A level does not end when its last opponent falls either: its eastern doorway bars itself for as long as anyone is standing, opens once the place is clear, and the level ends when Meyer walks out through it. The next level starts at its own western end, so each place is walked left to right and everything left on the road (cudgels, shafts, a captain's steel, a draught) can be taken up before moving on.

## Controls

| Action | Phone | Keyboard |
|---|---|---|
| Move | Tilt or virtual stick | WASD or arrow keys |
| Light attack | **L** button | J or Z |
| Heavy attack | **H** button | K or X |
| Duck / directional dodge | **MOVE** button | L or C |
| Hold guard / timed parry | **GUARD** button | I, V, or Shift |
| Switch blade / take / throw | **SWITCH** button | U or Space |
| Pause | HUD pause button | Escape |

Useful routes:

- Light → Light → Heavy
- Heavy → Light → Heavy
- Duck, then Light/Heavy for a low attack
- Direction + Mobility → dodge → Light
- Timed Guard → Heavy
- Confirmed hit → Weapon switch

On mobile, tap **Enable tilt** from the title screen, hold the phone at a comfortable landscape angle, then use **Recenter** whenever posture changes. The virtual stick remains available as a fallback.

## Two-phone co-op lab

The title screen includes a manual WebRTC pairing flow that avoids any signaling backend:

1. Host creates an invitation token and sends it to the guest.
2. Guest pastes it, creates an answer token, and returns that token.
3. Host applies the answer and starts the run once the connection is ready.

Use the same Wi-Fi network or a phone hotspot for the most useful test. The host owns enemies, random state, hits, level and wave flow, and upgrades. The guest sends inputs and renders host snapshots — snapshots that describe the whole fight, so both phones draw the same road.

Manual token exchange is a laboratory interface. The production plan replaces it with QR/room-code signaling while retaining peer-to-peer gameplay where network conditions permit. See [Networking](docs/NETWORKING.md).

## Deploy to GitHub Pages

1. Create a GitHub repository and add these files.
2. Push to the `main` branch.
3. In **Settings → Pages**, choose **GitHub Actions** as the source.
4. The included workflow uploads the prebuilt `site/` directory.

The workflow deliberately deploys prebuilt files, so a public build does not depend on a package registry. GitHub Pages serves the game over HTTPS, which is required for several mobile browser capabilities.

## Debugging

Add query parameters to the local or deployed URL:

- `?debug=1` — show combat/debug overlays
- `?autostart=1` — enter solo play automatically
- `?autostart=1&skipCountdown=1` — enter the first wave immediately

In the browser console, `window.__FECHTSCHULE__.snapshot()` returns the current serializable game snapshot.

## Repository map

```text
site/                       Prebuilt GitHub Pages/PWA output
  index.html                Game shell and overlays
  styles.css                Responsive mobile/desktop UI
  js/                       Compiled ES modules
  assets/                   Original placeholder mark
  icons/                    PWA icons
src/
  app/                      Run loop and mode orchestration
  audio/                    Procedural Web Audio feedback
  input/                    Tilt, touch, and keyboard action mapping
  network/                  Manual WebRTC and protocol definitions
  render/                   Disposable Canvas 2D view adapter
  sim/                      Deterministic combat, AI, waves, and progression
  ui/                       DOM interface: the fight's cues, menus, lessons, pairing
tests/                      Deterministic simulation tests
tools/                      Static server and service-worker generator
docs/                       Design, architecture, roadmap, and validation
.github/workflows/           GitHub Pages deployment
```

## Renderer choice

The slice uses a small Canvas 2D renderer so the downloadable build is self-contained, dependency-free at runtime, and immediately deployable. Game rules do not live in the renderer. A production team can retain this renderer or replace it with Phaser while preserving the simulation, input actions, content data, networking protocol, and DOM interface. The migration boundary is described in [Architecture](docs/ARCHITECTURE.md).

## Documentation

- [Product decision log](docs/DECISION_LOG.md)
- [Vertical-slice specification](docs/VERTICAL_SLICE.md)
- [Full game layout](docs/FULL_GAME_LAYOUT.md)
- [Technical architecture](docs/ARCHITECTURE.md)
- [Networking plan](docs/NETWORKING.md)
- [Art overhaul work order](docs/ART_OVERHAUL.md)
- [Historical method](docs/HISTORICAL_METHOD.md)
- [Playtest plan](docs/PLAYTEST_PLAN.md)
- [Roadmap and next issues](docs/ROADMAP.md)
- [Build validation](docs/VALIDATION.md)

## Intellectual-property and historical boundary

The code, interface, procedural visuals, and audio in this repository are original. *Little Fighter 2* is a genre and pacing reference only; no LF2 code, characters, art, audio, stages, or interface assets are included.

Historical people and treatises require source review before publication. The fiction should distinguish documented material, mechanically adapted material, and invented supernatural narrative. The chained grotesques and infernal crypt are invented fiction, and Meyer’s journey into Italy itself is a scholarly hypothesis rather than a documented itinerary; neither is presented as a historical claim.

## License

MIT for the included code and original placeholder assets. Historical source images, commissioned art, translations, fonts, music, and sound libraries added later require their own documented licenses.

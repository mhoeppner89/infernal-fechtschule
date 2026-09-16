# Product decision log

This file records the decisions that define the project. Change them deliberately because each affects combat, networking, controls, content cost, or historical framing.

| Area | Locked direction | Consequence |
|---|---|---|
| Camera and movement | 2.5D arena movement with horizontal and depth axes | Enemies and attacks need depth-aware positioning and silhouettes |
| Alignment | Generous soft alignment during attack startup | Attacks remain readable on touch controls without hard target lock |
| Platforms | Browser/PWA, hosted from GitHub Pages | Static client; optional services must deploy separately |
| Mobile control | Landscape tilt as default movement | Permission, calibration, smoothing, recenter, and fallback controls are core features |
| Fallback input | Virtual stick, keyboard; gamepad planned | No target phone is excluded because motion input is absent or uncomfortable |
| Multiplayer | Solo and two-phone co-op | Two-player host-authoritative networking is the production baseline |
| Local connection | Wi-Fi/hotspot/internet through WebRTC | Browser Bluetooth is outside initial scope |
| Combat fidelity | Historical arcade | Source principles shape behavior; timing and readability outrank detailed simulation |
| Core actions | Light, heavy, mobility, guard, switch | Shared grammar reduces onboarding cost across the roster |
| Techniques | Short buffered routes and contextual counters | Avoid motion commands and long strings that are unreliable on touch/tilt |
| Chain links | A connected light cut cancels its recovery; whiffs and heavies never do | Chain frame data must let each link land inside hitstun, so retuning one duration can break a route |
| String length | Hitstun decays across a string until the defender escapes | No infinite juggles; every chain ends in a window the enemy can answer |
| Weapons | Two complete kits per master | Each character has high content cost; roster expansion follows pipeline validation |
| Field arms | Any weapon dropped by the fallen can be taken with the switch button, and hurled with it, but never by walking over it | The stage arms the fight, LF2-style; no pickup button and no inventory to manage on touch |
| Take cue | The road marks every item a hand can accept with a gold ring and caret, and the HUD names the take; both are computed from the same predicate the press is | A deliberate take has to be legible before it is pressed, and the cue can never offer something the hands would refuse |
| Finds | A picked-up cudgel or shaft is a short improvised kit, never a learned route | His longsword and dussack lessons stay weapon-specific while every find is usable |
| Find durability | One pip per landed blow, and the rest ride the weapon when it is thrown | A find is a stage resource with a lifetime, not a permanent upgrade over his own steel |
| Steel drops | A captain's sword is taken only with both hands free and never twice | Hurling the club to take the steel is a decision worth making |
| Item art | Floor objects are drawn as vector art rather than generated poses | The rig has no grip for a club or spear, so finds do not block on new pose generation |
| Switching | Free neutral switching; faster hit-confirmed routes | Switching is a tactical combo branch and still carries commitment |
| Defense | Hold block, timed parry, selected attack interceptions | Offense and defense can overlap without directional simulation controls |
| Resources | Health and guard; no general stamina | The horde flow remains active and readable |
| Run | Levels hold waves; several waves per level, lesson after a wave, boss finale | Temporary build decisions create replay variation |
| Levels and waves | A level is one place — a name, one dressing, one road, and the waves fought along it — and what used to be called a wave is a level | The structure the game was actually built on: Little Fighter 2's stage is a place walked once with several fights in it, not a queue of one-room arenas |
| Level end | A level ends when every living fighter has walked out of its eastern doorway, never when the last opponent falls | The clear becomes a state the player leaves on their own terms, so the loot and the breathing space live in the gap between the last death and the walk |
| Level start | Only a new level begins at its western end, sweeping its ground; a wave inside one begins where the player is standing | The waves of a place are fought on the same road, so a boundary cannot teleport anybody or reset the view mid-level |
| Arrivals | No fighter is ever placed inside the picture: every arrival walks in from just past the visible edge (`SPAWN_APRON`, one rule in `spawnEnemy`) | The player can count what is coming and read an approach, which is how LF2 feeds a stage; it replaced four hand-placed exceptions that all put a body in front of the player |
| Finale ground | The bound thing comes up the hall from the west, behind the party | Measured arriving from the east: the fight happened in the road's last 260 px with the party jammed between the boss's bulk and the wall, and a competent bot lost a whole bar (110) in the corner |
| Camera follow | The window follows the party in both directions, tight ahead and with a trail behind | Giving ground has to be playable: a stand is a line you break off from and an ambush is answered by turning, so the ground behind the fighter cannot be off-screen |
| Camera trail | 160 px of slack on the retreating side only | A hit shoves (28 px light, 132 committed) and a window that tracked every knockback would slide the road under the fighter it frames |
| Upgrades | Behavioral lessons | Avoid opaque incremental percentage bonuses |
| Enemy arc | Thugs → soldiers → knights → demons | Each tier introduces a new combat problem and escalates the fiction |
| Enemy cadence | Tempo is per-archetype data: its own decision rate, strike window, and interrupt | Pressure comes from rhythm, not health scaling; a wave of identical archetypes still reads as one note |
| Encounter kinds | Each wave declares one idea — press, choke, ambush, flood, duel, hold, boss — and the kind decides how the fight is built | A difficulty curve is not a difficulty design; a recipe scaled by a multiplier asks the same question for longer |
| Commitment budget | `ATTACK_SLOTS` is one frozen shared value, never a per-wave override | A wave that narrows the roster to one attacker is the old pressure multiplier in quieter clothes |
| Group scheduling | A group may author the frontier that unlocks it (`from`) instead of taking an even slice of the stage | Measured: with even slices the gate's whole roster arrived before the funnel, so the fight happened on the open road and the lane was decoration |
| Trap trigger | The ambush fires when the bait line is down to its last man, not when the player crosses a mark on the road | Sprung mid-fight it cost a whole bar; sprung after the bait was dead it cost nothing at all, every seed, and promised two fires |
| Stair feed | A stand's beats walk in from off-screen like every other arrival, and the crowd brake is two rather than one | The arrival rule replaced the hand-placed mouth; with beats walking in, the queue can hold two without ever crowding the player, and one left the stand costing a competent bot nothing |
| Encounter measurement | `tools/encounter-measure.mjs` plays two bot policies; a wave is a wall when a competent one dies, spends a full bar, or will not resolve in 75 s | Tuning that is not measured is taste, and a bot that plays badly dying is not evidence of a wall |
| Bot plausibility | The measuring bot reads a fight the way a player does, including mistimed parries and turning to face, and a mistime degrades to a block | A bot with a perfect answer measured the readable archetypes as costing nothing, and a frozen bot invented walls that were not there |
| Enemy rest | The pause between swings is charged when a swing resolves, not when it commits | A slow, committed attack cannot eat its own recovery, so cadence stays comparable across archetypes |
| Armour | Plate absorbs a light without moving its wearer, and answers it | Lights are the slow, costly way through plate; committed strikes and guard breaks are the answer |
| Spear line | Holds at reach, closes and butt-strikes when crowded, thrusts through its own front rank | Hiding inside a thug screen or hugging the shaft both get punished |
| Enemy art reuse | An attack row may borrow another row's authored clip while keeping its own timing | New tempos cost no new sprites; only poses are borrowed |
| Final antagonist | Marozzo/the chains | Explicit alternative-history framing; demonic material is fictional |
| Permanent progress | Masters, lessons, cosmetics, challenges, codex | Avoid permanent stat inflation in the main skill-based mode |
| Life bars | Every living fighter carries its own bar directly above its head, with armour as a second track | Health is read off the fight rather than a corner of the screen; the corner HUD stays a bare readout |
| HUD | Nothing printed at the top of the screen: health, guard, armour, weapon and pips are drawn over the fighters, the place and the wave are announced by the banner, and the remaining cues sit in one column low in the picture | LF2 reads a fight off the fighters; a corner readout is a second place to look mid-exchange, and the only fact the world cannot show (a stand's clock) is the only one stated |
| Reference | Little Fighter 2 is the general reference for combat feel, items, and presentation | New mechanics are judged against what a LF2 player already understands before being invented from scratch |
| Recovery budget | A six-pose clip caps a player attack's recovery at 0.38 s | Commitment has to be bought with startup the art can show, or the rig has to gain sustained poses |
| Build identity | The worker's cache name is a digest of the precached bytes, not the version string | A returning tab cannot stay pinned to an old build, and an unchanged rebuild does not make every client re-download the payload |
| Precache match | The worker matches its cache with `ignoreSearch: true` for assets and for the navigation fallback | Precache keys carry no query, so `?autostart=1` missed the cache and fell through to the network for markup while the scripts still came from the previous build: fresh HTML with yesterday's JavaScript is a broken page, not an old one. A tab one build behind recovers on the next reload; a tab holding half of two does not |
| Served copies | Every copy this checkout is served from is refreshed by the build, from one place (`tools/preview-sync.mjs`, armed per checkout): a *preview* copy carries the kill-switch worker and must never be offline, a *deploy* copy carries the real worker and keeps offline support, and `npm run preview:status` says whether either has drifted | The durable copy was refreshed by hand, drifted, and served a top-of-screen HUD that no longer existed in `src/` for a week while every build kept the preview beside it current. A copy nobody edits by hand is a copy the build has to publish |
| Campaign counters | The sim holds `levelIndex` and `waveInLevel`, reads the fight as `LEVELS[levelIndex].waves[waveInLevel]`, and moves them only through `advanceWave` | A running wave count with the level derived from it needed three clamped helpers and asked "which level is this wave in" at every call site; the nesting is the model, so the data should be read that way |
| Road vocabulary | `road`, `roadBounds`, `levelExitX`, `LEVEL_EXIT`, `WAVE_CLEAR_DELAY`: one word for the ground a level is fought on | The campaign moved to levels and waves while the geometry kept saying stage, so `stageWidth` was a level's road and `stageBounds` its bounds — two names for one thing is how a reader misreads a boundary |
| Snapshot completeness | The snapshot describes the whole fight — place, scenery, wave identity, its label, the lane, the road width — and no presentation layer imports the campaign tables | The renderer re-derived the lane and the scenery from the data by index while the sim clamped the fight with its own copy of the same lane, and the DOM looked a wave up to label a clock. One authority, or two stories about one fight |
| Art for slice | Original procedural graybox | Combat can be tested without copying LF2 or delaying for a large asset pipeline |
| Runtime for slice | Engine-neutral TypeScript simulation + Canvas adapter | Playable package has no runtime dependency; renderer can later move to Phaser |

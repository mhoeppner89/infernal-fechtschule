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
| Weapons | Two complete kits per master | Each character has high content cost; roster expansion follows pipeline validation |
| Switching | Free neutral switching; faster hit-confirmed routes | Switching is a tactical combo branch and still carries commitment |
| Defense | Hold block, timed parry, selected attack interceptions | Offense and defense can overlap without directional simulation controls |
| Resources | Health and guard; no general stamina | The horde flow remains active and readable |
| Run | Several waves, lesson after major waves, boss finale | Temporary build decisions create replay variation |
| Upgrades | Behavioral lessons | Avoid opaque incremental percentage bonuses |
| Enemy arc | Thugs → soldiers → knights → demons | Each tier introduces a new combat problem and escalates the fiction |
| Final antagonist | Marozzo/the chains | Explicit alternative-history framing; demonic material is fictional |
| Permanent progress | Masters, lessons, cosmetics, challenges, codex | Avoid permanent stat inflation in the main skill-based mode |
| Art for slice | Original procedural graybox | Combat can be tested without copying LF2 or delaying for a large asset pipeline |
| Runtime for slice | Engine-neutral TypeScript simulation + Canvas adapter | Playable package has no runtime dependency; renderer can later move to Phaser |

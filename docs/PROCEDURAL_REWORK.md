# Procedural / phone / fencing rework

Base: `fc6588fe85a0785ad1f005c52b51e98daaf1d137`. Edition: 0.2.0.

## Implementation boundaries

The simulation remains authoritative. `src/sim/combo.ts` owns the bounded follow-up lifetime, guard-command window, relative direction classification, and chain cap. `world.ts` applies state transitions, hit confirmation, recovery commitment, parry consumption, weapon changes, and progression. Physical button edges belong to `InputHub`; the simulation does not reinterpret consecutive edge flags as a held button.

`procedural-rig.ts` produces poses and fixed-length weapon/limb geometry from actor state. `canvas-renderer.ts` draws tailored bodies, faces, equipment, hit reactions, trails, and feedback. `procedural-scene.ts` caches architecture drawn from paths and gradients, with four setting identities and deterministic detail. No sprite frames or bitmap background assets are loaded. Install PNG icons are generated from source SVG by `tools/generate-app-icons.mjs`.

The canvas preserves uniform scale. Its logical width follows the available field, with a fixed logical height, local-player camera framing, and a capped rendering resolution. Portrait retains a tall playable field. Landscape has separate thumb rails. Menus and the combat HUD remain DOM surfaces; input is isolated while a modal is open or text is being edited.

The existing five-level/seven-wave campaign, lessons, items, procedural audio, and manual host-authoritative WebRTC mode remain. No signaling service or runtime dependency was added.

## Independent reviews

Three separate read-only Codex review processes examined the original baseline, the first integrated visual/mobile candidate, and the revised combat implementation. They did not serve as historical experts or physical-device testers. Their findings are preserved in `docs/reviews/`; this document records the integration response rather than implying independent final sign-off.

| Finding | Resolution and evidence |
|---|---|
| Basic chains required lessons | Starting chains are available immediately; lesson behavior and regression assertions updated. |
| Early or adjacent fresh Cut taps disappeared | Physical edges are retained and the one follow-up slot lasts 260 ms. Live browser repro and adjacent-tick regression cover both weapons. |
| A Guard tap during an attack granted free parries | Only legal neutral/guard postures arm a timed parry; each is consumed once. Direct two-attacker regression added. |
| Guard command entered during a weapon switch survived it | Switch state cannot record a guard command; switch initialization clears it. |
| A late crouch tap became an unintended standing cut | Expired crouch intent is cleared before neutral is entered. |
| Broken clubs could chain into club moves while holding a sword | Follow-up routing validates both current and destination attack kits against the current weapon. |
| A second pointer stole a button or stick | Explicit pointer ownership, per-button reference counting, dynamic stick geometry, and lifecycle release. |
| Tilt overrode a deliberately held stick | Stick ownership now takes priority; a focused input regression covers release back to tilt. |
| Portrait field was too small and touch buttons overlapped | Tall responsive field, separate rails, 64 px main actions, non-overlapping hit regions, geometric and live multi-touch checks. |
| Fighter bodies looked like jointed toys | Replaced thick-stroke limbs and black joint circles with continuous tapered cloth geometry, tailored torsos, faces, and differentiated equipment. |
| “Practice” opened only instructions | Renamed it Move guide and documented actual functionality. |
| An enormous offline payload retained retired art | Removed the old catalogs, gallery, generators, and 952 art files; cache contains only the procedural runtime and generated icons. |

## Deliberate gameplay choices

The controls favor short, readable action sequences. A simultaneous Cut + Finish chord chooses Cut. The follow-up buffer contains one intent, not an unlimited queued string. Hit-stop ages that intent. Confirmed lights may cancel recovery into their next move; whiffs and blocks pay recovery, heavies remain committed, and chains have a cap. A directional Guard command keeps the facing recorded at the Guard tap.

These are arcade decisions. A rising Unterhau is represented as a cut originating below toward the torso, while the separate crouching attack handles the game's low-line attack. The retreating longsword cut no longer receives an oversized rear hit region. Timing, target regions, damage, health, and invulnerability are not historical measurements.

## Visual validation matters

The first Chrome pass passed its original layout checks despite visible weaknesses. Screenshot review prompted a second anatomy/scenery pass, a different portrait camera, separated action hit regions, larger readable HUD text, and correction of the side-scrolling road's paving projection. The test suite now checks overlap, field obstruction, button hit ownership, scale, portrait field height, and guide pause/resume.

Scenery screenshots are explicitly labelled **Visual fixture**. They use the actual renderer with authored actor/scenery snapshots and a paused browser clock; they demonstrate rendering coverage, not campaign completion. Normal live combat and defeat/restart are exercised separately through browser keyboard input. This separation prevents a scheduled live render from silently replacing a screenshot fixture.

## Remaining boundaries

The art direction is stylized 2D illustration. Visual quality and game feel still require human judgment. No claim of photorealism, exact LF2 equivalence, specialist HEMA approval, or physical-phone performance is made.

Chrome was exercised on the connected Mac through Remote Desktop Commander, including a headed session and emulated touch devices. WebKit was installed for an additional test attempt but did not finish launching; its test processes were terminated. Safari/iOS behavior is therefore unverified. The co-op test used two isolated browser peers on one computer, not two remote physical phones. No whole-campaign human playthrough was performed; campaign completion is covered by deterministic simulation tests.

Main is intentionally left unchanged. Review the implementation branch and its pull request before deploying this edition.

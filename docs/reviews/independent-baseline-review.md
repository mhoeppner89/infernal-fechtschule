Audit completed against clean commit `fc6588f`; no files changed.

Read-only verification:

- Targeted combat, touch, rendering, and scrolling tests: 23/23 passed.
- Full test run: 114 passed; 12 `preview-sync` failures were sandbox-only `EPERM` errors creating `/tmp` fixtures.
- Existing tests cover distinct-button multitouch and Duck ordering, but not the edge cases below.

Findings, highest priority first:

1. P0 — Timed parry bypasses guard state and is reusable

Evidence: [`world.ts:645–647`](src/sim/world.ts:645) arms parry on any `guardPressed`, before state validation. [`world.ts:1517–1550`](src/sim/world.ts:1517) accepts any positive `parryWindow` and never consumes it.

Reproduction: put the player in `attack` with `guardHeld=false`; place two front-facing enemies in active `thug_body` attacks; inject one `guardPressed` edge. The current harness produces two `parry` events while the player remains in `attack`.

Acceptance: one guard edge resolves at most one timed parry, and presses during `hitstun`/`guardbreak` cannot arm a future parry. If attack-state parries are intentional, that rule needs to be explicit and still single-use.

2. P0 — Light/heavy buffering loses input order

Evidence: [`input.ts:59–89`](src/input/input.ts:59) collapses edges into booleans. [`controller.ts:460–489`](src/app/controller.ts:460) OR-merges them. [`world.ts:760–764`](src/sim/world.ts:760) and [`world.ts:813–817`](src/sim/world.ts:813) prefer Light when both are present.

Reproduction: tap Light, then Heavy, before the next fixed simulation step or during hit-stop. The merged frame contains both edges, but the player starts only `ls_l1`; the Heavy edge disappears.

Acceptance: record L→H and H→L tap sequences at 60/90/120 Hz and during hit-stop. The simulation trace must preserve both edges in order, or reject simultaneous sequences with an explicit documented rule.

3. P1 — Reaction input buffer never expires

Evidence: [`world.ts:1842–1877`](src/sim/world.ts:1842) retains edges during reaction states, but stores no timestamp or age. Guard break lasts up to 0.9 seconds at [`world.ts:1576–1582`](src/sim/world.ts:1576).

Reproduction: set the player to `guardbreak`, press Light once, then send neutral input. At this commit, `ls_l1` starts around frame 54, after recovery.

Acceptance: define an action-specific buffer TTL. A press just inside the TTL should execute; the same press after the TTL should expire. In particular, an attack pressed at least 300 ms before guard-break recovery should not auto-fire.

4. P1 — Touch buttons are not pointer-owned

Evidence: [`touch.ts:8–13`](src/input/touch.ts:8) tracks held state only by button. [`touch.ts:49–69`](src/input/touch.ts:49) deletes the held state on any pointer release.

Reproduction: on the Guard button, pointer 1 down → pointer 2 down → pointer 1 up. `isHeld('guard')` becomes false even though pointer 2 remains down.

Acceptance: held state remains true until every owning pointer releases or cancels; duplicate pointers produce only one press edge. Add this case alongside the existing distinct-button test at [`touch-controls.test.mjs:79–85`](tests/touch-controls.test.mjs:79).

5. P1 — Virtual movement has unstable ownership and scale

Evidence: [`touch.ts:78–100`](src/input/touch.ts:78) lets every joystick pointer replace the current owner. [`touch.ts:106–116`](src/input/touch.ts:106) hardcodes a 52 px radius, while short-landscape CSS makes the joystick 82 px wide at [`styles.css:937–948`](site/styles.css:937).

Measured result: center-to-rim travel is about 41 px, so a full visible throw produces only `41/52 = 0.788` movement.

Also, enabled tilt overrides the stick whenever nonzero at [`input.ts:43–52`](src/input/input.ts:43), despite the README describing the stick as a fallback.

Acceptance:

- A second joystick pointer cannot steal ownership from the first.
- At 568×320, dragging to the visible rim produces at least 0.95 normalized movement.
- While the stick is actively touched, its output either wins over tilt or a clear input-mode control exists.

6. P1 — Defensive state and small-screen controls are not sufficiently readable

Evidence: [`canvas-renderer.ts:1477–1493`](src/render/canvas-renderer.ts:1477) paints health and armour only; `guard` is never rendered. The HTML comment claims guard is visible at [`index.html:58–60`](site/index.html:58).

In short landscape, action labels are `0.38rem`—about 6 px—and Switch is only 43×43 px at [`styles.css:957–975`](site/styles.css:957).

Acceptance: at 568×320 and 667×375, a screenshot must make guard depletion and guard break distinguishable without reading floating text. Action labels should be readable at 100% scale, and all controls should meet at least a 44×44 px touch target. This directly tests the product criterion in [`VERTICAL_SLICE.md:185–193`](docs/VERTICAL_SLICE.md:185).

7. P2 — The graphics path is asset-backed, not fully procedural, and stretches the road

Evidence: sprites are preferred whenever loaded at [`canvas-renderer.ts:1021–1045`](src/render/canvas-renderer.ts:1021); the manifest references six-frame WebP files at [`animation-manifest.ts:217–225`](src/render/animation-manifest.ts:217). Backgrounds and road are also WebP assets at [`background-catalog.ts:56–98`](src/render/background-catalog.ts:56).

Separately, the 2172×724 road is drawn into a 2360×488 rectangle at [`canvas-renderer.ts:309–333`](src/render/canvas-renderer.ts:309), creating roughly 61% relative anisotropic stretch.

Acceptance:

- Instrument image loading and run with no image assets; all characters and scenery must still render at equivalent quality if “fully procedural” is literal.
- Preserve the road’s aspect ratio or keep nonuniform scaling below 5%; validate stone/perspective landmarks in a screenshot.

8. P2 — Historical grounding is documented as a plan, not enforced in content

Evidence: [`types.ts:69–120`](src/sim/types.ts:69) has no provenance field. The attack definitions at [`attacks.ts:29–160`](src/sim/attacks.ts:29) contain gameplay labels and numbers but no source, adaptation, or invention status. The repository itself calls move names and annotations placeholders at [`README.md:7`](README.md:7), while the historical method requires provenance and reviewer signoff at [`HISTORICAL_METHOD.md:7–23`](docs/HISTORICAL_METHOD.md:7).

Acceptance: every public move, lesson, character claim, and historical story element should carry `Documented`, `Adapted`, or `Invented`, a source reference where applicable, and an adaptation note, followed by HEMA reviewer signoff. Automated coverage should verify that every published route has such metadata.
# Roadmap and next steps

## Current milestone — 0.1 vertical-slice package

Delivered:

- Deterministic fixed-step TypeScript simulation
- Meyer longsword and dussack graybox kits
- Soft alignment and attack-permission AI
- Thug, spear, captain, wretch, and grotesque encounters
- Six behavioral lessons and two offers
- Tilt, touch, and keyboard input
- Responsive DOM HUD and menus
- PWA/offline packaging
- GitHub Pages workflow
- Manual WebRTC host/guest laboratory
- Automated simulation tests
- Full-game design and technical plans

This is a design-validation build, not a production alpha.

## Immediate sequence

### Milestone 0.2 — physical input validation

Goal: decide whether tilt can be the default movement method.

Work:

1. Test on iOS Safari and Android Chrome across 60/90/120 Hz devices.
2. Add an interactive calibration room and live tilt visualization.
3. Add sensitivity, dead-zone, axis inversion, and recenter settings.
4. Add left-handed button layout and resize/reposition controls.
5. Add Gamepad API support for desktop/local testing.
6. Add haptic feedback where supported, with an off switch.
7. Record local input diagnostics and action-edge retention.

Exit criteria:

- No systemic missed-tap problem at high refresh rates.
- Most testers calibrate without verbal instruction.
- Virtual stick is fully viable when tilt is unavailable or uncomfortable.

### Milestone 0.3 — combat feel and readability

Goal: prove that historical-arcade timing survives horde combat.

Work:

1. Create a dedicated training scene with frame advance, dummy recording, and hitbox view.
2. Tune alignment cone, correction cap, and target stickiness.
3. Add separate audiovisual signatures for block, parry, interception, armor, and guard break.
4. Tune attack-token director by player count and difficulty.
5. Add knockback collisions and crowd chain reactions.
6. Add revive/downed behavior for co-op.
7. Balance every lesson combination against the boss.
8. Replace working route names only after source review.

Exit criteria:

- Novices can intentionally perform one signature route.
- HEMA-informed testers recognize tactical identity without requiring simulation-level controls.
- Both weapons solve different encounter problems.

### Milestone 0.4 — production co-op foundation

Goal: replace the laboratory pairing and snapshot-only guest with release-grade two-player sessions.

Work:

1. Version protocol and content hashes.
2. Add room-code/QR signaling service.
3. Add TURN relay credentials and route diagnostics.
4. Split realtime and reliable channels.
5. Add guest local prediction and remote interpolation.
6. Add bounded host rewind for parries/dodges.
7. Add reconnect and host-continues-solo behavior.
8. Add network simulation tests for delay, jitter, and loss.
9. Validate input and message ranges against untrusted peers.

Exit criteria:

- Three consecutive complete runs under each required network condition.
- Corrections rarely produce visible teleportation.
- Defensive timing remains useful at ordinary consumer-network latency.

### Milestone 0.5 — production art pipeline

Goal: estimate the true cost of one complete master.

This milestone is specified in detail in the [art overhaul work order](ART_OVERHAUL.md):
style block, frame contract, the three signature longsword combos, the road, the backdrop
hangings, and the batch order. Its numbered work list below is unchanged.

Work:

1. Approve Meyer’s production silhouette and palette.
2. Author idle, locomotion, guard, hit, death, switch, and all combat strips for one kit.
3. Normalize bottom-center anchors and scale.
4. Add animation manifest and combat-event markers.
5. Integrate effects, weapon trails, impacts, shadows, and depth occlusion.
6. Add one production arena and environment transition.
7. Establish texture, memory, and download budgets.
8. Run screenshot and animation regression tests.

Exit criteria:

- Longsword kit is visually complete at target phone scale.
- Animation pipeline can reproduce consistent output without manual crisis work.
- Cost per kit is known well enough to budget the roster.

### Milestone 0.6 — second master

Goal: prove the architecture supports genuinely different fencing identity.

Recommended candidate: **Giovanni dall’Agocchie**, subject to research review.

Work:

1. Research dossier and source review.
2. Define sidesword and sidesword-with-cape roles.
3. Create a distinct doctrine rather than reskinning Meyer’s opening rule.
4. Implement complete graybox move data and lesson pool.
5. Add co-op synergies and duplicate-character edge cases.
6. Test whether the shared five-action grammar remains learnable.

Exit criteria:

- Testers identify the two masters from behavior with placeholder visuals.
- Neither master dominates every enemy tier.
- Co-op pairings create complementary choices without mandatory compositions.

### Milestone 0.7 — expanded public demo

Goal: turn the technical slice into a representative public demo.

Scope target:

- 2 complete masters
- 3 production enemy roles + elite + boss
- 1 complete act and 1 infernal transition
- Automatic room-code co-op
- Training hall
- Settings/accessibility pass
- Basic codex with documented/adapted/invented labels
- Local playtest report export

### Milestone 0.8 — content alpha

- Four masters
- Three human acts
- Full lesson architecture
- Multiple bosses
- Save/profile migration
- Challenge mode
- Internal localization pipeline
- Performance and compatibility matrix

### Milestone 1.0 — complete initial release

- Six masters / twelve kits, subject to validated production cost
- Human-to-infernal full run
- Marozzo finale
- Solo and two-player co-op
- Training, challenges, codex, accessibility, and offline support
- Complete credits, licenses, provenance, and source review

## Issue-ready next backlog

Create these issues in order.

### P0-01 — physical-device smoke-test sheet

**Deliverable:** completed matrix for at least one iPhone and one mid-range Android.

**Acceptance:** boot, solo start, tilt permission, recenter, all buttons, pause, upgrade, boss, and restart are recorded with device/browser/build.

### P0-02 — deterministic replay test

**Deliverable:** record seed + input frames, replay them, and compare snapshot hashes at fixed checkpoints.

**Acceptance:** ten-minute simulated run reproduces identical hashes in repeated Node executions.

### P0-03 — input calibration scene

**Deliverable:** visible neutral point, live axes, dead-zone ring, sensitivity preview, confirm/retry.

**Acceptance:** settings are retained locally and gameplay starts only after a valid calibration or explicit virtual-stick choice.

### P0-04 — combat event distinction pass

**Deliverable:** unique color-independent visual shapes and sounds for hit, block, parry, interception, armor, and guard break.

**Acceptance:** at least 80% identification in a blinded six-clip test.

### P0-05 — attack-director instrumentation

**Deliverable:** debug overlay/log for permission owner, queued attacker, target player, and denied reason.

**Acceptance:** no ordinary wave exceeds configured concurrent pressure without a logged override.

### P0-06 — two-phone network trace

**Deliverable:** local export of connection state, RTT, jitter, input sequence gaps, snapshot size, and correction distance.

**Acceptance:** one complete same-Wi-Fi iPhone/Android run produces a readable trace without personal identifiers.

### P1-07 — signaling service spike

**Deliverable:** disposable room-code/QR connection flow with short-lived rooms.

**Acceptance:** two phones connect without copying SDP tokens; no permanent credential is shipped in the client.

### P1-08 — guest prediction prototype

**Deliverable:** predicted local movement/attack animation with host reconciliation.

**Acceptance:** under simulated 100 ms RTT, local movement feels immediate and p95 correction remains below the selected visual threshold.

### P1-09 — training hall

**Deliverable:** dummy, route list, frame-state display, slow motion, restart position, and optional recorded attack response.

**Acceptance:** every Meyer route can be reproduced and inspected without entering the run.

### P1-10 — Meyer source dossier

**Deliverable:** versioned document connecting doctrine, move labels, descriptions, and visual references to source evidence or explicit adaptation/invention labels.

**Acceptance:** historical reviewer completes a first pass and every public-facing claim has a provenance status.

### P1-11 — production longsword seed animation

**Deliverable:** approved idle plus one complete light route at final in-game scale.

**Acceptance:** silhouette, anchor, costume, weapon length, and timing remain stable across the strip and on two phone sizes.

### P1-12 — Giovanni preproduction brief

**Deliverable:** research scope, doctrine hypothesis, two-kit contrast, control routes, animation budget, and uncertainty register.

**Acceptance:** design review establishes that the fighter is mechanically distinct before asset production.

## Scope controls

Defer these until the corresponding risk is resolved:

- Additional masters before Meyer’s production cost is measured
- Four-player co-op before two-player reconciliation is stable
- Public matchmaking before private room connections are reliable
- Accounts/cloud saves before local profile migration is robust
- Procedural stages before authored encounter readability is proven
- Permanent power progression before run balance is stable
- Native Bluetooth before there is a separate native-product case

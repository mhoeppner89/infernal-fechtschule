# Playtest and QA plan

## Principle

The slice exists to test risky interactions, not to maximize content. Every session should produce evidence about tilt, alignment, combat comprehension, weapon differentiation, crowd fairness, lessons, performance, or networking.

## Stage 0 — deterministic and static checks

Run on every change:

```bash
npm test
```

Required automated coverage:

- Combo-route resolution
- Attack timing boundaries
- Lesson transformations
- Soft-target ranking and stickiness
- Wave/lesson progression
- Snapshot serialization
- Fixed-seed determinism from recorded input
- Protocol schema compatibility
- Service-worker precache paths
- DOM IDs referenced by TypeScript

## Stage 1 — developer combat lab

Use `?debug=1&autostart=1&skipCountdown=1`.

For each weapon:

1. Execute every neutral and branched attack.
2. Confirm startup, active, recovery, movement, target count, and arc.
3. Check front/rear/depth boundaries with visible debug regions.
4. Test blocked and hit-confirmed routes separately.
5. Test interruption at every attack phase.
6. Test parry counter and attack interception.
7. Test raw switch versus hit-confirmed switch.
8. Repeat against thug, spear, captain, and boss.

Record a defect whenever the animation implies a different range or timing from the simulation.

## Stage 2 — physical mobile control test

Minimum devices:

- One recent iPhone/Safari
- One older supported iPhone/Safari if available
- One mid-range Android/Chrome
- One 90 or 120 Hz Android device
- One small phone with a notch/safe area

Scenarios:

- First permission and calibration
- Recenter while standing, sitting, and changing grip
- Continuous tilt plus rapid alternating attacks
- Directional dodge while tapping near the screen edge
- Guard hold with another simultaneous touch
- Portrait-to-landscape transition
- Background/resume and screen lock
- Installed PWA launch
- Virtual-stick fallback with motion disabled
- Left-handed layout once implemented

Measurements:

- Calibration completion time
- Missed or duplicate action rate
- Unintended movement caused by action tapping
- Comfortable tilt range
- Recenter frequency
- Session discomfort/fatigue rating
- Frame time, memory, thermal behavior, and battery use

## Stage 3 — novice comprehension test

Participants should not receive a spoken combo tutorial before the first run.

Suggested sample:

- 8–12 players familiar with action games but not HEMA
- 4–6 HEMA practitioners or historically informed fencers
- Mix of phone sizes and dominant hands

Observe:

- Time to move intentionally in both axes
- First deliberate weapon switch
- First successful signature route
- Whether players infer spear counterplay
- Whether they recognize why the captain resists light pressure
- Whether they distinguish block from parry
- Lesson reading time and decision rationale
- Weapon usage share by encounter
- Boss deaths and perceived fairness

After play, ask players to demonstrate rather than merely describe one route and one enemy counter. Demonstration exposes false confidence.

## Stage 4 — two-phone network test

Test matrix:

| Network | Device pairing | Runs |
|---|---|---|
| Same Wi-Fi | iPhone ↔ Android | 3 complete |
| Same Wi-Fi | Android ↔ Android | 3 complete |
| Phone hotspot | host in each direction | 3 complete each |
| Artificial 100 ms RTT | mixed | 3 complete |
| 3% loss + jitter | mixed | 3 complete |
| TURN relay | mixed | 3 complete |

Capture:

- Connection success and time
- ICE route type
- RTT, jitter, and loss
- Guest input-to-host acceptance delay
- Reconciliation distance and frequency
- Parry/dodge rewind amount
- Disconnections and recovery
- Snapshot size and bandwidth
- Host frame time with maximum enemies

## Stage 5 — visual and accessibility QA

Capture screenshots at desktop and representative landscape mobile sizes for:

- Title screen
- Tilt permission/calibration state
- Ordinary wave
- Crowded mixed wave
- Lesson selection
- Boss phase 1 and phase 2
- Pause
- Victory and defeat
- Host and guest pairing screens
- Rotate-device overlay

Review:

- Playfield obstruction
- Text size and contrast
- Safe-area handling
- Button reach and overlap
- Silhouette separation by depth
- Telegraph visibility behind effects
- Reduced-motion behavior
- Keyboard focus and screen-reader labels for menus
- Color-independent status cues

## Local diagnostic record

Do not add third-party analytics during early testing. Provide a local JSON export containing:

```json
{
  "build": "0.1.0",
  "device": { "viewport": "...", "refreshEstimate": 60 },
  "run": { "seed": 123, "duration": 0, "outcome": "victory" },
  "combat": {
    "damageTaken": 0,
    "blocks": 0,
    "parries": 0,
    "weaponSeconds": { "longsword": 0, "dussack": 0 },
    "signatureRoutes": {}
  },
  "input": { "mode": "tilt", "recenterCount": 0, "droppedEdgeEstimate": 0 },
  "network": { "role": "solo", "rttMedian": null, "correctionP95": null }
}
```

Ask participants before collecting or sharing diagnostic files.

## Decision thresholds

Proceed to production character art only when:

- Tilt or virtual-stick controls are acceptable on target devices.
- At least one novice-observed route feels intentional rather than accidental.
- Both weapons receive situational use.
- Crowd pressure feels demanding without common unavoidable overlap.
- Captain and boss failures are explainable from visible cues.
- Host-authoritative co-op can complete repeated runs.

Rework the control/combat model before adding a roster when these conditions fail.

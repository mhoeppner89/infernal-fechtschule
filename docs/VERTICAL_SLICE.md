# Vertical slice: Meyer’s Italian Journey

## Purpose

This slice is designed to answer six high-risk questions before roster or content production begins:

1. Does tilt movement remain controlled while the player taps action buttons?
2. Does soft alignment make 2.5D weapon combat readable without turning into hard lock-on combat?
3. Can a shared five-action grammar express recognizable differences between two weapons?
4. Does Provoke → Take → Hit remain legible under horde pressure?
5. Do behavioral lessons create meaningful run variation after only two choices?
6. Can two phones complete a host-authoritative run with acceptable correction and defensive timing?

It is intentionally compact. One polished fighter with two kits tests more of the game’s premise than several shallow fighters.

## Delivered slice

### Player character

**Joachim Meyer**

Shared characteristics:

- 110 health
- 72 guard
- Buffered attacks and short cancel routes
- Timed guard press creates a parry window
- Selected attacks contain interception frames
- Heavy provoking attacks can establish the first intention
- A parry or interception establishes the taking action
- A heavy hit during the resulting opening completes the doctrine payoff

### Longsword kit

Role: reach, frontal crowd control, guard pressure, and deliberate interceptions.

Primary routes:

| Input route | Result |
|---|---|
| Light | Opening Hew |
| Light → Light | Crossing Hew with interception frames |
| Light → Light → Light | Threefold Cut crowd finisher |
| Light → Heavy | Provoking Hew |
| Light → Light → Heavy | Crossing Breaker |
| Heavy → Light | Taking Cut |
| Heavy → Light → Heavy | Crossing Breaker |
| Dodge → Light | Passing Cut |
| Jump → Light | Descending Hew |
| Parry → Heavy | Master Cut |
| Hit → Switch | Dussack Entry |

### Dussack kit

Role: fast pressure, rapid target changes, circular finishers, and passing movement.

Primary routes:

| Input route | Result |
|---|---|
| Light | Forehand Cut |
| Light → Light | Backhand Cut with interception frames |
| Light → Light → Light | Circular Pursuit |
| Light → Heavy | Pressing Cut |
| Light → Light → Heavy | Wheel Cut |
| Heavy → Light | Reversing Cut |
| Heavy → Light → Heavy | Wheel Cut |
| Dodge → Light | Passing Step |
| Jump → Light | Leaping Cut |
| Parry → Heavy | Cut Around |
| Hit → Switch | Long Edge Entry |

Move names are working design labels. They should be reviewed against primary or scholarly sources before being presented as historical terminology.

## Encounter sequence

| Beat | Content | What it tests |
|---|---|---|
| Calibration/countdown | Free movement and visible controls | Tilt, recentering, virtual-stick fallback |
| The Cobbled Streets — Street Rabble | 6 club thugs | Broad cuts, alignment, crowd positioning |
| The Town Gate — Pike and Press | 4 thugs + 2 spear soldiers | Depth movement, dodge timing, threat priority |
| Lesson I | 1 of 3 lessons | First build commitment |
| The Sala d’Armi — The Armoured Lesson | 3 thugs + 3 spears + 1 captain | Guard pressure, armor opening, deliberate switches |
| Lesson II | 1 of 3 lessons | Cross-kit synergy |
| The Castello — The Bound Grotesque | Two-phase boss with summoned bound wretches | Full combat loop and supernatural escalation |
| Result | Replay or title | Completion, failure, and restart flow |

Enemy counts scale in two-player mode. The design should favor additional bodies and attack permissions over inflated health pools.

## Enemy roles

### Club thug

- Closes distance directly
- Uses a slow, readable overhead attack
- Interruptible by most player attacks
- Low health and guard
- Tests crowd control rather than individual execution

### Spear soldier

- Seeks a longer fighting distance
- Uses a narrow, long thrust
- Forces movement along the depth axis
- Becomes vulnerable after commitment
- Should remain visible behind the front line

### Armoured captain

- Has armor and stronger guard behavior
- Resists ordinary light-hit interruption
- Can block and punish careless frontal pressure
- Opens after parries, guard break, committed misses, or doctrine payoff
- Tests whether weapons have situational value rather than cosmetic differences

### Bound wretch

- Fast, weak summoned creature
- Adds spatial pressure during the boss encounter
- Dies quickly to broad routes

### Bound grotesque

- Radial sweep
- Forward leap with shockwave
- Unparryable chain rupture
- Second phase below half health
- Summons bound wretches
- Resists ordinary hit-stun while preserving clear punish windows

## Lesson pool

Each lesson changes a move or route rather than applying an opaque percentage bonus.

| Lesson | School | Behavior |
|---|---|---|
| Returning Sweep | Longsword | Threefold Cut gains depth, target capacity, and knockback |
| Control the Centre | Longsword | Doctrine payoff gains damage and armor pressure |
| Complete the Wheel | Dussack | Circular Pursuit and Wheel Cut become stronger radial attacks |
| Passing Step | Dussack | Dodge-light travels farther, remains safer, and can hit another target |
| Quick Change | Shared | Hit-confirmed switches execute faster and flow into switch-entry attacks |
| Second Intention | Shared | A blocked provoking attack can recover into guard sooner |

Offer 1 contains Returning Sweep, Passing Step, and Quick Change. Offer 2 contains Control the Centre, Complete the Wheel, and Second Intention.

## Combat readability rules

- No more than a small attack-token budget may pressure each player simultaneously.
- Enemy preparation must remain visible for at least one human reaction interval.
- Attack alignment ends when active frames begin; movement can still cause a miss.
- The previous combo target receives a modest targeting preference.
- Block, parry, weapon interception, armor hit, guard break, and flesh hit require distinct audiovisual feedback.
- Effects must preserve silhouettes and attack lines.
- The strongest screen shake belongs to boss transitions, guard breaks, and finishers; routine hits use restrained feedback.

## Mobile interface budget

Persistent combat UI:

- Player health/guard and weapon at upper left
- Wave title at upper center
- Score at upper right
- Small doctrine indicator below the player HUD
- Boss bar only during the boss
- Virtual movement zone at lower left
- Four-button action diamond plus smaller weapon switch at lower right

The center and lower-middle of the arena remain clear. Menus, lesson descriptions, network pairing, and settings use DOM overlays outside live combat.

## Slice exclusions

- Second playable master
- Marozzo’s complete final-boss implementation
- Public matchmaking or accounts
- Automatic signaling service
- Four-player co-op
- Permanent statistical progression
- Production sprites, environments, music, voice, or treatise images
- Full codex and source annotations
- Analytics collection
- Native-app Bluetooth networking

## Definition of done for the slice

The included code is a functional prototype. Product-level completion requires physical-device evidence for all criteria below:

1. A new player completes calibration without explanation in under 30 seconds.
2. At least 80% of intentional taps register during movement on 60, 90, and 120 Hz devices.
3. Players report alignment as helpful, and visible correction rarely exceeds roughly one-third of a body width.
4. Most first-session players deliberately execute one signature route by the second encounter.
5. Players select both weapons in response to enemy situations during a run.
6. Block, parry, interception, armor contact, and guard break are distinguishable without reading text.
7. A representative mid-range phone sustains the selected frame target with the maximum slice enemy count.
8. Two phones complete three consecutive runs without a session-ending desynchronization.
9. Guest corrections are small enough that ordinary movement does not visibly teleport.
10. Every combination of the two offered lessons leaves the boss beatable.

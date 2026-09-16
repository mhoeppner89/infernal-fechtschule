Original prompt: My initial play test is okay. Animations etc. all feel very sluggish however, combos are not visually interesting. Your goal is to create the full current artwork (characters, weapons, backgrounds, that can also move etc.) and animation using a gauntlet against Little Fighter 2. Animations should feel crisp and interesting. Research best practices for fighting games to do a great job and don't stop until fighting looks and feels perfect.

# Current goal

Create and integrate a complete original art and animation pass for the existing vertical slice, then iterate through an independent builder/critic gauntlet until matched combat captures beat Little Fighter 2 on pose clarity, impact, responsiveness, and combo interest.

# Gauntlet bar

- Little Fighter 2 official overview and screenshots: https://lf2.net/en/intro.html
- Matched gameplay reference: https://www.youtube.com/watch?v=wklqGG2FrEM (clean exchange at 2:30; crowd fight at 1:33)
- Additional LF2 captures: https://www.youtube.com/watch?v=qfSiEEjocmA and https://www.youtube.com/watch?v=FfvzkO0D_tc
- Animation practice reference: Mariel Cartwright, “Fluid and Powerful Animation within Frame Restrictions”: https://www.gdcvault.com/play/1020017/Animation-Bootcamp-Fluid-and-Powerful

# Working quality rules

- Original assets only; Little Fighter 2 is a motion/readability benchmark.
- Strong readable key silhouettes at the actual phone scale.
- Player attacks get at least one brief anticipation pose without delaying accepted input.
- Each attack uses anticipation, directional smear/arc, contact key, overshoot, and decisive recovery where its timing permits.
- Key poses use intentional uneven holds; no uniformly eased limb interpolation.
- Hit, block, parry, interception, armor, and guard break must remain distinguishable without color alone.
- Every current actor, weapon, attack, movement, hurt, guard, defeat, wave setting, and infernal transition needs a complete manifest entry.

# Status

- Goal created.
- Baseline tests passed before implementation: 15/15.
- Browser baseline showed functional combat but procedural figures, uniformly interpolated weapon motion, weak pose separation, and crowded phone HUD.
- Independent research, architecture inventory, and baseline critic are complete.
- The baseline loses decisively to LF2 on crowd readability, whole-body attack posing, contact impact, and combo identity.
- Deterministic `advanceTime` and `render_game_to_text` browser hooks are integrated and smoke-tested.
- Simulation snapshots now expose movement/weapon/death fields; death timing, finite block serialization, interception events, and armor impact classification are fixed.
- The approved original Meyer seed and four-frame longsword idle are normalized in `site/assets/art/`.
- Added component-aware strip normalization so long weapons and smears are not cut by equal-width cells.
- Integrated the first four-pose Meyer attack, a typed 70-clip animation inventory/catalog, and runtime asset-readiness reporting.
- Completed and integrated all four original wave backgrounds with ambient motion and transition support.
- Approved distinct thug, spearman, captain, wretch, and Bound Grotesque seeds.
- Completed, normalized, visually inspected, and registered every current enemy clip: idle, locomotion, hitstun, defeat, captain block/guard break, and all eight enemy/boss attacks.
- Supernatural attacks now have separate silhouette families: stretched claw rake, horizontal chained-fist sweep, airborne body slam, and planted ground shock.
- Added manual pose-boundary support to the strip normalizer for capes, boots, chains, and long weapons that touch across generated cells.
- Completed, normalized, visually inspected, and registered Meyer’s full longsword kit: nine states and eleven distinct attacks.
- Approved a historically grounded steel Dussack master based on Meyer-era and museum references, then completed, normalized, visually inspected, and registered its nine states and eleven attacks.
- Added fixed 2-by-2 grid extraction to preserve prone bodies and wide smears without clipping when poses overlap horizontally.
- The full 70-clip current animation inventory now has authored assets and timing; no planned placeholders remain.
- Aligned authored anticipation, contact, and recovery keys to every attack's actual startup/active/recovery windows; accepted input is visibly acknowledged on the next 60 Hz step.
- Converted all 280 runtime frames to 384 px WebP while retaining editable PNG sources; the complete four-background runtime art payload is now practical to ship.
- Added deterministic impact marks, hit-type-specific feedback, camera response, asynchronous crowd poses, a subdued play band, and a warm player edge for melee readability.
- Shortened the slowest Dussack recovery windows. Final contact spacing is 0.30–0.45 seconds for the two quick branches and 0.45–0.48 seconds for the heavy wheel branch.
- First fresh gauntlet critic scored the build 5–4 over LF2. Its four losses (impact, rhythm, crowd readability, visual hierarchy) drove a focused second pass: compact one-beat sparks, a clean true recovery frame, fixed-HUD combo count, clearer figure separation, and faster heavy branch cadence.
- A stricter second critic scored the next evidence set 3–6 because same-depth targets still covered Meyer, the long wave banner obscured the dedicated crowd proof, and the combo sheet showed authored contact poses without live targets. That evidence correctly exposed three remaining presentation flaws.
- The local attacking player now draws last, the compact impact core draws above sprites, and authored victims receive a one-beat full-sprite flash. Meyer, the blade path, the target, and the exact contact point are all visible together.
- The benchmark longsword heavy now contacts at 0.267 seconds and returns to neutral at 0.700 seconds, down from 0.333 and 0.883 seconds; its knockback is stronger and its recovery is visibly effect-free.
- The wave announcement now holds for 600 ms instead of 2100 ms, occupies at most a translucent 520×50 px strip above the actor band, and clears before the crowd exchange.
- Re-captured all three Dussack routes against live nearby targets. Every contact now has measured health loss, hitstun/death, visible feedback, and increasing combo counts: A 1→2→4, B 1→3→5, C 1→3→4.
- Signature move labels are emitted once per attack and expire before the next contact, removing stacked callout text from branching combos.
- The decisive fresh gauntlet critic passed the final build 7–2 over real LF2 footage. The candidate won pose clarity, impact, one-frame responsiveness, combo identity, visual hierarchy, mobile readability, and original-art completeness; LF2 retained rhythm/crispness and dense-crowd separation.
- Final browser evidence loads 70/70 clips, 280/280 frames, and 4/4 backgrounds with no asset or console failures at desktop and 844×390 phone landscape sizes.
- Final deterministic performance probe rendered 60 crowd frames in 4.99 ms in headless Chromium's software-rendered test.
- Final build and all 15 automated tests pass; the prescribed web-game smoke client also reports the complete asset set and no console errors.

# Next

- Goal complete. Optional future polish can focus on breaking up extreme same-costume crowd piles and tightening the two longest heavy-branch gaps without changing the accepted combat cadence.

# Follow-up: animation scale normalization

- Root cause: every generated strip used one internally consistent scale, but each strip chose that scale independently. Long weapons and wide smears therefore made some complete moves render much smaller than idle and movement.
- Added runtime body-scale calibration for every ready clip. Idle frames define the target per archetype; bright neutral blades and motion arcs are excluded from the body measurement.
- Corrections stay shared across all four frames of a clip so crouches, leaps, and prone poses keep their intended proportions. A fuller-pose upper quartile prevents compact poses from inflating an entire move.
- Added `tools/audit-animation-scale.py`, including invalid-frame detection, within-clip outlier reporting, and grouped four-frame comparison sheets.
- Repaired the malformed Meyer dussack dodge source: the original extraction merged its last two figures and produced a transparent fourth runtime frame. It now has four visible, bottom-anchored poses and a clean return to guard.
- Expanded the calibrated range after visual comparison. Spear thrust, wretch claw, Bound Grotesque sweep, and Meyer’s wide dussack dodge attack now match their respective neutral body sizes instead of shrinking around their weapon reach.
- Final asset report: 70/70 clips normalized, 280/280 runtime frames loaded, 0 pending, 0 failed, and no browser console errors.
- Live crowd capture confirms thug movement/overhead attack scale and Meyer hitstun scale remain stable together. The offline contact sheets confirm the same for spearman, captain, wretch, Bound Grotesque, longsword Meyer, and dussack Meyer.

# Next

- Follow-up complete. Final prescribed smoke screenshots show stable idle/movement scale, 70/70 normalized clips, and no console errors. The final build and all 15 automated tests pass.

# Local test build on port 4174

- Requested a current local test version at `http://localhost:4174/` with an end-to-end smoke check.
- Found port 4174 serving an older installed Infernal Fechtschule copy from `~/Library/Application Support/InfernalFechtschule/app`; it predates the completed art pass.
- Rebuilt the current workspace and ran the packaged regression suite: 15/15 tests pass.

# Next

- Local test build complete and live at `http://localhost:4174/`. The dedicated stale `fechtschule-serve` launch service was stopped for this session and replaced by the current workspace server.
- Prescribed browser smoke: movement changes position, weapon switching completes in both directions, 70/70 clips and 280/280 frames load, all four backgrounds load, and no console error file is produced.
- Live combat proof: longsword heavy enters anticipation, contacts a nearby thug, reduces health from 28 to 6, records the combo, shows readable hit feedback, and returns to neutral.
- UI proof: title boot, production-art marker, pause overlay, resume flow, desktop HUD, and 844×390 phone landscape layout all pass. Phone layout is exactly 844×390 with no document overflow; touch controls are visible and the rotate prompt remains hidden.
- Final server liveness check confirms the current production-art page is still served by the workspace Node process on port 4174.
- Automated regression suite remains 15/15 passing; browser and page error lists are empty.

# Next

- None for this local test deployment. Keep the workspace server session running while the user tests at port 4174.

# Active goal: smooth animation and simplified graphic style

- New persistent objective: smooth animations for every character and state (walking, fighting, combos, hurt/death/etc.) with one clean simplified graphic style.
- Parallel work started: one worker owns runtime animation smoothing, one owns a deterministic shared-palette art stylizer and preview evidence, and one explorer is auditing full manifest/state coverage and acceptance criteria.
- Captured an authoritative 60 Hz baseline from the live 4174 build. Movement visibly holds the same authored pose for several consecutive frames before popping to the next; the heavy attack likewise changes only at its four key poses. Baseline sheets are `/private/tmp/fechtschule-motion-before/move-sheet.png` and `/private/tmp/fechtschule-motion-before/heavy-sheet.png`.
- The audit found a simulation bug that left every NPC movement clock at zero, so all moving thugs, spearmen, captains, wretches, and the boss displayed only locomotion frame one. Player idle-to-move changes could also inherit an unrelated clock phase.
- Fixed continuous idle/move state clocks for the player, every standard enemy, and the boss. Clocks now reset on state entry and advance on subsequent simulation steps; a focused regression covers both player and NPC movement.
- Added short pose-to-pose presentation transitions that keep contact frames immediate, never trail a contact silhouette, and soften loop/state changes without adding input latency. Explicit clip overrides correct the remaining spear-thrust and dussack-dodge body scale outliers.
- Added buffered co-op guest presentation: 20 Hz authoritative snapshots now interpolate positions at render rate, loop animation clocks advance locally, stale packets cannot rewind motion, and attacks/reactions never extrapolate ahead of host timing.
- Rejected two muddy simplification previews. Approved V3 after full-resolution comparison: one stable 16-color palette per actor preserves red/gold/purple identity accents and neutral steel, while the shared background treatment lowers saturation and detail competition.
- The V3 source audit correctly blocks shipping on two inherited defects: clipped Meyer longsword idle margins and detached captain guardbreak sword fragments. Focused repair and authored attack-recovery tracks are active before the approved style is applied.

# Next

- Integrate and judge runtime transition work against the captured baseline.
- Add distinct overshoot/settle artwork so long attack recoveries no longer freeze on one pose.
- Repair the clipped Meyer idle and captain guardbreak fragments, then apply the approved V3 style to every runtime frame and all four backgrounds.
- Rebuild the 4174 server and verify representative locomotion, attacks, combo chains, hurt/death states, and responsive layouts.

# Deterministic animation QA gallery

- Added a development-only gallery at `/animation-gallery.html`. It loads the compiled manifest/catalog, draws all four numbered poses at the game’s exact 844×390 phone-height scale, reports the selected clip/frame/cue/scale correction and asset failures, and exposes deterministic 60 Hz stepping plus playback.
- Added `tools/animation-gallery-probe.mjs`. The probe selected all 70 ready clips, exercised all 280 poses and every cue, verified 280/280 image loads, checked all 17 loop wraps, and proved all 30 attack contact poses remain inside their active windows.
- Browser QA passed with no console, page, response, request, or asset failures. Evidence and the machine-readable report are in `/private/tmp/infernal-animation-gallery/`; seven 1440×1000 desktop group captures and seven exact 844×390 phone captures were visually inspected.

# Smooth animation and simplified style: final integration

- Added 98 deterministic overshoot and recovery frames across all 30 attacks. Runtime animation coverage is now 70 clips and 378 poses; long recoveries use 3–9 timed poses with no authored hold longer than 120 ms.
- Repaired the detached captain guardbreak fragment and normalized all four Meyer longsword idle frames with safe margins and a compensated ground offset.
- Applied the approved V3 style to all 378 runtime sprite WebPs and all four backgrounds. Each actor uses one shared 16-color palette; backgrounds use a quieter 48-color treatment. Alpha, bounds, dimensions, anchors, and the repaired defects were preserved.
- Independent candidate regeneration produced identical checksums, and production matches the approved candidate for all 382 shipped WebPs.
- Final scale audit covered all 378 poses and all archetypes. Every clip uses one shared body-scale correction across its frames; the repaired spear thrust and dussack dodge outliers use explicit runtime corrections. Grouped scale sheets were visually inspected.
- Final live impact proof shows anticipation, immediate contact flash, victim recoil, multi-pose recovery, and return to neutral. A live three-hit dussack pressing route reached all three distinct contact poses and labels with no browser errors.
- Final desktop and exact 844×390 phone combat captures pass. HUD, touch controls, playfield, player priority, effects, and recovery remain readable at phone scale.
- The final animation gallery visited all 70 clips and all 378 poses, including anticipation, contact, overshoot, recovery, and neutral cues. All 17 loops and 30 attacks pass; 14 desktop/phone group captures have zero browser or asset errors.
- Final 60 Hz motion capture increases the heavy attack's active visual transitions from 24 to 26 while lowering its maximum frame-difference jerk from 17.00 to 15.30. Locomotion retains 14 active transitions while lowering maximum jerk from 19.57 to 16.39.
- Integrated production build and regression suite pass: 21/21 tests, 411 service-worker precache entries, 378/378 animation assets, and 4/4 backgrounds loaded with no pending or failed assets.

# Next

- None for this goal. The current workspace build is live at `http://localhost:4174/` for local playtesting.

# Active goal: three-zone Meyer-versus-thug slice

- Locked the vertical slice to Meyer and the club thug. Other enemies and backgrounds stay unchanged.
- Added deterministic `head`, `torso`, and `legs` hit zones to attacks, hit events, reactions, and snapshots.
- Neutral Duck now enters a 0.48-second crouch. Duck followed quickly by Light or Heavy selects a weapon-specific leg attack; direction + Duck remains the existing dodge.
- Head attacks miss crouching targets while torso and leg attacks remain exposed. The thug now chooses deterministic overhead, body, and low attacks and avoids overheads against a crouching player.
- Touch and keyboard press edges are latched so very short Duck-to-attack sequences survive between render samples. The touch UI, network protocol, guest interpolation, and debug text understand crouch and reaction zones.
- Completed a deterministic fixed-scale Meyer/thug rig: 64 clips and 384 authored frames on one 384×384 canvas, one root scale, one `[192,350]` foot anchor, and separate longsword, dussack, and club source definitions.
- The clean rebuild validator matched all 384 checksums, found zero-pixel ground drift, at least eight pixels of safe transparent margin, and no scale override or asset error.
- Replaced every active Meyer and thug runtime clip with v2 art. The catalog forces correction `1.0` for this fixed-rig set and routes head, torso, and leg hits to separate reactions while retaining generic reactions for the untouched NPCs.
- An independent integration audit found and closed tiny-stick dodge drift, hit-stop edge loss, Duck/Attack ordering, Duck-axis races, low-attack head exposure, stale reaction zones, and one non-finite co-op snapshot path. Snapshot and peer protocol versions are now `2`.
- Final build and regression suite pass: 41/41 tests, 89/89 clips, 528/528 frames loaded, four backgrounds loaded, zero pending or failed assets, and 870 valid service-worker entries.
- Browser acceptance passed at 1280×720 and exact 844×390: overhead misses crouch, torso connects, Duck→Light connects low, and direction+Duck dodges. All eight state proofs and both focused reports have zero console, page, request, or asset errors.
- The current workspace build remains live at `http://localhost:4174/`.

# Next

- None for this goal. Continue with user playtesting of Meyer versus the club thug before extending the fixed-rig pipeline to the remaining NPCs.

# Local test build on port 4174 (playtest refresh)

- Rebuilt the workspace (1139 precache entries) and re-ran the regression suite: 41/41 tests pass.
- Synced the current `site/` build into the installed app copy at
  `~/Library/Application Support/InfernalFechtschule/app` (previous copy kept as
  `site.prev-20260914-234252`), then reloaded the `com.infernal-fechtschule.serve`
  launchd service so the durable port-4174 server now serves the current build
  including the per-zone reactions.
- End-to-end verification against the live launchd-served server: 56/56 checks
  pass (gallery readiness 101 clips / 606 frames, all fifteen NPC zone-clip
  resolutions, pixel-distinctness proofs, deterministic three-zone combat hits).
- The game is registered in the thread Preview tab at `http://localhost:4174/`.

# Next

- None for this deployment. The launchd service keeps port 4174 alive across
  sessions; workspace source remains the canonical copy.

# Active goal: per-zone authored reactions for the full cast

- Closed the documented follow-up: per-zone authored reactions extended from the
  Meyer/thug pilot to the spearman, captain, wretch, and Bound Grotesque.
- The fixed-rig generator already drew `hitstun_head`, `hitstun_torso`, and
  `hitstun_legs` poses for every actor; only the thug declared them. Enabled
  those states for the four remaining NPCs and regenerated the deterministic
  set: 101 clips / 606 frames (spear 8, captain 11, wretch 8, grotesque 10),
  same 384 px canvas, `[192,350]` foot anchor, root scale 1, zero ground drift,
  worst safety margin 1 px.
- `tools/validate-fixed-rig-art-v2.py --verify-rebuild` passes with a byte-
  identical deterministic rebuild (606/606 checksums).
- Registered the twelve new reaction variants for every NPC kit in the
  animation manifest and removed the thug-only gate; the generic hitstun
  remains a first-class fallback clip for every archetype. Runtime inventory:
  101 ready clips, 606 frames, 1139 service-worker precache entries.
- Updated the fixed-rig regression test: cast clip counts, per-archetype zone
  resolution for all five NPCs, generic fallback, and captain guardbreak.
- Added `tools/zone-reaction-verify.mjs`, a Playwright end-to-end check with a
  cached-Chromium fallback: gallery readiness (101 clips / 606 frames), all
  fifteen NPC zone-clip resolutions, evidence screenshots, a pixel-distinctness
  proof (head/legs reactions differ from generic hitstun on 51–93% of union
  pixels; torso shares the generic design by contract, as the thug already
  did), and a deterministic sandbox combat proof (same model as
  `three-zone-playtest.mjs`): `ls_l1`/`ls_l3`/`ls_low_l` each land on a passive
  thug, which enters hitstun with the matching reaction zone and lost health.
- Extended the generator's contact-zones preview sheet with all twelve NPC
  zone-reaction contact poses for offline visual inspection.
- Environment: the launchd service `com.infernal-fechtschule.serve` was serving
  a stale installed copy on port 4174; booted out for this session (restorable
  with `launchctl load ~/Library/LaunchAgents/com.infernal-fechtschule.serve.plist`).
  Note `tools/serve.mjs` honors `PORT`, and this shell exports `PORT=0`, so
  start it with an explicit `PORT=4174`.
- Final build and regression suite pass: 41/41 tests.

# Next

- None for this goal. The workspace build is current; start the local server
  with `PORT=4174 node tools/serve.mjs` for playtesting.

# Active goal: scrolling single-player levels (Little Fighter 2 style)

- Stages are now wide (wave definitions carry `stageWidth` 2360–2820 px, vs the
  1096 px camera window): the player expands the world by marching east while
  the camera follows, LF2 style.
- Sim-side deterministic camera (`cameraX` in the snapshot, protocol v3):
  follows the player with a soft window, clamped to stage bounds, never
  retreats mid-wave, resets at each new wave's west edge.
- Progressive spawns: group 0 appears at the wave start; later groups wait for
  the player to reach their progress threshold on the stage (with a
  field-clear fallback so there are no soft-locks), spawning around the
  player's frontier.
- Renderer: world-space translate for actors/particles/text, parallax
  background (0.35×) that can never outrun its 1920 px source art, screen-fixed
  vignette, and red LF2-style edge chevrons pointing at offscreen enemies.
- Fixed a mid-stage seam: the playfield-darkening band and the stage-bound
  rectangle were still camera-window-relative, so their edges drew a vertical
  line one screen into every stage. Both are now world-space aware (the bounds
  mark the stage's true extent and scroll away with the march; the vignette is
  screen-fixed behind the camera translate).
- Protocol bumped to v3 with camera validation; guest interpolation lerps
  cameraX. New `tests/scrolling-stage.test.mjs` (camera ratchet, gating,
  bounds clamps, player clamp) and `tools/scroll-stage-verify.mjs` (live march:
  camera follow, monotonicity, offscreen pressure, phone overflow, zero
  console errors; pixel measurements confirm the floor scrolls 1:1 and the sky
  at ~0.35× parallax).
- Final build and regression suite pass: 47/47 tests.

# Next

- None for this goal. Optional follow-up: per-stage background variety is
  already handled by wave themes; could add stage-end set-pieces (gate,
  castle approach) as visual landmarks mid-stage.

# Active goal: fixed-rig v2 art for the whole cast

- Extended the deterministic fixed-rig v2 pipeline from the Meyer/thug pilot to the spearman, captain, wretch, and Bound Grotesque.
- Added source rigs (proportions + 16-color palettes) for the four new archetypes, a spear shaft attachment, a captain sword-and-kite-shield attachment, and claw fans drawn directly from forearm joints for the crypt actors.
- The generator now renders all six archetypes from one shared pose grammar; the spearman plants his thrust instead of lunging so the long shaft keeps its safety margin.
- Generated 89 clips / 534 runtime frames: meyer 50, thug 14, spear 5, captain 8, wretch 5, grotesque 7. All frames are 384 px, bottom-anchored at [192,350], with worst safety margin 1 px and zero ground drift.
- Extended `tools/validate-fixed-rig-art-v2.py` to the full cast. The validator passes with 534/534 checksums and a deterministic rebuild producing identical hashes.
- Replaced the retired v1 enemy clip registrations in `animation-manifest.ts` with a generalized fixed-rig NPC kit loop. All 89 declared manifest clips are ready with one display spec per archetype and `fixedScale` scale correction 1.
- Added `SpriteAnimationCatalog.resolveFrameByIndex` so the QA gallery inspects each authored pose directly; the leading neutral bookend of fixed-rig attacks is intentionally unreachable in live playback and now validated as such.
- Extended the fixed-rig regression test to all six archetypes with per-actor clip counts and generic-reaction fallback checks.
- Final browser probe on the 4174 build: PASS with 89 clips, 534 poses, 36 attacks, 21 loops, zero browser errors; 7 desktop + 7 phone evidence captures.
- Final build and regression suite pass: 41/41 tests, 1055 service-worker precache entries covering the complete v2 cast.

# Next

- None for this goal. Optional follow-ups: per-zone authored reactions for the captain/spear/grotesque, and committing the accumulated workspace work.

# Active goal: denser progressive waves, combo-unlock lessons, grounded shadows

- Expanded every level from 3–5 to 7 encounter waves (2820→3820 px scroll stages) with a per-wave `pressure` scalar that scales enemy health/guard and co-op padding, so difficulty climbs smoothly within and across levels.
- Replaced post-level buff picks with a combo-unlock progression: players start with only the basic chain (ls\_l1 and the low poke) and learn the rest through lesson cards offered after waves 1 and 2. Each card lists its exact input routes (light/heavy chains, crouch entries); `isAttackUnlocked` gates every entry point, with two behavior-only lessons (guard counter, second-intention signature).
- Protocol bumped to v4 (lessons in snapshot); tests and fixtures updated. `chooseUpgrade` is now `chooseLesson` end to end.
- Fixed floating shadows: the old ellipse was a dim radial blob centered south of the feet, invisible on the dark art. The new contact shadow is a broad, near-solid LF2-style decal straddling the heel line (radius ~1.6× body, core alpha 0.74 fading at the rim, lift from `jumpOffset` for airborne states).
- New `tools/lesson-flow-verify.mjs` proves the whole loop live on :4174 (11 checks): zero starting lessons, wide stage, wave-clear opens the card overlay with route lists, picking one resumes the next wave with the lesson registered and the basic chain firing. Its grounding check re-renders the same frozen frame with `drawShadow` monkey-patched off — the pixel diff isolates the shadow exactly, asserting 1000+ darkened pixels spanning the feet line.
- Final build and regression suite pass: 47/47 tests, scroll-stage and zone-reaction probes still green against the deployed build.

# Next

- None for this goal. Optional follow-up: an additional lesson tier after the boss (dodge-cancels / air game) if the campaign grows a second act.

# Follow-up: one combo per lesson, lighter shadows

- Player feedback after the level-based campaign commit: three combos per lesson card overstimulated, and shadows were too dark. Trimmed every attack lesson to exactly one unlock (`ls-crossing` → Crossing Hew J·J, `ls-threefold` → Threefold Cut J·J·J, `ds-backhand` → Backhand J·J, `ds-wheel` → Circular Pursuit J·J·J; the two behaviour lessons unchanged). Deleted the eight now-unreachable chained heavies (`ls/ds_lh`, `_l2h`, `_hl`, `_low_h`) and retargeted the removed links: mid-chain and crouch heavies now resolve to the basic committed heavy, so the K button never dead-ends. Card copy and `LESSON_ROUTES` list exactly one input line each; animation manifest clipped to the trimmed set.
- Shadow core alpha 0.88 → 0.5 (still lifts out on jumps): measured −29/255 straddling the feet at z=560, reads clearly on the brightened capture for both fighters.
- Deployment incident: `rsync --delete` into the installed app copy removed `tools/serve.mjs` and nested the game one level too shallow; restored `tools/serve.mjs` and moved the build under `app/site/` to match the launchd plist's working directory. Server healthy again on :4174.
- Verified: 47/47 unit tests; lesson-flow 11/11 (cards show one route each, shadow −29 straddling feet), scroll-stage and zone-reaction probes green against the live server.

# Follow-up: LF2-style chain links

- Diagnosis (measured with a headless harness, not by eye): mashing light against a dummy produced 0 of 7 longsword and 0 of 10 dussack contacts that landed while the victim was still reacting. Each hit was a separate neutral exchange because `updatePlayerAttack` only accepted the next chain move after the *whole* recovery, so lockout was 0.25–0.40 s against a 0.18–0.24 s hitstun. Gaps also grew through the string (0.45 → 0.52 → 0.60 s), and only 8 of 18 player attacks declared any chain.
- Added the LF2 link: a light cut that actually connects cancels the rest of its recovery into the buffered follow-up (`linkOpen` in `updatePlayerAttack`). Whiffed and blocked cuts still pay full recovery, and heavies never cancel, so the committed strike stays a decision instead of the fastest button.
- Retuned the player chain so that link timing is a contract: `hitstun(previous) * decay >= active(previous) + startup(next) + one frame`. Light startups shortened (ls_l1 0.12→0.11, ls_l2 0.14→0.10, ls_l3 0.19→0.12, ds_l1/ds_l2 0.09→0.07, ds_l3 0.13→0.08) and light hitstun raised (ls_l1 0.22→0.28, ls_l2 0.24→0.30, ds_l1 0.18→0.27, ds_l2 0.19→0.28, ds_l3 0.30→0.31, low cuts 0.24→0.28 and 0.20→0.24 so their chain entries link too). Recoveries were deliberately left untouched: the animation manifest's recovery pose counts are asserted against them.
- Hitstun now decays across a string (9 % per hit, floored at 40 %) and a silence longer than any possible link starts a new string, so a chain starves itself out instead of looping forever. Measured with the sim: longsword 3-link strings with 97/90 ms of hitstun to spare, dussack strings that wrap through the wheel for 7 contacts and then let the target go, and an unlimited mash never holds a target past that.
- Branched the dussack: Circular Pursuit now wraps back into the Forehand Cut, so `ds-wheel` reads J·J·J·J and the two kits finally have different shapes (longsword: three cuts into a heavy finisher; dussack: a repeating wheel of lighter cuts). Mid-chain and entry heavies are declared as explicit exits, and the lesson card lists the new route line.
- New `tests/combo-links.test.mjs` (7 tests) pins both halves: the frame-data inequality for every declared link at its deepest position in an authored route, the non-link guarantee for heavy exits, the structural proof that the dussack wheel cannot be sustained, and a live simulation of a mashed chain against a pinned dummy (contacts land inside hitstun with margin, strings stay bounded, the starter still chains before any lesson, and a whiffed cut repeats on its full recovery instead of the connected cadence).
- The HUD combo counter now follows the same lull rule as the decay, so it names one string at a time (the longsword chain reads 3 HIT) instead of accumulating across a whole fight.
- Verified live in a real browser against the working tree on :4188 (headless Chromium driving the built game with `advanceTime` and synthetic light presses): longsword strings land as l1 → l2 → l3 with 97/90 ms of hitstun to spare, the dussack runs its six-link wheel and then lets the target go, the HUD reads honest per-string counts, and the page produced zero console errors, warnings, or failed requests.
- Recorded the two rules as locked direction in `docs/DECISION_LOG.md` and documented the link contract in `docs/ARCHITECTURE.md`.
- Final build and regression suite pass: 54/54 tests.

# Follow-up: archetype tempos and interrupts

- Measured the problem first: all four field archetypes shared ten attack rows and differ only by a `pressure` health scalar, and every archetype swung back-to-back with its cooldown charged at commit, so a slow 1.7 s spear thrust produced no pause at all.
- Added `ENEMY_TEMPO` (`src/sim/attacks.ts`): per-archetype decision rate, station, wait station, strike band, depth, and interrupt, so cadence is authored data instead of inline constants. Rests are charged when a swing resolves, which makes "the thug rests 0.2 s, the spear 0.8 s" true in the data and measurable in play.
- Thugs now press in pairs: a jab arms the nearest mate that is not mid-swing, the mate aligns and answers on a beat (`beatDelay` 0.42 s) timed so its cudgel lands just after the player's hitstun from the first one expires. A flinched mate, or one that commits to its own swing, loses the beat, so disrupting the pair is a real answer. A lone thug still hands its jab off to `thug_follow` (`aiChain`), and a mate holding a beat waits for it instead of spending it on its own attack.
- The captain shrugs lights: plate absorbs a non-heavy without hitstun, without cancelling its swing, and arms an answer that fires 0.16 s later — parryable, 11 damage, one per 1.7 s. Heavies still move it, so three committed strikes strip the plate where about thirteen lights are needed (light armour pressure raised 0.42 → 0.75 so mashing lights is the slow, costly way through rather than a wall).
- The spear line: holds at 148 px, closes to 104 px on a crowd, thrusts through its own front rank (2 targets), shortens its rest from 0.55–1.0 s to 0.15–0.35 s when the target is buried in company, and butt-strikes (`spear_brace`, 22 guard damage) anyone who comes inside the thrust's minimum range. Thrust movement dropped 20 → 12 so the shaft plants instead of walking the line into the player's face.
- New rows cost no art: `AttackDefinition.animation` lets a row borrow another row's authored clip while keeping its own timing, and `resolveAttackClipId` is the single place that follows the alias. No new assets, still 93 clips / 558 loaded.
- New `tests/enemy-tempo.test.mjs` (11 tests): the tempo table's distinctness and ordering, each archetype's exclusive kit, one bounded `aiChain`, the borrowed-clip contract (alias resolution in the real catalog plus "contact cue exactly inside the borrowed row's active window" at 1 ms resolution), the pair beat arming/serving and contact clustering, a lone thug arming nothing, a flinched mate losing its beat, plate shrugging/answering/bounded lockout, heavies out-draining lights by ≥3.5×, and live cadence ordering (wretch < thug < spear).
- Measured in a live browser (headless Chromium on :4188, `advanceTime` + `renderGameToText`): 93 clips and 558 assets loaded with zero failures, `thug_press`/`thug_follow` firing in wave 0, and a stationary player taken from 110 to 0 hp by the rabble. Zero console errors or warnings.
- A/B against the committed build with the same bots: waves 0–1 were already damage-free for a mashing bot, and wave 3 (the armoured lesson) was already the wall before this pass — the archetype work did not create it. What did change is that the two playstyles now fail in opposite places: the light-only bot dies on the armoured wave while the heavy-only bot clears it and dies to the wretch swarm instead.
- Life bars now live over the fighter, LF2 style: `drawActorBar` draws for every living actor instead of only captains and the bound thing, with a per-archetype lift (`BAR_LIFT`) above the authored display height, a green fill for players and red for the press, and the armour pool as a second track. Verified in the live renderer by intercepting the bar's fill rectangles: 318 bars in one second, the player included, and every bar clearing its owner's head. `tests/overhead-bars.test.mjs` guards the lift against taller art.
- Recorded Little Fighter 2 as the general reference in `docs/DECISION_LOG.md`, alongside the overhead-bar rule.
- Final build and regression suite pass: 66/66 tests.

# Follow-up: LF2 field arms (droppable weapons, throws, potions)

- Art first, then code, because the whole open question was whether a club or a spear could exist at all: Meyer's weapons are baked into each frozen-rig pose, so a find needed real grip poses. `tools/generate-fixed-rig-art-v2.py` gained club and spear weapons plus their pose sets, and regenerating produced 31 new clips (Meyer 42 → 73, inventory 93 → 124) with the validator green and byte-identical reruns. Nothing else in the pipeline changed: the tool is parameterised, so a weapon kit is a generator change plus a manifest entry.
- The rig itself then imposed a design rule, found by the art test failing rather than by taste: a six-pose clip with fixed holds cannot render a recovery longer than 0.38 s without freezing on screen for more than 150 ms. The spear ram's recovery was 0.6 s, so its weight moved into a 0.4 s startup the player can read; `tests/attack-recovery-coverage.test.mjs` now fails loudly for any row that asks for a hold the rig cannot show.
- The stage arms the fight (LF2-style): a per-archetype `DROP_TABLE` means a fallen thug leaves his cudgel, a spearman his shaft, a captain steel worth fencing with, and a wretch only a chance of a draught. Pickup is by walking over it — no button, no inventory. *(Superseded: taking a find is now a deliberate press of the switch button, with the road marking what the hands can accept — see the last follow-up.)*
- A find is an improvised kit, never a learned route: `cl_*`/`sp_*` give two cuts, a committed overhead and a hurl, no longsword or dussack chain fires with a find in hand, and his own blade waits in `stowedWeapon` until the find is spent. Durability is one pip per *landed* blow (a whiff or a blocked club costs nothing, pinned by test), and the remaining pips ride the weapon when it is thrown — so a half-spent club picked back up off the road is still half-spent.
- Throwing reuses the switch button, so no new input exists for touch: `startSwitch` diverts to `startThrow`, the rows declare `throw: true, releaseAt`, and a flying find bites whoever it crosses through the ordinary hit pipeline — except that a parry knocks the weapon out of the air instead of flinching the thrower from across the ward, which the first draft got wrong. A measured hurl flies ~250 px and arcs through a ~45 px apex before landing as a pickup.
- Items are drawn as vector art (`drawItem`/`drawCudgel`/`drawShaft`/`drawItemShadow`), because the rig has no grip to generate them from; a dropped weapon and a carried one therefore read as the same silhouette, and airborne weapons spin while spinning weapons do not lie flat. They sort into the same depth order as the cast, and a carried find shows its pips over the rider's head, LF2-style. The HUD names the find and its pips, and the controls primer explains take/hurl.
- New `tests/field-items.test.mjs` (10 tests): the drop table per archetype, pickup and stow, the draught that waits at full health, mid-cut pickup refusal, steel only with both hands free, one pip per landed blow and the split on the last one, a whiff swinging free, the throw's flight/contact/revert, the caught hurl, the fade and the wave sweep, and item round-tripping through the replica snapshot (`version` 5).
- Verified live in a real browser (headless Chromium on :4188 driving the built game with real key presses, not `advanceTime`): 124 clips / 744 assets with zero failures, a cudgel drawn lying on the stage then spun in the air (357 item draws + 357 shadows in one run), 2694 pip draws all above their carrier's head, a pickup at 9 pips, and the throw — `1 airborne, hands back to longsword` — with zero console errors or failed requests.
- Recorded as locked direction in `docs/DECISION_LOG.md` (field arms, finds vs lessons, pips, steel rules, item art, the recovery budget) and documented in `docs/ARCHITECTURE.md` with a new *Field items* section and the six-pose budget.
- Final build and regression suite pass: 76/76 tests.

# Follow-up: the build refreshes what it serves

- `npm run build` was only half a deploy: it emitted `site/` and rewrote `site/sw.js`, while the copy a detached preview actually serves had to be re-copied by hand. Now the build's last step is `tools/preview-sync.mjs`, which mirrors `site/` and `tools/serve.mjs` into the armed preview directory and prunes what the build no longer emits. Measured on a rebuild: 44 files copied, 1860 left alone, 160–200 ms — against 2.0 s for the full first copy, and against a manual step that is silently skipped whenever someone forgets it.
- Arming is a checkout-local marker (`.freebuff/preview-sync.json`, gitignored) written by `--dir`, so the hook is a silent no-op in every other worktree and fresh clone; `npm run preview:status` reports the directory, the build being served and whether the port answers, and `--disarm` opts out. Two structural refusals come with it — mirroring onto itself, or into a directory that contains the checkout — both rejected by test rather than by review.
- The mirror alone would not have fixed the staleness. The served copy still carried the game's precache worker, so a tab that had already cached the payload kept running the previous build's JavaScript no matter what the server sent. The copy now gets a kill-switch worker instead: it deletes every cache and unregisters itself, so a preview can never be served from cache and the manual "unregister the worker" step is gone. Verified live — after one reload the preview reports zero registrations, zero caches, the kill-switch worker as its controller, and the freshly built `js/main.js`.
- That exposure was worth taking seriously on the real deploy path too: `CACHE` was `infernal-fechtschule-v${packageJson.version}`, a hand-bumped string, so a returning tab was pinned to whichever build it cached first, indefinitely. The name is now a digest of the precached bytes (`write-service-worker.mjs` exports `precacheList`/`contentDigest`/`writeServiceWorker` so this is testable). Measured: same bytes → identical name (`a087cf5de6` across two builds, so clients do not re-download 36.7 MB for nothing), changed bytes → new name, removing the added file → back to the same name.
- Freshness was proven end to end rather than asserted: a marker comment in `src/main.ts`, one `npm run build`, and the marker was in the copy *and* on the wire from :4175; reverting it put the served bytes and the cache name back. No console errors, no failed requests, no reload loop, and one navigation entry with a stable `timeOrigin` after the kill switch ran.
- New `tests/preview-sync.test.mjs` (11 tests) pins the mirror (first copy, no-op, single-file recopy, preserved mtime, prune of stale files and emptied directories, excluded paths neither copied nor pruned), the kill switch replacing the build worker, the refusal to swallow the checkout, arming as a marker, the cache name tracking bytes rather than versions, and the precache list still keeping editable art and source maps out.
- Final build and regression suite pass: 88/88 tests.

# Follow-up: a stage ends by walking out of it

- A wave used to end 1.05 s after the last death, which meant the player never got to *be* in a cleared street: no chance to loot, no beat to breathe, and the next stage arrived on a timer. Now clearing the road opens its eastern doorway and stops there. The stage resolves only when every living fighter has walked into the doorway, so in co-op the pair leaves together and a dead player does not hold the road.
- The doorway is the last 84 px of the stage (`STAGE_EXIT.depth`), defined once in `stageExitX()` and read by both the sim and the renderer, so the drawn gate is the real one and not a second copy of the rule. A `STAGE_EXIT.grace` of 0.8 s keeps it from taking a fighter through the instant it opens, which matters because the last enemies spawn near the stage's east end: without the grace, a player already at the edge would be pulled off the stage by the last death and never see the clear.
- Every stage now begins at its western end with its own road barred (`enterStageFromWest`), carrying weapons, pips, and lessons across the boundary. That is what makes the march mean something twice over: previously a player who cleared a stage near its east end carried that position into the next wave, whose groups then released all at once past their gates. Now each stretch is walked left to right.
- The rule is visible before it applies. `drawStageExit` draws the gate as stage furniture under the cast — two capstoned posts with studded oak planks bolted across them while the street is held, and once it is clear a lamp-lit opening with a gold arrow lying on the cobbles — and an open doorway beyond the right edge gets the same edge chevron the offscreen enemies get, in gold. The HUD carries `STAGE CLEAR · WALK EAST` for as long as the doorway is open, and the clear emits a longer-lived banner (`showBanner` gained a duration) saying the way east is the player's to walk. The controls primer explains the rule.
- Measured live in the browser on the served build: after a clear the phase stays `wave` for ten seconds of standing still with `exitOpen` true (the old build advanced on the timer), the banner read “STAGE CLEAR / The road runs east — walk it when you are ready”, the HUD prompt was visible, a fighter standing in the doorway at 0.4 s of the grace was still on the stage and was gone two seconds later, and marching east from the clear reached the doorway at x 2297 against an exit line of 2296 in 8.6 s. The doorway art was A/B'd on one frozen frame: 6557 plank pixels barred against 916 open, with the lit opening and arrow appearing only in the open state.
- The project's own live probe passes unchanged against the new rule (`tools/lesson-flow-verify.mjs`, 11/11, including “clearing level 1 opens the lesson phase”, which now requires the walk out), and the suite's progression tests were updated to march: `walkOut` in `tests/simulation.test.mjs`, the item-fade sweep in `tests/field-items.test.mjs`, and a march in the complete-encounter test.
- New `tests/stage-exit.test.mjs` (7 tests) pins the rule from every side it could be got wrong: a cleared stage that waits (including ten seconds of doing nothing), a doorway at the true stage edge that a fighter can actually stand in, the grace refusing to take someone through early, the walk out carrying into a next stage that starts barred at its western end with its own doorway, the co-op all-arrive requirement, the boss stage ending on the walk rather than on the grotesque's death, and the doorway travelling in the snapshot. `tests/protocol.test.mjs` now rejects both a v5 snapshot and a v6 one missing `exitOpen` (schema v6).
- Final build and regression suite pass: 95/95 tests.

# Follow-up: taking a find is a press, not a walk-over

- Pickup used to be ambient: `resolvePickups` ran every tick and swept anything a player was standing on. That made looting a side effect of walking, which is not what a deliberate take should feel like, and it left no way to *decline* what was underfoot. Now nothing is collected by pacing over it — the Switch button takes what is within arm's reach, and the rule lives in one exported predicate.
- `itemWithinReach(actor, item)` (ground + `ITEM_PICKUP_RADIUS + radius` + `canTakeItem`) is the whole rule, and it is shared: the sim's `reachForItem` accepts with it, the renderer's gold ring-and-caret is drawn from it, and the HUD's `⇄ TAKE CUDGEL` / `⇄ DRINK DRAUGHT` line is computed from it. The cue cannot promise a take the hands would refuse, and it disappears the moment the offer does. `ITEM_REACH_STATES` is the stance half of the same contract, exported so the renderer never marks an item for a fighter who is mid-cut.
- The press is checked once at the top of `updatePlayer`, before any other branch can claim it, and only the nearest acceptable item is taken, so one press takes one thing and never sweeps a pile. When there is no offer the press falls through to its older jobs unchanged: it switches blades, or hurls the find in hand. That is what makes the priority legible rather than surprising — standing on a captain's sword with a cudgel in hand throws the cudgel, because the offer was never made (the cue said so).
- Consequence worth naming: the enemies still never loot, so the road is the player's to strip, and the reach is per-fighter, so in co-op each press arms only the hand that reached. A stagger buffers the press rather than swallowing it — losing a press to hitstun is not a rule anyone can feel, and a dropped take is worse than a late one.
- The rules were moved, not duplicated: `takeItem` now only applies a take it was promised (`canTakeItem` decides once), which removed the three separate refusal branches that had grown inside it. The primer, the README table, and the touch button's own label follow the change — the button reads **SWITCH** rather than **WEAPON**, because it has three jobs now.
- Measured live in the served build (the registered preview on :4175, real key events and one manual clock for the probes): standing on a dropped cudgel for two full seconds left it on the road with `weapon: longsword, durability: 0` and no pickup event; a single `KeyU` press took it (`weapon: club, durability: 9`, his blade to `stowedWeapon`), and the HUD prompt hid on the same frame. With a full health bar a draught was not offered (prompt hidden) and the press left it lying and health at 110; at 40 hp the same press read `⇄ DRINK DRAUGHT` and took him to 78. With the same blade in the same place, the offered state carried 187–204 gold pixels in its box against 145–160 with the offer withdrawn, so the caret tracks the offer and not the item.
- New `tests/item-intent.test.mjs` (7 tests): three seconds of standing on a cudgel and a draught taking neither, a 48-case matrix asserting the cue and the press agree on every offer *and* every refusal, one press taking only the nearest of two finds in reach, the enemies never looting, co-op presses arming only the hand that made them, a stagger remembering the press and taking on recovery, and the exported reach rule itself (the stance set plus reach, height, steel and draught boundaries). The three `tests/field-items.test.mjs` tests that pinned walk-over pickup were rewritten around single-frame presses.
- Final build and regression suite pass: 102/102 tests.

# Encounter-kind wave pass — measured and tuned

- The wave design is finished, and finished by measurement rather than by taste. `tools/encounter-measure.mjs` (`npm run measure`) plays the campaign with two bot policies and reports what each wave costs; a wave is a **wall** when the adaptive bot dies in it, spends a full bar (110 health) in one stretch, or will not resolve in 75 s. At that point, 16 seeds, both modes: **16/16 victories, no walls** — press 0 mean/0 worst, choke 6/15, duel 14/34, ambush 0/0, flood 17–18/61, hold 8–10/30, boss 11/26. (The camera was changed after this and the campaign re-measured — see below for the final numbers.)
- The instrument had to be made plausible five times, and each fix followed a measurement of the bot doing something no player does: it fled three 20-health wretches it should have cut down (a wretch moves at 150 to the player's 220, so `crowd >= 3` was a rule that lost); it cut empty road at an enemy behind it, because a cut reaches back only 28 px and each swing carried it *forward*, away from the thing clawing it; it froze under a claw after a mistimed parry instead of dropping to a block, which alone accounted for a lone wretch holding a full bar for ten seconds; it stood inside its own stop band with an enemy at its back, unable to attack and unwilling to approach, until it learned to step through the turn; and it measured every readable strike as free, because a perfect parry cannot see a spear line. `MISTIME` (one read in three) is a hash of frame and attacker, so runs stay exactly reproducible from their seed.
- The instrument also lied structurally, twice: the final wave's row was dropped on victory, so the boss — always the last wave — was only ever measured in the runs that died to it, and the summary silently carried six encounters; and a wave that could not be reached at all was counted as no wall. Both are fixed, and the boss now reports its real cost (11 mean, 26 worst) in every winning run.
- Design changes, each one from a trace rather than a hypothesis: **the press** walks in as three pairs on 0.16 s intervals (seven thugs at 0.4 s intervals cost exactly 0 damage across every seed — a crowd that is never more than one deep is met one man at a time); **the choke** authors its group unlock positions at the gate, so the queue forms inside the funnel instead of the fight happening on the open road before it and the lane being walked through as decoration; **the duel** is fought on a mat (1240 px against the camera's 1280), because 1520 px against an 88-speed captain was an opponent you could simply walk away from and the duel cost 5 health; **the ambush** is now sprung by the bait line breaking rather than by a mark on the road, sends three arrivals across three depth lanes instead of one clump (a clump dies to a single broad cut, which is what made the trap free), and fires while a bait body still stands — verified per seed, with the bait's arrivals carrying `urgency 0` ahead of the player and the wedge carrying `1.98` at their back; **the stand** feeds its beats a stride beyond the player rather than past the edge of the camera (off-camera arrivals made it twenty-four seconds of marching east to meet each beat) and keeps its mouth clear of the east wall (clamped against the wall it was a hitstun lock: eleven hits, no cut ever completed, dead in seven seconds against three wretches).
- Two levers were added to make that authorable rather than hand-tuned: `SpawnSpec.from` (the frontier that unlocks a group, so a wave can put its fight on the ground its idea lives on) and `SpawnSpec.z` plus `AMBUSH_BANDS`, so an ambush wedges across the road's depth instead of stacking in one lane. The ambush also gained `remaining`, the last-man rule that replaced the mark on the road.
- The measurement is reproducible by hand and pinned cheaply: `npm run measure` (add `--fresh`, `--seeds`, `--bot`, `--json`), and `tests/encounter-shape.test.mjs` (11 tests, ~1 ms) asserts the *shape* that produced every cost — one idea per wave, uniform commitment, the gate's groups authored at the gate, the trap able to fire with bait alive, the stand's ground and provisions, the duel's mat, and every stage that feeds arrivals being wider than the camera. Two of those assertions failed on their first run against my own assumptions (a duel legitimately *is* a mat; a lone officer needs no cadence), which is the test earning its place.
- Suite is **114/114** (102 before, plus the 11 shape tests and the camera follow). Final state worth naming honestly: **the ambush and the press now cost a competent player nothing** — 0 damage across sixteen seeds each. That is the honest reading of both, not a hole in the measurement: the trap punishes a player who does not turn, and the masher (which walks at the nearest thing and taps light without turning or parrying) takes 10–15 in the press, 30–35 at the gate and 20–43 in the duel, then dies in the flood. If either should tax competence as well as panic, the lever is the size of the arrival group, not the clock.

# The camera follows both ways

- `updateCamera` now follows the party as they give ground as well as when they advance. It used to ratchet east and never come back — `Math.max` against its last position — and since the window is also a hard boundary for the player (`clampActor`), a retreat was capped by how far the camera had already advanced. Measured live on the served build: after pushing the window to x 386 a fighter could walk back only to 432; the same fighter now walks back to 138 while the window comes with them to the arena origin (a 294 px band of ground that used to be unplayable). The encounters need it — a stand is a line you break off from and an ambush is answered by turning and giving ground — and so does the fiction: Little Fighter 2's camera follows the fighter back.
- The follow is asymmetric because the two directions are not the same problem. Ahead of the fighter there is no slack (the window centres them, exactly as before, because what is ahead is what has to be visible). Behind them there is `CAMERA.trail`, 160 px, so the shoves of ordinary fighting — 28 px for a light, 132 for a committed heavy — do not slide the whole road under the fighter they are meant to frame, while a deliberate retreat crosses the slack in well under a second. The westmost window is the arena's origin: `CAMERA.margin` is how far the *camera* pulls west of a stage's grout, not ground anyone stands on.
- `tests/scrolling-stage.test.mjs` pins it: the follow, the slack, the exact excess the window moves by (`settledCamera - (givenGround - trail)`, asserted exactly — the fighter's residual knockback velocity has to be zeroed first, or they drift a pixel mid-step and blur the arithmetic), the fighter keeping the slack at their back, and both stage clamps. The old “the camera ratchets forward and never retreats within a wave” test is replaced by its inverse.
- Consequence for the encounter numbers: the camera decides where arrivals spawn (they land just past the window's edge), so the whole campaign was re-measured after the change. Two waves moved and both were fixed on the economy rather than the encounter: the flood was the biggest single cost (46 mean, 74 worst) and left the *next* attrition wave — the stand, with no healing between them — to answer for a half-empty bar; the lull between surges went 8.5 s → 10 s, which is what its subtitle already promised (“use the lull: take what the fallen left, breathe”), and the stand's clock went 20 s → 18 s at the same four beats of two. Final: **16/16 in both modes, no walls**, and the two modes now agree wave for wave (flood 18–19 mean/53 worst, hold 4 mean/21 worst), which is the sign the economy stopped being the deciding factor.

# Note on the tree state

- The encounter-kind migration that an earlier session left half-finished is closed: the dead per-wave `slots` literals are gone, `ATTACK_SLOTS` is the single uniform budget, and the wave design is now measured rather than pending.

# Levels and waves, and nothing out of thin air

- The campaign's structure was rebuilt around the words the game actually lives by. A **level** is one place — a name, one dressing, one road, and the waves fought along it — and the **waves** are the encounters (a crowd, a gate, a duel, a trap, a flood, a stand, the bound thing). `src/sim/waves.ts` now nests them: `LEVELS` holds `waves`, the flat `WAVES` table is *derived* from the nesting so a wave cannot belong to two levels or to none, and `levelIndexForWave` / `waveIndexWithinLevel` are the two counters the rest of the game reads. Five levels over seven fights: The Town, The Town Gate, The Sala d'Armi (one fight each), The Castello Courts (trap, flood), The Castello (stand, bound thing).
- A level is **walked once**. Only its last wave has a doorway; clearing a fight mid-level moves nobody — the next wave's arrivals walk in from off-screen, the loot stays where it fell, and the camera does not jump. `beginWave` decides for itself whether the flat index has crossed into a new level: if it has, `enterLevel` sets the new road, sweeps the ground and walks the party in at the west end; if it has not, nothing about the world moves. Before this, every wave was its own arena, which is why the journey read as a corridor of one-room stages rather than as a place with several fights in it.
- **Nothing arrives out of thin air any more**, and that is the part with the most history. One rule, `offscreenArrivalX`, used by `spawnEnemy` for every arrival path in the game: an arrival lands 90 px past the visible edge when the road allows it and *never* inside the picture. It replaced four hand-placed exceptions, every one of which put a body in front of the player: the ambush wedge anchored at `cameraX + 14`, the stand's mouth at `frontier + 300`, the duelist standing on his mat, and the grotesque erupting `player.x + 420` ahead. The body the finale's phase change sheds was moved onto the rule as well (`spawnWretch` is gone), so the rule has no exceptions at all — and `tests/level-structure.test.mjs` watches a whole campaign run frame by frame and asserts that no fighter ever appears inside the window. The rule needs ground to work, which is now a data constraint: `MIN_LEVEL_ROAD` (1276 px, `CAMERA.width + 2 * SPAWN_APRON`) is the width at which an arrival can always hide, every level is authored at or above it, and the same test holds the table to it.
- The restructure broke one encounter at first and the instrument caught it: with the finale arriving from the east, the fight happened in the last 260 px of the road with the party jammed between the grotesque's bulk and the eastern wall, and a competent bot lost a whole bar (110) standing in that corner — a wall that had not existed before. The finale now authors its side (`SpawnSpec.side: 'west'`): the bound thing comes up the hall behind the party, the fight happens in the open with ground on both sides, and the corner cannot be authored by accident. `spec.side` is a general lever for anything whose *side* is part of its meaning (`from` already said where, this says which edge).
- Tuning after the change, 12 seeds in both modes: **12/12 victories, no walls** — press 0/0, choke 9/40, duel 15/27, ambush 0/0, flood 15/34, hold 3/23, boss 2/18 (`--fresh`: 8/8, no walls; the press and the trap still cost a competent player nothing, deliberately, and the masher still dies in most seeds). The stand's crowd brake went from one to two because the arrival rule moved the ground out from under it: with beats walking in from the picture's edge, the road itself takes seconds to deliver anyone, so the queue can hold two without ever crowding the player — and at one the stand was measured costing a competent bot exactly nothing. The honest new finding, recorded rather than papered over: **the finale is now the cheapest encounter for a competent bot** (2 mean, 18 worst; 0/0 from a full bar) because the grotesque has `armor: 0` and a light chain can be walked through it — the corner used to be the only thing that gave it teeth. That is a boss-kit problem (the duel already taught the answer: plate that shrugs lights), not a ground problem, and it is the next pass.
- The HUD was cut down to the LF2 readout: the fighter's name, the weapon in his hands (with its pips), a health bar and a guard bar, all as text and thin bars — no panels, no `Health 110/110`, no score panel, no objective box, no mid-screen `N HIT` badge. The top-right carries the journey in two lines (`The Town` / `WAVE 1 OF 1 · STREET RABBLE`), the only objective the HUD states is the one that cannot be read off the world (a stand's clock), the clear and take cues moved to the lower middle of the picture, and the doctrine line (`PROVOKE › TAKE › HIT`) now fades in only while a provoke or an opening is live — state, not chrome. Health is read over the fighters' heads, in the world, where the fight is.
- Plumbing that moved with the model: the snapshot carries `levelIndex`, `levelName`, `waveInLevel` and `wavesInLevel` (schema **v8**), the network validator range-checks them, and the renderer takes its scenery from the *level's* `setting` (`BackgroundCatalog.resolve` is now keyed by scenery id rather than by a wave index, and `BACKGROUND_MANIFEST` is a record keyed by `SceneryId`, so a missing setting is a compile error). The old `waveIndex`-as-level-index trick is gone.
- Tests: new `tests/level-structure.test.mjs` (4 tests — no fighter ever appears inside the picture, a level is walked once, a doorway opens only at a level's end, and every road is wide enough for the rule), `tests/encounter-shape.test.mjs` rewritten around the nesting (including that no wave carries its own `stageWidth` any more and that every level's setting has art), and `tests/stage-exit.test.mjs`, `tests/scrolling-stage.test.mjs`, `tests/field-items.test.mjs` and `tests/simulation.test.mjs` updated where they pinned the old one-arena-per-fight geometry. Suite is **119/119**.

# Which build is on screen

- A report of "text and a health / block bar at the top of the screen" turned out to be a **deployment**, not a design: the durable launchd server on 4174 serves a copy of the site outside the checkout, refreshed by hand and therefore drifted, and it was still serving the pre-HUD-rework build — `#player-name`, `Health 110 / 110`, `Guard 72 / 72`, `SCORE`, `The Bound Grotesque`. Not one of those ids exists in `src/ui/ui.ts` any more. (The first fix for this was a manual command, `npm run deploy:app`; the overhaul below replaced it, because a copy a person has to remember to publish is the bug.)
- The second cause was in the worker, and it made a reload not always enough. The precache is keyed without a query string but the fetch handler matched with `caches.match(event.request)`, which is search-sensitive — so `?autostart=1&seed=7` missed the cache and went to the network for `index.html` while the scripts still came from the previous build's cache. Fresh markup with yesterday's JavaScript is a **broken** page rather than an old one (the old UI asked for `#player-name`; a live probe threw `Missing UI element #player-name`). The handler now matches with `ignoreSearch: true`, for the navigation fallback too: a tab sees one build's files together, is a build behind, and is moved forward by `skipWaiting`/`claims` and the reload `main.ts` already does. `tests/package.test.mjs` pins both matches and the absence of the search-sensitive call. Suite is **120/120**.

# Next
- The finale needs a kit, not a corner: the bound thing has `armor: 0`, so a light chain walks through it and the encounter costs a competent bot 2 health (0 from a full bar). The duel already taught the answer — plate that absorbs a light and answers it — and the grotesque is the natural place to spend it. Measure it with `npm run measure -- --fresh --seeds ...` before and after.
- Field arms are one-sided: enemies never pick up what their dead mates drop, so a stage full of cudgels only ever helps Meyer. A thug arming itself off a fallen pair would make ignoring the road cost something — and the offer machinery (`itemWithinReach`) is now the right place to hang an AI reach.
- With takes now deliberate, the 26 s item fade is the binding constraint on looting: a club dropped in a fight the player runs past expires before they can come back for it. A longer life for findings the player has *seen* (or a fade that pauses while the stage is clear) is the next honest choice to make.
- Guest item positions snap at the 20 Hz snapshot rate because `interpolateGuestSnapshot` only smooths actors; items move fast enough in flight to be worth the same treatment.

# Overhaul: one authority per fact

The thread's work was a sequence of passes — encounter kinds, levels and waves, off-screen
arrivals, the two-way camera, deliberate pickups, the HUD's diet, the stale deploy — and by
the end each pass had left a second place where one fact lived. This pass went through the
whole diff looking for those, and left the design described once.

- **The campaign is the nesting.** `src/sim/waves.ts` authors `LEVELS` and nothing else: the
  flat `WAVES` table, `levelIndexForWave`, `waveIndexWithinLevel`, `waveCountOf`,
  `levelForWave` and `waveDefinitionAt` are gone (the last two were dead code that only the
  type checker had been keeping honest). The sim holds `levelIndex` and `waveInLevel`, reads
  the fight as `LEVELS[levelIndex].waves[waveInLevel]`, and moves them only through
  `advanceWave` — next fight of this place, or the next place. "Is this the level's last wave"
  is asked in one place instead of being re-derived from a running count at four call sites,
  and the clamps that made an out-of-range index mean something have nothing left to clamp.
- **One word for the ground.** The campaign moved to levels and waves while the geometry kept
  saying *stage*: `stageWidth` was the level's road, `stageBounds` its bounds, `stageExitX` its
  doorway. Now `road`, `roadBounds`, `levelExitX`, `LEVEL_EXIT`, `WAVE_CLEAR_DELAY`, and the
  renderer's `drawRoadLane` / `drawLevelExit`. The road is resolved once when the journey
  enters a level (`GameWorld.bounds`) rather than re-derived in eight places, several of them
  per-actor per-frame.
- **The snapshot is the fight.** Schema **v9**: `levelIndex`, `levelName`, `scenery`,
  `waveInLevel`, `wavesInLevel`, `waveTitle`, `waveLabel`, `lane`, `roadWidth`, `exitOpen`,
  `holdRemaining`. The renderer draws the lane the sim is actually clamping the fight with
  (it used to look the same lane up in the campaign by index and hope the two agreed), takes
  its scenery from `scenery`, and imports no campaign table at all. The DOM layer followed:
  the banner's title and subtitle arrive on the event, the place and the count off the
  snapshot, the clock cue off `holdRemaining`, and the take cue off the same
  `itemWithinReach` predicate the press accepts with. `Lane` and `SceneryId` moved to
  `src/sim/types.ts`, so the shape of the road is world vocabulary rather than campaign data.
- **The title screen stopped being a second schema.** The controller used to write out a
  twenty-field snapshot literal for the title backdrop, which the schema then left behind
  twice. It is `titleSnapshot()` in the sim now, next to the snapshot it is standing in for.
  The peer handshake went to version **3** for the same reason the schema went to 9: a mixed
  pair cannot read each other's packets, so the pairing is refused instead of silently
  dropping every snapshot.
- **Dead flexibility, removed.** `SlotBudget` and `WorldGame.slots` — a per-wave attack budget
  the design had already abolished, left behind as a field that was only ever the frozen
  shared value. `ATTACK_SLOTS` is read directly, and `tests/encounter-shape.test.mjs` still
  fails if a wave starts carrying a difficulty knob of its own.
- **The trap's rule, spelled out.** `checkAmbushTrigger` had `definition.ambush.trigger + 420`
  twice with an unnamed 420, and a third condition that the current geometry can never reach.
  The rule now reads as three named facts (`reachedTrigger`, `baitIsBroken`, `AMBUSH_PURSUIT`)
  with the room-behind guard kept as the invariant it is.
- **Every served copy is published by the build.** `tools/preview-sync.mjs` arms a *preview*
  copy (kill-switch worker, never offline) and, optionally, a *deploy* copy (the real worker,
  offline intact, launchd agent kickstarted after the sync). `npm run build` refreshes both,
  `npm run preview:status` reports whether either has drifted from the checkout, and
  `npm run deploy:app` — the manual `rsync` whose forgetting *was* the stale-HUD bug — is
  gone. One place publishes, so no copy can be a week behind.
- **Waves are described by what they are, not by what they measured.** `waves.ts` had 350
  lines of tuning archaeology — measured costs, discarded variants, whole paragraphs of
  narrative — duplicated in `progress.md` and the decision log. Each value now carries the
  one or two lines that justify it (the number that decided it, in the units the game uses),
  and the long-form record lives where it belongs.
- Tests followed the model rather than the vocabulary: `tests/stage-exit.test.mjs` →
  `level-exit.test.mjs` (driven by a `stand(world)` helper that names the fight as
  `place.fight`), `scrolling-stage.test.mjs` → `scrolling-road.test.mjs`, `level-structure`
  rewritten around the two counters, and the campaign-shape tests iterate the nesting instead
  of a flat table. `tests/guest-interpolation.test.mjs` had been interpolating a snapshot
  fixture from schema 4; it now builds a current one. `tools/encounter-measure.mjs` reports a
  fight as a campaign index derived from the two counters, and its per-wave line prints the
  fight's title (it had been slicing titles on an em dash that no longer existed, so it had
  been printing nothing). Suite is **121/121**, and the instrument still reads the same
  campaign: 3 seeds, adaptive 3/3 in victory with no walls, the masher dying in the duel, the
  flood and the stand.

# Art overhaul: the work order

The art pass is specced rather than started. `docs/ART_OVERHAUL.md` is written to be fed to an
image generator one clip at a time: a verbatim style block and negative block, the frame
contract the validator actually enforces, and then every clip as a six-row pose table with a
copy-paste prompt under it. What it fixes, and what it found while being written:

- **Scope is bounded by a rule, not a list.** Meyer's longsword gets the three signature
  combos (the invitation, the wheel, the scissors); every other kit and every opponent keeps
  one standard idiom — the existing state set (twelve clips for Meyer, seven to eleven for an
  archetype) and its three zone attacks. A
  weapon kit is then the same pose strips repainted with a different thing in the hand.
- **Two of the three combos are art for mechanics that are already shipped.** `ls_h`, `block`
  and `ls_counter` already carry provoke / take / hit in `world.ts` (the blocked heavy sets
  `provokeTimer`, the parry and the deflecting window are the take, the opening multiplier is
  the payoff); the pass teaches the art to *show* it, and adds no sim. Only the Twerchcopter
  and the Krumphau–Schielhau pair are new clips, and their pose recipes are written in rig
  terms so they can be blocked before they are painted.
- **Nothing can be drawn in the air, and that is a validator rule.** `MAX_GROUND_DRIFT` holds
the lowest ink of every frame to row 350 ± 1. So the spinning combo is authored as a **planted
pivot** — the turn lives in the hips, the shoulders and a lifted heel, and the figure's own
foreshortening is what sells it. A leaping revolution would need the check and the six-frame
ceiling loosened first.
- **The road is in the wrong layer.** The cobbles are baked into the parallax backdrop and
therefore slide at 35 % of the fighters' speed, which is why the ground could never carry
detail. The overhaul splits the picture into three planes (wall, road, furniture) and gives
the road a tileable strip at 1:1.
- **The backdrop is upscaled and stretched.** The four hangings are 1280 × 720 drawn into a
1920 × 1104 box — a 1.5× upscale and a 2.2 % vertical stretch — and their bottom 224 px are
never on screen. New art is authored at 1920 × 1080 and drawn 1:1 (one number), with the
composition's safe window written out: a 1920 × 208 band above the road that is *always* seen,
and a 1920 × 512 field behind it that only shows through gaps.
- **One small tool is missing.** `clip.json` is written by the rig generator, so art that did
not come from the rig has no metadata; the validator checksums it, anchors it, and cross-checks
every bone against the rig's proportions. Repainting a *rig-blocked* strip keeps the landmarks
valid, which is the practical argument for posing first and painting second — and the reason
the brief asks for a metadata refresh mode beside the validator.

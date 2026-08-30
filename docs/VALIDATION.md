# Build validation

## Completed in the package build environment

Date: 2026-08-30

- TypeScript strict compilation completed successfully.
- Service worker was regenerated with every compiled JavaScript module and static shell file in its precache.
- Fifteen Node tests passed:
  - UI identifiers match the shipped HTML shell
  - compiled ES-module imports resolve
  - service-worker precache entries exist
  - PWA manifest assets resolve
  - soft-target depth preference and target stickiness
  - weapon-specific combo routes
  - behavioral lesson transformations
  - wave progression through lesson selection
  - JSON-serializable two-player snapshots
  - fixed-seed/input determinism
  - complete run progression through both lesson gates to victory
  - peer input message validation
  - authoritative snapshot validation
  - upgrade/start protocol range validation
  - shared pause-message validation
- The zero-dependency local server returned HTTP 200 for the game shell and all 26 precached URLs.
- Compiled output is included under `site/`; GitHub Pages deployment does not require a package install.

Run the same checks with:

```bash
npm test
npm start
```

## Still requires external verification

The build container’s managed Chromium policy blocks all navigated URLs. As a result, an end-to-end browser screenshot/playthrough could not be completed in that environment even though the local HTTP server was reachable through command-line requests.

The following remain required before calling the slice externally validated:

- Visual browser playthrough on an ordinary desktop browser
- iOS Safari and Android Chrome physical-device tests
- Tilt permission/calibration behavior on real sensors
- Safe-area and landscape layout review
- Installed PWA/offline relaunch
- Audio unlock behavior on target browsers
- Two-phone manual WebRTC connection and a complete co-op run
- Performance, thermal, and memory profiling
- Accessibility and reduced-motion review

## Known prototype limitations

- Procedural silhouettes are graybox art, not historically reviewed character designs.
- Move labels are working names.
- Guest-side prediction, interpolation, defensive rewind, reconnect, and TURN relay support are incomplete.
- Lesson choice is shared and host-controlled in co-op.
- Run state and profile progression are not saved.
- Gamepad mapping and left-handed/custom touch layouts are planned but not implemented.
- Browser orientation lock is requested through the PWA manifest; the rotate overlay is the reliable fallback.

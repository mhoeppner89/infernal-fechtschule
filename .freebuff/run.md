# Run doc — The Infernal Fechtschule (port 4174)

Static TypeScript game: the build compiles `src/` with `tsc` into `site/js/`, regenerates the
service-worker precache, and the server just serves `site/` — no framework, no dependency
install (no `node_modules` is needed; the only dev tools are `tsc`, `node --test`, and
Python/Pillow for art scripts).

## Reproduce the artifacts

```bash
cd /Users/mhoeppner/Desktop/infernal-fechtschule
npm run build        # = tsc -p tsconfig.json && node tools/write-service-worker.mjs
```

This is the full pipeline: it emits `site/js/**` from `src/`, rewrites `site/sw.js`, and
refreshes any armed preview copy (see below). There are no env files to copy and no package
installs.

The served payload is **970 files / 21 MB**, and `site/` is 30 MB on disk. It was four times
that until the superseded v1 sprite tree moved out: `site/assets/art/` now holds only the four
backdrop images the renderer loads, and the v1 sprites plus their loose PNG strips and preview
sheets live in `art-source/v1/` — source for the v1-era tools (`stylize-runtime-art.py`,
`repair-sprite-defects.py`, `audit-animation-scale.py`, `generate-recovery-inbetweens.py`),
never served. **Anything under `site/` ships by default**, so art that is only source belongs
outside it; `tools/write-service-worker.mjs` additionally keeps editable `.png` strips and
`normalization.json` reports out of the precache under every art root.

The worker's cache name is a digest of the served bytes rather than the version string
(`infernal-fechtschule-0.1.1-a087cf5de6`), so a changed build cannot leave a returning tab
pinned to an old one — and an unchanged rebuild does not force clients to re-download the
payload.

## Run the server

The durable server on the default port 4174 is the launchd agent
`com.infernal-fechtschule.serve` (plist in `~/Library/LaunchAgents/`). It runs
`node <app-copy>/tools/serve.mjs` with working directory
`~/Library/Application Support/InfernalFechtschule/app`, where `tools/serve.mjs` serves the
sibling `site/` directory (defaults: port from `$PORT` else 4173 — the plist pins 4174).

That copy is published by `npm run build` like every other served copy, once the checkout is
armed (see below). Nothing about it is maintained by hand, and it is the *real* build: its own
precache worker stays, so offline still works there. `npm run preview:status` reports whether
it is still serving this checkout's build, and that question is the one worth asking before
debugging a UI that "should" have changed — the copy once served a top-of-screen health and
guard bar for a week after the HUD rework.

(Historical note for anyone reading an older recipe: `npm run deploy:app` was a manual
`rsync` of this copy, and it is gone precisely because forgetting it was the bug.)

Check: `curl -s http://localhost:4174/ -o /dev/null -w "%{http_code}"` → 200.

### Ad-hoc alternative (for a throwaway preview port)

```bash
PORT=4175 node tools/serve.mjs
```

`tools/serve.mjs` serves the workspace `site/` directly (path `../site/` relative to the
tool), so this works straight from the checkout without any sync.

#### Persistent previews: serve a copy outside `~/Desktop`

A detached server **cannot serve this checkout in place**. The workspace lives under
`~/Desktop`, which macOS TCC protects: a process spawned by `launchd` (not by the app that
holds the Desktop grant) gets `EPERM` on both `process.cwd()` and `open()` of any file
under the checkout. It still *creates* files there, which is why the failure looks like a
silent exit 1 with a `uv_cwd` or `open ... serve.mjs` EPERM in the log.

The fix is to serve a copy of the built site from outside the protected tree. `serve.mjs`
resolves `../site/` relative to its own file, so the copy needs both directories, and
`tools/preview-sync.mjs` creates and maintains them:

```bash
node tools/preview-sync.mjs --dir /tmp/infernal-preview --port 4175 \
  --label com.infernal-fechtschule.preview --log "$PWD/.freebuff/preview.log" \
  --deploy-dir "$HOME/Library/Application Support/InfernalFechtschule/app" \
  --deploy-label com.infernal-fechtschule.serve
```

`--deploy-dir` is optional and adds the durable copy above to what every build publishes; a
preview copy is what carries the kill-switch worker, a deploy copy keeps the build's own
worker and gets its launchd agent kickstarted after the sync.

Then launch it detached. `nohup ... &` from a tool shell is reaped when the command
returns, so on macOS use launchd and keep the working directory outside `~/Desktop`
(only the *script path* may point into it):

```bash
LOG=/Users/<user>/Desktop/infernal-fechtschule/.freebuff/preview.log
launchctl submit -l com.infernal-fechtschule.preview -- /bin/sh -c \
  "cd /tmp && PORT=4175 exec /opt/homebrew/bin/node /tmp/infernal-preview/tools/serve.mjs > $LOG 2>&1"
launchctl print gui/$(id -u)/com.infernal-fechtschule.preview | grep -E 'pid|state'
launchctl remove com.infernal-fechtschule.preview      # when the preview is done
```

Launchd runs with `PATH=/usr/bin:/bin:/usr/sbin:/sbin`, so `node` must be an absolute path.
Two more traps worth remembering: the log file must not already exist as a *relic of
another app* (a file carrying `com.apple.provenance` is refused — `rm` it first), and
launchd's `-o`/`-e` flags fail (`EX_CONFIG`) for paths inside the checkout, so redirect
inside the shell command instead.

**Refresh after every build is automatic once the copy is armed**, which the command above
does. `npm run build` then ends by mirroring `site/` and `tools/serve.mjs` into that
directory — incremental (~160 ms; only files whose size or mtime moved are copied, and
files the build no longer emits are pruned), so a build both emits the site and puts it in
front of the preview — and into the deploy copy too if one is armed, which is what keeps
the durable server on 4174 in step with the checkout. The arm marker is
`.freebuff/preview-sync.json` in *this* checkout, so other worktrees and fresh clones are
untouched: the hook is a silent no-op until a checkout is armed. `npm run preview:status`
reports every armed directory, the build being served, whether the port answers, and
whether a deploy copy has fallen behind. `--disarm` opts back out.

That copy deliberately does **not** ship the game's precache worker. It gets a kill-switch
worker instead, which deletes every cache and unregisters itself, so the preview can never
serve a build from cache and needs no manual cache clearing — reload the tab and you have
the current build. The trade is no offline support in the preview, which is the point: a
preview must never be offline. (Offline remains intact for the real deploy, whose worker
keeps its precache under a content-derived cache name.)

The `?autostart=1&skipCountdown=1&seed=7` query is the quickest way to get a live run for
a screenshot; note that an idle run ends in defeat after roughly 20 seconds, so press
Fence the Road Again (or reload) before showing it.

### Viewing in a portrait pane

The arena is authored at 1280x720. `#game-canvas` letterboxes to a 16:9 box on any pane
(a canvas ignores `object-fit`, so the rule computes `min(100%, 100vh * 16/9)` by axis),
and the rotate prompt only appears on coarse-pointer (touch) devices under 900 px wide.
A desktop or preview pane that is taller than wide therefore still shows the whole
correctly proportioned arena, just small.

## Regression checks

```bash
node --test tests/*.test.mjs                          # 121 unit tests
npm run measure                                       # bot playthroughs: what each encounter costs
npm run measure -- --fresh --seeds 5,17,29,41           # a full bar at every wave line, four seeds
npm run measure -- --seeds 5,17,29,41,53,67,79,91,103,115,127,139   # twelve seeds, campaign mode
node tools/lesson-flow-verify.mjs                     # live probe against :4174 (11 checks)
node tools/scroll-stage-verify.mjs                    # scrolling-road march probe
node tools/zone-reaction-verify.mjs                   # per-zone hit reactions probe
```

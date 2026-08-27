# ARES-1 Dashboard — run doc

## 1. Reproduce uncommitted artifacts

A fresh checkout needs one generated artifact:

- **`public/cesium/`** — Cesium's built assets are copied from `node_modules` by the
  `postinstall` hook (`scripts/copy-cesium-assets.cjs`). Reproduce with:

  ```bash
  npm install        # runs postinstall automatically
  # or, if node_modules already exists:
  npm run postinstall
  ```

  The app fetches `/cesium/Assets/...` at runtime, so the page renders an empty
  scene if this step is skipped.

No `.env` / `.env.local` files exist — none are needed.

## 2. Run the dev server

```bash
npm run dev -- -p 3000     # Next.js 15 dev server
```

- Preferred port: **3000** (Next default). If taken, pick a free port and pass `-p <port>`.
- Startup: ~1s; first page compile ~0.6s. Verify with
  `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` (expect 200).

### Detaching (macOS)

The command runner reaps its own process group between tool calls, so plain
`nohup ... &` servers die the moment the call ends. launchd jobs survive — but
⚠️ **launchd's default PATH has no `/opt/homebrew/bin`, so bare `npm` fails with
"command not found" → exit 1 → a silent ~3s respawn loop with an empty log.**
That (not TCC) is the root cause of most launchd failures here; launchd CAN
execute and write inside `~/Documents` for this project.

Verified working form (boots in ~1s, port bound, survives across calls):

```bash
launchctl submit -l <label> -- /bin/sh -c 'echo "sh-alive $(date)" > /tmp/next.log; \
  cd <project> && PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin \
  exec npm run dev -- -p 3000 >> /tmp/next.log 2>&1'
```

Debug tips: put an `echo` marker BEFORE `cd` in the job payload — if the marker
lands but nothing follows, `cd`/`exec` failed; if no marker at all, the payload
never ran. Probe launchd write/execute access with a one-line `echo > /tmp/f`
job. Remove the job with `launchctl remove <label>` when done.

Fallback (if launchd misbehaves):

```bash
python3 -c "
import subprocess
log = open('<project>/.freebuff/preview-<id>.log', 'w')
p = subprocess.Popen(['npm','run','dev','--','-p','3000'],
    stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
    start_new_session=True, cwd='<project>')
print(p.pid)
"
```

`start_new_session=True` (a new POSIX session) is what lets the child survive
the reaper; plain `nohup ... & disown` from the runner shell does not.

Register the preview with the URL plus the **listener** pid from
`lsof -iTCP:3000 -sTCP:LISTEN` (the `next-server` node process, not the npm/sh
parent).

## 3. Stack notes

- Next.js 15 App Router, React 19, Cesium 1.134 + resium, Tailwind v3.
- Entry: `src/components/Globe.tsx` (hero landing + pinned console, Lenis smooth
  scroll). Fonts/audio copied from the shutterkif portfolio into `public/fonts` and
  `public/audio`.

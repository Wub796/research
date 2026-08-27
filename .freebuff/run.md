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

⚠️ **`launchctl submit` is unreliable for this project.** The repo lives under
`~/Documents`, and macOS TCC blocks launchd-spawned jobs from *executing* script
files inside that tree (exit 126 / empty logs); inline `-c` jobs usually hang
`next dev` at 0% CPU without binding the port. One form DID work end-to-end
(ready in ~1.1s, port bound) — a **block-redirect** with no env-var prefix:

```bash
launchctl submit -l <label> -- /bin/sh -c "{ cd <project> && exec <node> node_modules/next/dist/bin/next dev -p 3000; } > /tmp/next.log 2>&1"
```

Notes: the log redirect must wrap the WHOLE block (`{ ...; } > log`), not just
`exec ... > log`; env prefixes like `NEXT_TELEMETRY_DISABLED=1 exec` made it exit
1 silently. Prefer the python method below — it starts reliably — and fall back
to the launchd block form only if the python process keeps getting reaped.

Working detach method (used for the live preview):

```bash
python3 -c "
import subprocess
log = open('<project>/.freebuff/preview-<id>.log', 'w')
p = subprocess.Popen(['nohup','npm','run','dev','--','-p','3000'],
    stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
    start_new_session=True, cwd='<project>')
print(p.pid)
"
```

The process survives across tool calls within a session; if it dies, re-run the
same command. Register the preview with the URL plus the **listener** pid from
`lsof -iTCP:3000 -sTCP:LISTEN` (the `next-server` node process, not the npm parent).

## 3. Stack notes

- Next.js 15 App Router, React 19, Cesium 1.134 + resium, Tailwind v3.
- Entry: `src/components/Globe.tsx` (hero landing + pinned console, Lenis smooth
  scroll). Fonts/audio copied from the shutterkif portfolio into `public/fonts` and
  `public/audio`.

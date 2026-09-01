# KRUPP CAPITAL TRADING SUITE — Agent Worklog

---
Task ID: 1
Agent: Z.ai main orchestrator
Task: Merge the "GLM5.3Flash Navier Stokes & Trading Suite fave.zip" frontend INTO the "GLM5.3 mit Tabs Navier Stokes & Trading Suite.tar" reference repo as the standard landing tab, and build a dual-colourline theme system so BOTH palettes work across BOTH frontends (default = MK-II navy from the tar repo).

Work Log:
- Extracted both archives to /home/z/extracted/{ref,fave}. Inventoried: tar = 13-desk KRUPP CAPITAL MK-II suite (9k LOC, cyan/navy #05070b palette); fave = London Strategic Edge L3 Risk Desk SPA (7k LOC, phosphor-green #020202 palette + socket.io feed on :3030).
- Copied tar core into project: `src/lib/krupp/*` (engine, store, charts math) and `src/components/krupp/*` (Shell, 13 desks, 8 charts, CrisisOverlay, DeskFrame, ui kit).
- Ported fave frontend into namespaced folders: `src/lib/london/*` (16 lib modules) + `src/components/london/*` (26 components); rewrote imports `@/lib/krupp/`→`@/lib/london/`, `@/components/krupp/`→`@/components/london/`. Created `LondonEdge.tsx` from fave page.tsx.
- Copied fave API routes: /api/events, /api/ledger, /api/volhistory, /api/agent/commentary (ZAI LLM), /api/auth/demo-token. Merged prisma models RiskEvent + VolSnapshot + LedgerFill into schema.prisma, `bun run db:push` OK.
- Copied `mini-services/krupp-stream` (socket.io :3030 market relay) and `public/workers/krupp-risk-engine.js` (risk Web Worker — missed on first pass, fixed after browser QA showed zeroed risk metrics).
- Built dual-colourline theme kernel `src/lib/theme.ts`: ThemeId 'mk2'|'hft', full ThemeTokens maps (surfaces/borders/text/semantics/series/glows), zustand store + localStorage persistence ('krupp-colourline'), KT() JS resolver for canvas draw closures, hydrateTheme().
- Rewrote `src/app/globals.css` (1088 lines): scaffold base + `@theme` k* semantic palette (kbg/kpanel/kborder/kaccent/…) + `[data-theme='mk2']` and `[data-theme='hft']` blocks that re-point shadcn vars, --rgb-* channel triplets, --k-* surface vars AND Tailwind v4 palette vars (--color-emerald-*, --color-zinc-*, …) so the ENTIRE Tailwind palette cross-maps per theme (hft: emerald→#00ff66, rose→#ff1133, amber→#ff8800, violet→#9d00ff, zinc→sage; mk2: fave green→emerald, red→rose). Ported tar terminal layer + fave terminal layer (krupp-panel, scanline, glows, LEDs, book bars, sys-rails, regime/[data-sys] accents, alerts, pulse) re-tokenized to vars; kept A4 print pipeline.
- Tokenized ~7k LOC: replaced ALL hardcoded hex literals with KT() calls (canvas-safe; added hexA() helpers) or k* utility classes (bg-kpanel, text-kaccent-soft, …); tar cyan-* classes → kaccent-*; fave K palette object → live Proxy resolving per active theme; JSX attr corruption from scripted sed fixed (=KT("x") → ={KT('x')}).
- New `Shell.tsx` (MK-III): 14 tabs — tab 0 LONDON EDGE (landing, default active) + 13 desks; ThemeSwitcher segmented control in header (MK-II NAVY / HFT MATRIX); whole workspace keyed by theme so a flip remounts UI (module-scope engines survive, no data loss); pre-paint inline script in layout.tsx sets <html data-theme> from localStorage (no flash).
- Verified via agent-browser through the :81 gateway: landing tab live (socket feed ES/NQ/SPY streaming, IV surface, CBOE parity, risk worker → composite score 30.5 CALM, Hawkes λ live); theme toggle both directions with full palette swap (screenshots qa-01…qa-13); desks 01–13 sweep clean; crisis simulation (lockdown overlay, interceptors ENGAGED, latency spikes, auto-recovery countdown); mobile 390px responsive incl. sticky footer; theme persists across reload.

Stage Summary:
- DELIVERED: unified KRUPP CAPITAL MK-III terminal — London Edge landing tab + 13-desk matrix, dual-colourline switch (default MK-II navy per tar reference; HFT phosphor optional), persisted preference, all 5 API routes + prisma persistence + :3030 stream relay running.
- Key files: src/lib/theme.ts, src/components/krupp/Shell.tsx, src/components/krupp/ThemeSwitcher.tsx, src/components/london/LondonEdge.tsx, src/app/globals.css, src/app/layout.tsx, prisma/schema.prisma, mini-services/krupp-stream, public/workers/krupp-risk-engine.js.
- Verification: `bun run lint` clean, `bunx tsc --noEmit` clean for src/, dev server 200s, all APIs OK, browser-verified interactivity in both colourlines.
- Known notes: (1) London socket feed requires the Caddy gateway path (io('/?XTransformPort=3030')) — direct :3000 browsing bypasses the relay; preview MUST go through the preview panel/gateway. (2) Theme flip remounts the workspace by design (engines keep state). (3) Crisis crimson + print pipeline are intentionally theme-invariant.

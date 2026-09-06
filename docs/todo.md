# Build roadmap — UTM-LLMV

> ## ✅ BUILT — 2026-09-06. Site is LIVE at https://llmv.utmcs.online
> Owner approved the build 2026-09-06. Phases 1–7 executed and verified the same day.
> The only incomplete item is the Ollama bind change on the Mac (owner deferred it),
> which gates the playground and nothing else.

**Compiled:** 2026-09-06. Legend: `[ ]` not started · `[~]` in progress · `[x]` done (dated) ·
⏳ pending external action.

Phases map 1:1 to the scaffold runbook so the audit phase can diff plan vs built.

---

## Phase 0 — Decisions ✅ COMPLETE

- [x] Architecture chosen (RUST ECO, DSA-sibling shape) — 2026-09-06
- [x] Compute split resolved (hybrid: push + live proxy) — 2026-09-06
- [x] IA fixed at 3 pages — 2026-09-06
- [x] Quant ladder fixed at 3 levels, tags verified against the live registry — 2026-09-06
- [x] Git remote chosen (`azlanabas/utm-llmv`) — 2026-09-06
- [x] Gate credential supplied by owner — 2026-09-06
- [x] Ports chosen from a live survey (3092 / 8092, both verified free) — 2026-09-06
- [x] Docs corpus authored — 2026-09-06

---

## Phase 1 — Environment

**On kerry:**
- [x] `sqlite3` CLI installed (⚠️ verified absent 2026-09-06)  _2026-09-06_
- [x] Confirm `/root/.cargo/bin/cargo` runs (⚠️ not on the default non-login PATH — the  _2026-09-06_
      systemd unit and any script must use the absolute path)
- [x] `git init` in `/srv/utmcs/llmv`, `.gitignore` in place (`fileStructure.md` §5)  _2026-09-06_
- [x] Re-verify 3092 and 8092 are still free **at build time**, not trusted from this doc  _2026-09-06_
- [x] `/etc/nginx/.htpasswd-llmv` created with `htpasswd -B` (bcrypt), user `roger`,  _2026-09-06_
      mode 0640 `root:www-data` — matching the existing `.htpasswd-*` convention
- [x] Ingest token generated (32 bytes, random), stored in `.secrets/app-pass/llmv.md` and  _2026-09-06_
      `backend/.env` (0600). **Never in git, never in a doc.**

**On the Mac:**
- [ ] ⏳ **Owner approves the Ollama bind change** (README §3, pending action 1)
- [ ] `OLLAMA_HOST=100.69.208.5:11434` set in `homebrew.mxcl.ollama.plist`,
      `brew services restart ollama`
- [ ] **Verify from kerry:** `curl -s --max-time 3 http://100.69.208.5:11434/api/tags`
      returns 200. ⚠️ This must be proven **from kerry**, not from the Mac's own loopback —
      a localhost success proves nothing about the Tailscale path.
- [ ] Confirm Ollama is **not** reachable on the Mac's LAN IP (the bind is Tailscale-only)

**Checkpoint 1 → report to Azlan before proceeding.**

---

## Phase 2 — Models on the Mac

- [x] `ollama pull llama3.2:1b-instruct-q2_K` (0.58 GB)  _2026-09-06_
- [x] `ollama pull llama3.2:1b-instruct-q4_K_M` (0.81 GB)  _2026-09-06_
- [x] `ollama pull llama3.2:1b-instruct-q8_0` (1.32 GB)  _2026-09-06_
- [x] `ollama list` shows all three (⚠️ shows **zero** models today, verified 2026-09-06)  _2026-09-06_
- [x] Record each one's actual on-disk size (registry manifest sizes are downloads, not  _2026-09-06_
      necessarily what lands on disk — measure, don't assume)
- [x] Smoke test: one generation per quant, confirm sane output  _2026-09-06_

Total pull ≈ **2.71 GB** against 110 GB free.

---

## Phase 3 — Backend (Axum on kerry)

- [x] `cargo init`, dependencies per `design_doc_backend.md` §1.1  _2026-09-06_
- [x] `config.rs` — all vars required, refuses to start if any is missing  _2026-09-06_
- [x] `db.rs` + `migrations/0001_init.sql`, WAL + busy_timeout  _2026-09-06_
- [x] `GET /api/health` returns 200 with `db_ok: true`  _2026-09-06_
- [x] `POST /api/ingest` — token guard, validation, single transaction  _2026-09-06_
- [x] `GET /api/runs`, `/api/runs/latest`, `/api/runs/:id`, `/api/stats`  _2026-09-06_
- [x] `ollama.rs` — probe + streaming client over Tailscale  _2026-09-06_
- [x] `GET /api/live/health` — **never returns 5xx**, `false` on any failure  _2026-09-06_
- [x] `POST /api/live/generate` — SSE, semaphore(1), 60 s cap, metadata-only logging  _2026-09-06_
- [x] Unit/integration tests in `tests/api.rs` (ingest happy path, bad token → 401,  _2026-09-06_
      duplicate cell → 422, health with the Mac unreachable → `mac_online: false`)
- [x] ⚠️ No file over 500 lines (global rule 5) — check `routes/live.rs` specifically  _2026-09-06_
- [x] systemd unit `llmv-backend`, absolute cargo/binary paths, `enable --now`  _2026-09-06_

**Checkpoint 2 → backend proven with curl before any frontend work.**

---

## Phase 4 — Benchmark harness (Mac)

- [x] `bench/pyproject.toml` (Python ≥ 3.11 — ⚠️ use `/opt/homebrew/bin/python3`, **not** the  _2026-09-06_
      system 3.9.6)
- [x] `prompts.json` — 3 fixed prompts: short ≈20 tok, medium ≈200 tok, long ≈800 tok  _2026-09-06_
- [x] `bench_config.json` — quant tags, repeats = 3, timeouts  _2026-09-06_
- [x] `run_benchmark.py` — warm-up discarded, per-repeat timing, `keep_alive: 0` unload  _2026-09-06_
      between quants, memory via `/api/ps`
- [x] Token counts from Ollama's `eval_count`/`eval_duration`, **not** estimated  _2026-09-06_
- [x] Both tokens/sec computations stored (Ollama's own, and wall-clock)  _2026-09-06_
- [x] `push_results.py` → `/api/ingest`, prints `run_id`  _2026-09-06_
- [x] **Full end-to-end run**: 3 quants × 3 prompts × 3 repeats = **27 measurements** stored  _2026-09-06_
- [x] Verify in SQLite that 27 rows landed and no cell is duplicated  _2026-09-06_

**Checkpoint 3 → real data in the DB before the frontend is built against it.**

---

## Phase 5 — Frontend (Next.js on kerry)

- [x] Scaffold, Tailwind, tokens from `color-scheme.md` §2 into `globals.css`  _2026-09-06_
- [x] Fonts self-hosted via `next/font` (no CDN)  _2026-09-06_
- [x] `layout.tsx` + `Nav` + `MacStatusBadge` (glyph **and** label)  _2026-09-06_
- [x] `/` — brief, spec table, **12 concept cards**, glossary  _2026-09-06_
- [x] `/benchmark` — run picker, summary table, 4 hand-drawn SVG charts, detail tables,  _2026-09-06_
      observations, methodology
- [x] Every chart: legend + direct labels + **table toggle** + hover tooltip + `tnum`  _2026-09-06_
- [x] ⚠️ No dual-axis chart anywhere  _2026-09-06_
- [x] Empty state (zero runs) and partial state (failed repeat) both implemented  _2026-09-06_
- [x] `/playground` — quant picker, SSE stream, live TTFT freeze, compare mode  _2026-09-06_
- [x] Offline state genuinely `disabled`, not just greyed  _2026-09-06_
- [x] Two-timings rule enforced (`design_doc_frontend.md` §6)  _2026-09-06_
- [x] PM2 `llmv-frontend` on 3092, `pm2 save`  _2026-09-06_

**Checkpoint 4 → all three pages reviewed with Azlan.**

---

## Phase 6 — Content

- [x] Write the 12 concept cards ⚠️ no term defined using another undefined term  _2026-09-06_
- [x] Write the What / How / Why paragraphs  _2026-09-06_
- [x] Glossary entries  _2026-09-06_
- [x] Methodology section — what was controlled, what is noisy  _2026-09-06_
- [ ] ⏳ **Azlan writes the "What I observed" quality notes** — this is his prose, not
      Claude's. The spec calls for his own read on output quality per quant.

---

## Phase 7 — Launch

- [x] ⏳ GoDaddy A record `llmv` → `187.127.216.146` (⚠️ verified absent 2026-09-06)  _2026-09-06_
- [x] Confirm DNS resolves from an external resolver before touching certbot  _2026-09-06_
- [x] nginx vhost: basic auth on the **whole server block** including `/api/*`  _2026-09-06_
- [x] ⚠️ `proxy_buffering off;` + `proxy_read_timeout 90s;` on `/api/live/` — without this the  _2026-09-06_
      SSE stream arrives in one lump and TTFT becomes meaningless
- [x] `certbot --nginx -d llmv.utmcs.online` (email `ai@gaiada.com`)  _2026-09-06_
- [x] ⚠️ Verify **after** reload with a fresh connection — a curl immediately after  _2026-09-06_
      `nginx reload` can be answered by the old worker
- [x] Nightly `VACUUM INTO` backup job, keep 14  _2026-09-06_ — systemd
      `llmv-backup.timer` (19:20 UTC = 03:20 GMT+8), retention tested 18→14
- [x] Reboot resilience: `systemctl is-enabled llmv-backend` + `pm2 startup`/`pm2 save`  _2026-09-06_
- [~] Post-deploy checklist in `handover.md` §5 — **most** boxes verified 2026-09-06.
      ⏳ NOT done: the Mac sleep/wake badge test (needs the bind change first) and an
      actual kerry reboot (would disturb 17 other apps — enablement verified instead).
- [x] Docs flipped to **as-built**: status banners, ticked boxes with dates, `handover.md`  _2026-09-06_
      completed
- [ ] Git remote `azlanabas/utm-llmv` added and pushed (**only when asked**)
- [x] Save non-obvious facts (ports, paths, deploy command, creds location) to memory  _2026-09-06_

---

## Explicitly out of scope for v1

| Item | Why |
|---|---|
| Finishing `/srv/utmcs/dsa` | Separate app, separate decision (README §2, ⏳ 4) |
| CI/CD | Decided against — manual on-server rebuild (README §2) |
| Dark mode | Ramp validated and recorded in `color-scheme.md` §3; shipping deferred |
| User accounts / roles | One shared gate credential is the whole auth model |
| A second model family (Qwen etc.) | Owner chose the 3-level Llama ladder exactly as specced |
| Storing playground prompt text | Deliberate privacy decision (README §2) |

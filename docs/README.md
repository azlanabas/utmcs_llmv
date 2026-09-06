# UTM-LLMV — AI Base Knowledge — RUST ECO (Next.js + Axum + SQLite) — As-built

> **Status: LIVE — https://llmv.utmcs.online** (built and verified 2026-09-06).
> Backend `llmv-backend` (systemd, :8092) · frontend `llmv-frontend` (PM2, :3092) ·
> nginx + Let's Encrypt (expires 2026-12-05) · basic auth over the whole site.
> One benchmark run stored (27/27 measurements).
>
> ⏳ **The playground is built but cannot work yet** — Ollama on the Mac is still bound
> to `127.0.0.1`, so kerry cannot reach it. The badge correctly reads "Mac asleep".
> See §4 pending action 1. Everything else is verified working.

**Location / source of truth:** `/srv/utmcs/llmv` on **hostinger-kerry** (server = git SoT).
Local mirror of these docs: `~/Documents/Claude/project_04/UTM/LLMV/docs/`
(⚠️ renamed/moved 2026-09-06 from `project_04/LLM_Showcase/` — older references to
`LLM_Showcase` mean this folder).
**Owners:** Azlan (`azlan@net1io.com`). **Target URL:** https://llmv.utmcs.online
(GoDaddy DNS → kerry `187.127.216.146`; nginx + Let's Encrypt).
**Compiled:** 2026-09-06 · **Decisions finalised:** 2026-09-06.

---

## 0. Start here

Reading order for a fresh Claude session:

1. **This file §2 (Decisions Log)** — every Phase-0 call, already resolved. Do not re-decide.
2. **This file §3 (Verified environment)** — what was measured live on 2026-09-06.
3. `architecture.md` — the split-brain design (Mac = compute, kerry = web) and why.
4. `todo.md` — the phased build roadmap. **PLAN ONLY — do not build yet.**
5. Everything else on demand.

**The one thing that makes this project unusual:** the model does not run on the web server.
Inference happens on Azlan's Mac (Apple M4). kerry serves the site and stores results pushed
from the Mac, and proxies live prompts back to the Mac over Tailscale when the Mac is awake.
Read `architecture.md` before touching anything.

---

## 1. Document map

| Concern | Document | Status |
|---|---|---|
| Hub, decisions, environment | `README.md` (this file) | ✅ complete |
| Split-brain design, data flows, failure modes | `architecture.md` | ✅ complete |
| Current vs target file tree | `fileStructure.md` | ✅ complete |
| Pages, nav, API endpoint inventory | `sitemap.md` | ✅ complete |
| SQLite logical model | `db_schema.md` | ✅ complete |
| CMS collections | — | ⛔ **N/A** — no CMS in this project (see §2) |
| Tokens, components, page specs | `design_doc_frontend.md` | ✅ complete |
| Axum services, Ollama proxy, benchmark harness | `design_doc_backend.md` | ✅ complete |
| Palette (active + alternates) | `color-scheme.md` | ✅ complete |
| Phased build roadmap | `todo.md` | ✅ complete — all boxes unticked |
| Ops: what runs where, rebuild/deploy | `handover.md` | ✅ complete (pre-build; flips to as-built in Phase 7) |
| Users + admins guide | `user_guide.md` | ✅ complete |
| Audit reports | `audits/` | — none yet |

---

## 2. Decisions Log (Phase 0 — finalised 2026-09-06)

**v1 stack: Next.js (kerry) + Rust/Axum + SQLite (kerry) + Ollama (Mac, over Tailscale).**

| # | Decision |
|---|---|
| **Architecture** | **RUST ECO** — new full-stack build, per `architecture-selector.md`. Deliberately mirrors the sibling app `/srv/utmcs/dsa` (DSA Explorer) so the two UTM teaching apps share one shape. Owner chose "Match DSA Explorer" 2026-09-06. |
| **Compute split** | **Hybrid.** The Mac runs all inference; kerry never loads a model. kerry stores every benchmark the Mac pushes (so results pages are always up) **and** proxies `/api/live/*` to the Mac's Ollama over Tailscale when reachable, greying out with an "offline" badge when not. Owner chose "Hybrid" 2026-09-06 after the initial answers conflicted (scope 3 = live playground vs push-only = no live inference); hybrid resolves both. |
| **Backend** | One Rust/Axum binary on kerry, systemd unit `llmv-backend`, port **8092** (verified free 2026-09-06). Owns: SQLite reads/writes, the results-ingest endpoint, the stats endpoints, and the Tailscale reverse-proxy to Ollama. |
| **Database** | Single SQLite file `/srv/utmcs/llmv/backend/data.db`. Same choice as the DSA sibling. No Postgres — this is a teaching demo with tiny, append-only data. ⚠️ `sqlite3` CLI is **not installed on kerry** (verified 2026-09-06) — install it in Phase 1 or inspect via the app. |
| **Auth (v1)** | **nginx basic auth over the entire site** — no application-level login at all. Realm file `/etc/nginx/.htpasswd-llmv`, user `roger`. Matches kerry's existing convention (`.htpasswd-hermes`, `.htpasswd-kerry`, `.htpasswd-workflows`, all verified present 2026-09-06). The fleet standard admin login (`web@gaiada.com`) is **not used** — there is no app login to seed it into. |
| **Secrets** | Gate password supplied by owner 2026-09-06; stored **only** in `/etc/nginx/.htpasswd-llmv` (bcrypt) on kerry and in `~/Documents/Claude/.secrets/app-pass/`. **Never written into these docs, the repo, or any `NEXT_PUBLIC_*` var** (corpus standard rule 6 + the two prior exposure incidents). |
| **Persistence (v1)** | Server-side: every benchmark run pushed from the Mac (full result JSON), plus a per-demo run counter, plus every live playground invocation (prompt hash, quant level, timings — **not** the prompt text, see below). Client-side only: the user's in-progress prompt text and chart filter state. |
| **Privacy** | Playground prompt **text is not stored** — only a SHA-256 hash, token counts and timings. Rationale: the site is password-gated but shared, and storing arbitrary prompt text creates an obligation nobody wants for a teaching demo. |
| **Roles** | Exactly one role: whoever holds the gate credential. No user accounts, no per-user state, no admin panel. |
| **Seed users** | None. ⚠️ The single shared gate credential is demo-grade by design — it is a showcase gate, not a security boundary. |
| **Business logic placement** | All inference server-side (on the Mac). All charting client-side from JSON the backend serves. The benchmark harness is **Mac-side** and is the only thing that ever talks to Ollama's generate API directly for measurement. |
| **Frontend routing** | Next.js App Router, 3 routes, kebab-case: `/`, `/benchmark`, `/playground`. Owner chose the 3-page IA 2026-09-06 over the 4-page DSA-sibling layout and the single-page option. |
| **Model + quant ladder** | **Llama 3.2 1B Instruct at exactly three levels: `q2_K`, `q4_K_M`, `q8_0`** — literally as `llm-quant-benchmark-spec.md` specifies. Owner declined the fp16 baseline and the 6-rung ladder 2026-09-06. All three tags verified to exist on the live Ollama registry 2026-09-06 (0.58 / 0.81 / 1.32 GB, **2.71 GB total**). |
| **Reference constants** | The three quant tags, the three prompts, and the repeat count (3) live in `prompts.json` + a `bench_config.json` on the Mac — not in code, not in the DB. Changing the ladder is a config edit plus a re-run, never a code change. |
| **Content** | Hardcoded in the frontend as TypeScript constants (the brief text, the concept inventory, the glossary). No CMS. Rationale: the teaching copy changes rarely and is version-controlled prose; a CMS would be pure overhead for three pages. |
| **Domain** | **`llmv.utmcs.online`** — ⚠️ spelling confirmed with owner. `utmcs.online` is on **GoDaddy** (verified 2026-09-06: present in the 17-domain account, currently **Parked**, no `llmv` and no `dsa` record exists). New A record `llmv` → `187.127.216.146`. Cert via certbot, email `ai@gaiada.com` (fleet norm). |
| **Email** | **None.** No outbound mail, no forms, no contact path. Nothing to configure. |
| **Assets** | No images or video in v1. Charts are drawn client-side from JSON. Any future static asset goes in `frontend/public/`. |
| **Git** | Repo on **kerry at `/srv/utmcs/llmv` = source of truth**. Remote: **`github.com/azlanabas/utm-llmv`** (personal account — owner chose this over `gaiadabali` and `giteai.online` on 2026-09-06, this being coursework rather than agency work). Commit author **Azlan `<azlan@net1io.com>`** — the identity bound to the azlanabas account. Push only when asked. |
| **CI/CD** | **None in v1.** Deploys are manual on-server rebuilds (`handover.md` §3). The fleet's Actions+poller model is overkill for a single-owner teaching app and adds a moving part with no payoff here. |
| **Brief** | `llm-quant-benchmark-spec.md` is the seed brief for the benchmark half. For everything else — the IA, the playground, the split-brain design — **these docs are the spec.** |

### Reversed / superseded decisions

| Date | Was | Now | Why |
|---|---|---|---|
| 2026-09-06 | "Push-only, no live inference" (owner's first answer) | **Hybrid** (stored results + live proxy) | The same answer set also chose scope 3, which requires a live playground. Owner resolved the conflict in favour of hybrid. |

### ⏳ Still pending — actions, not decisions

| # | Action | Owner | Blocks |
|---|---|---|---|
| 1 | **Approve the Ollama bind change on the Mac.** Ollama currently listens on `127.0.0.1:11434` only (verified 2026-09-06), so kerry cannot reach it. Needs `OLLAMA_HOST=100.69.208.5:11434` in `~/Library/LaunchAgents/homebrew.mxcl.ollama.plist` — the **Tailscale interface only**, deliberately not `0.0.0.0` (which would also expose it to whatever LAN/café wifi the Mac is on). | Azlan | Playground only |
| 2 | Create the `llmv` A record on GoDaddy → `187.127.216.146`. Doable via the `gd_pat_` token already in `.secrets/tokens/`. | Claude, on approval | Phase 7 |
| 3 | Pull the three model tags on the Mac (2.71 GB) — `ollama list` shows **zero models** today (verified 2026-09-06). | Claude, on approval | Phase 2 |
| 4 | Decide whether `/srv/utmcs/dsa` (the sibling, currently mid-build: backend compiled, **`frontend/` empty**, no PM2 entry, no systemd unit, no DNS — all verified 2026-09-06) gets finished before, after, or independently of LLMV. **Out of scope for this corpus.** | Azlan | Nothing here |

---

## 3. Verified environment (measured live 2026-09-06)

Everything in this section was produced by a command run this session against that exact host.
Nothing here is carried over from memory or other hosts.

### 3.1 The Mac — inference host

| Property | Value |
|---|---|
| Chip | Apple **M4** |
| RAM | **16 GB** unified |
| Cores | **10 CPU** / **8 GPU** ⚠️ (the seed spec said "10-core GPU" — it is 8) |
| Disk free | **110 GB** |
| Ollama | **v0.32.3**, via Homebrew, managed by launchd (`homebrew.mxcl.ollama.plist`, `brew services` = started) |
| Ollama bind | **`127.0.0.1:11434` only** — `OLLAMA_HOST` unset ⇒ blocks kerry (pending action 1) |
| Models pulled | **none** |
| Python | 3.14.6 and 3.11.16 via Homebrew (system `python3` is 3.9.6 — do not use it) |
| Node / Cargo | v26.5.0 / 1.96.0 |
| Tailscale | **`100.69.208.5`** (`mac-local`) |

### 3.2 hostinger-kerry — web host

| Property | Value |
|---|---|
| Hostname | `srv1878264` |
| Public IP | `187.127.216.146` |
| Tailscale | **`100.97.211.48`** (`srv1878264`), direct connection to `mac-local` confirmed active |
| Disk | 193 GB total, **125 GB free** (36% used) |
| Node / npm | **v20.20.2** / 10.8.2 |
| Rust | rustup at `/root/.cargo/bin` (⚠️ **not on the default non-login PATH** — service units must use the absolute path) |
| `sqlite3` CLI | **not installed** |
| PM2 | 17 apps online, plus `pm2-logrotate` |
| nginx | 56 sites enabled; htpasswd convention `/etc/nginx/.htpasswd-<name>` |
| **Ports chosen** | **3092** (frontend) and **8092** (backend) — both verified **FREE**. ⚠️ Do **not** reuse 3091/8091: they are live (`next-server` and `uvicorn` respectively). |

### 3.3 Domain

| Property | Value |
|---|---|
| Registrar / DNS | **GoDaddy** — `utmcs.online` present in the account (17 domains) |
| Current state | **Parked** (`@` A → "Parked"), `www` CNAME → `@`, DMARC TXT present |
| `llmv.utmcs.online` | **does not resolve** — no record exists |
| `dsa.utmcs.online` | **does not resolve** — no record exists |

---

## 4. House rules for this project

1. **kerry never runs a model.** If you find yourself installing Ollama, llama.cpp, or a GGUF
   on kerry, stop — you have misread the architecture.
2. **Nothing is "done" until it is verified live** — a curl against the real URL, not a file
   that looks right.
3. **The gate password never appears** in the repo, in these docs, in a client bundle, or on
   the login page. It lives in `/etc/nginx/.htpasswd-llmv` and `.secrets/app-pass/`.
4. **Max 500 lines per code file** (global rule 5) — split modules rather than growing one.
5. **The Mac is not always on.** Every code path that touches the Mac must have a defined
   behaviour when it is asleep. "It throws" is not a defined behaviour.
6. The benchmark numbers are **measurements**, not marketing. If a run is noisy or an outlier,
   the report says so rather than smoothing it away.

---

**Next phase:** `/scaffold utm-llmv` — see `todo.md` for the phase breakdown.

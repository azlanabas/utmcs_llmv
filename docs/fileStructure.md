# File structure — UTM-LLMV

**Compiled:** 2026-09-06. Current tree = *verified*. Target tree = *decided*.

---

## 1. Current state on kerry — AS BUILT (verified 2026-09-06)

```
/srv/utmcs/                     ⚠️ renamed from /srv/utm by the owner 2026-09-06
├── dsa/                        sibling app — LIVE at dsa.utmcs.online (:8095/:3091)
└── llmv/                       THIS PROJECT — LIVE at llmv.utmcs.online
    ├── .git/                   initialised, branch main (no remote yet)
    ├── .gitignore
    ├── docs/                   this corpus, 12 files
    ├── backend/                Axum, compiled release binary, data.db (27 measurements)
    ├── frontend/               Next.js 14.2.35, built, node_modules (108 pkgs)
    └── bench/                  (empty on kerry — the harness runs on the Mac)
```

Also live: systemd `llmv-backend`, PM2 `llmv-frontend`, nginx vhost
`llmv.utmcs.online`, LE cert to 2026-12-05, `/etc/nginx/.htpasswd-llmv`.

## 2. Current state on the Mac (verified 2026-09-06)

```
~/Documents/Claude/project_04/UTM/          ← all UTM work, one folder per project
├── LLMV/                                   ← this project
│   ├── llm-quant-benchmark-spec.md         ← the seed brief (5.1 KB, 2026-09-03)
│   └── docs/                               ← local mirror of this corpus (12 files)
├── dsa/                                    ← sibling app (see §9 of architecture.md)
├── bankIslam/  erp-mvp/  faceid/  introduction/  koop/  tcs/
```

⚠️ **Renamed and relocated 2026-09-06**, on owner instruction: this project was
`project_04/LLM_Showcase/` and is now `project_04/UTM/LLMV/`, matching the
`UTM/<project>/` convention the other UTM folders already use. Any older doc, memory or
transcript naming `LLM_Showcase` means this folder.

Ollama: installed, running, **all 3 models pulled 2026-09-06** (580 MB + 807 MB + 1.3 GB = 2.5 GB on disk).
⚠️ Still bound to `127.0.0.1` — the bind change is deferred (README §4 pending 1).

---

## 3. Target tree — kerry `/srv/utmcs/llmv`

```
/srv/utmcs/llmv/
├── .gitignore
├── README.md                       → points at docs/
├── docs/                           ← this corpus (11 files)
│
├── backend/                        Rust / Axum — systemd `llmv-backend`, :8092
│   ├── Cargo.toml
│   ├── Cargo.lock
│   ├── .env                        ⚠️ 0600 — INGEST_TOKEN, OLLAMA_URL, DATABASE_URL
│   ├── data.db                     gitignored, created at runtime (WAL: +.db-wal/.db-shm)
│   ├── migrations/
│   │   └── 0001_init.sql
│   ├── src/
│   │   ├── main.rs                 router + listener + startup probe
│   │   ├── config.rs               env → Config struct, fails loudly if unset
│   │   ├── state.rs                AppState { db, cfg, http }
│   │   ├── db.rs                   pool, migrations, WAL pragmas
│   │   ├── models.rs               serde types shared by ingest + read paths
│   │   ├── routes/
│   │   │   ├── mod.rs
│   │   │   ├── health.rs           GET /api/health
│   │   │   ├── ingest.rs           POST /api/ingest       (token-guarded)
│   │   │   ├── runs.rs             GET  /api/runs, /api/runs/:id, /api/runs/latest
│   │   │   ├── stats.rs            GET  /api/stats
│   │   │   └── live.rs             GET  /api/live/health, POST /api/live/generate (SSE)
│   │   └── ollama.rs               Tailscale client: probe + streaming generate
│   └── tests/
│       └── api.rs
│
├── frontend/                       Next.js — PM2 `llmv-frontend`, :3092
│   ├── package.json
│   ├── next.config.js
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── .env.local                  NEXT_PUBLIC_API_BASE=/api
│   ├── app/
│   │   ├── layout.tsx              shell, nav, theme tokens
│   │   ├── globals.css
│   │   ├── page.tsx                / — brief + concept inventory
│   │   ├── benchmark/page.tsx      /benchmark — charts + tables + run history
│   │   └── playground/page.tsx     /playground — live prompt → stream
│   ├── components/
│   │   ├── Nav.tsx
│   │   ├── ConceptCard.tsx
│   │   ├── GlossaryList.tsx
│   │   ├── MacStatusBadge.tsx      online / degraded / offline
│   │   ├── QuantPicker.tsx
│   │   ├── StreamView.tsx          token stream + live TTFT/tok-s readout
│   │   ├── RunPicker.tsx           choose which stored run to view
│   │   └── charts/
│   │       ├── TokensPerSecChart.tsx
│   │       ├── TtftChart.tsx
│   │       ├── MemoryChart.tsx
│   │       └── SizeVsSpeedChart.tsx
│   ├── lib/
│   │   ├── api.ts                  typed fetch wrapper
│   │   ├── format.ts               ms / tokens-per-sec / bytes formatting
│   │   └── content.ts              ⚠️ ALL teaching copy lives here (no CMS)
│   └── public/
│
└── bench/                          ⚠️ RUNS ON THE MAC, not on kerry
    ├── pyproject.toml              requires-python >= 3.11
    ├── bench_config.json           quant tags, repeats, host, timeouts
    ├── prompts.json                3 fixed prompts: short / medium / long
    ├── run_benchmark.py            drives Ollama, times, samples memory
    ├── push_results.py             POST → /api/ingest
    ├── sample_memory.py            `ollama ps` + RSS sampling helper
    └── results/                    local raw archive, gitignored
        └── <iso8601>.json
```

**Note on `bench/`:** it lives in the same repo for version control, but it **executes on the
Mac**. kerry never runs it and needs no Python. Keeping it in-repo means the harness that
produced a number is versioned alongside the number.

---

## 4. Files outside the repo

| Path | Host | Purpose | Mode |
|---|---|---|---|
| `/etc/nginx/sites-available/llmv.utmcs.online` | kerry | vhost (symlinked into `sites-enabled`) | 0644 |
| `/etc/nginx/.htpasswd-llmv` | kerry | gate credential, bcrypt | 0640 `root:www-data` |
| `/etc/systemd/system/llmv-backend.service` | kerry | backend unit | 0644 |
| `/etc/letsencrypt/live/llmv.utmcs.online/` | kerry | TLS cert | certbot-managed |
| `~/Library/LaunchAgents/homebrew.mxcl.ollama.plist` | Mac | Ollama bind (⏳ pending action 1) | 0644 |
| `~/Documents/Claude/.secrets/app-pass/llmv.md` | Mac | gate password + ingest token record | 0600 |

---

## 5. `.gitignore`

```gitignore
# backend
backend/target/
backend/data.db
backend/data.db-wal
backend/data.db-shm
backend/.env

# frontend
frontend/node_modules/
frontend/.next/
frontend/.env.local

# bench (Mac-side)
bench/results/
bench/__pycache__/
bench/.venv/

# misc
.DS_Store
```

⚠️ `backend/.env` and `frontend/.env.local` are ignored **and** must never be committed
retroactively — they carry the ingest token. Check with `git status` before any `add -A`
(workspace lesson: the blanket-ignore era is over, `??` entries are real).

---

## 6. Size expectations

| Item | Expected | Note |
|---|---|---|
| 3 model files | **2.71 GB** | on the **Mac** only — verified from registry manifests 2026-09-06 |
| `backend/target/` | ~1–2 GB | build artifacts on kerry; gitignored |
| `frontend/node_modules/` | ~400 MB | on kerry; gitignored |
| `data.db` | < 10 MB for years | a benchmark run is a few KB of JSON |
| Repo (tracked) | < 1 MB | source + docs only |

kerry has **125 GB free** (verified 2026-09-06) — no disk concern. The Mac has 110 GB free
against a 2.71 GB pull — no concern.

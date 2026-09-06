# Sitemap & API inventory — UTM-LLMV

**Compiled:** 2026-09-06. *Decided* (README §2, Frontend routing).
Three pages. Everything behind nginx basic auth — including the API.

---

## 1. Page inventory

| # | Route | Title | Purpose | Needs the Mac awake? |
|---|---|---|---|:-:|
| 1 | `/` | **What this is** | The brief — What / How / Why — plus the concept inventory and glossary. The teaching surface. | ❌ no |
| 2 | `/benchmark` | **Quantization benchmark** | Charts + tables from stored runs; run-history picker; methodology notes. | ❌ no |
| 3 | `/playground` | **Run it live** | Type a prompt, pick a quant level, watch it stream from the Mac with live timings. | ✅ **yes** |

Nav is a single persistent bar with these three links plus the `MacStatusBadge` on the right.
The badge is visible on every page (it is the honest answer to "is his laptop on right now?"),
but only `/playground` is gated by it.

---

## 2. Page specs

### 2.1 `/` — What this is

Straight from `llm-quant-benchmark-spec.md`'s report-brief requirement, rendered as a page
rather than a markdown header.

| Section | Content |
|---|---|
| Hero | One sentence: a real 1-billion-parameter model, running on a laptop, squeezed three ways. Plus the live `MacStatusBadge`. |
| **What** | One paragraph: a local LLM quantization inference benchmark — Llama 3.2 1B at 2-bit, 4-bit and 8-bit via Ollama, entirely on-device on an Apple M4. |
| **How** | One paragraph: same model, same 3 prompts (short / medium / long), run at each quant level, 3 repeats each, measuring time-to-first-token, tokens/sec, memory and disk size. |
| **Why** | One paragraph: going one layer below a ready-made model repo into the inference and serving machinery itself — quantization tradeoffs, KV cache and memory behaviour, throughput — as groundwork before bigger AI infrastructure work. |
| **Concept inventory** | Card grid, one card per term, each with a two-line plain-English definition: LLM · transformer · inference · quantization (2/4/8-bit) · KV cache · context window · tokens/sec · time-to-first-token · attention · model serving · GGUF · Ollama. |
| **The setup** | Small table of the *verified* hardware: Apple M4, 16 GB unified, 10 CPU / 8 GPU cores. |
| Footer CTA | Two buttons → `/benchmark` and `/playground`. |

⚠️ The concept cards are the "AI Base Knowledge" deliverable. They carry the pedagogical
weight of the site and should be written for someone who has never used an LLM API.

### 2.2 `/benchmark` — Quantization benchmark

| Section | Content |
|---|---|
| Run picker | Dropdown of stored runs by timestamp; defaults to latest. Shows "no runs yet" empty state before the first push. |
| Summary table | One row per quant level: quant · avg tokens/sec · avg TTFT · model size on disk · approx peak memory. Exactly the spec's summary table. |
| Chart: tokens/sec | Grouped bars, quant × prompt length. |
| Chart: TTFT | Grouped bars, quant × prompt length. |
| Chart: memory | Bars, peak resident memory per quant. |
| Chart: size vs speed | Scatter — disk size on x, tokens/sec on y — the tradeoff in one picture. |
| Per-quant detail | Three collapsible tables, one per quant level, all 3 prompts × 3 repeats, raw not averaged. |
| **What I observed** | Azlan's own prose notes on output *quality* differences (the spec's placeholder section). Lives in `lib/content.ts`, edited by hand. |
| Methodology | How each number was measured, what was controlled, and what is noisy. Links to `bench/run_benchmark.py` in the repo. |

### 2.3 `/playground` — Run it live

| State | UI |
|---|---|
| Mac **offline** | Form disabled. Amber panel: "Azlan's Mac is asleep — the model lives there, so live runs are paused. The benchmark results are still available." Button → `/benchmark`. |
| Mac **degraded** | Form enabled, but the missing quant option disabled with a named reason. |
| Mac **online** | Prompt textarea · quant radio (q2_K / q4_K_M / q8_0) · max-tokens slider (default 256, cap 512) · Run button. |
| Running | Live token stream, with a running readout: TTFT (frozen once the first token lands), elapsed, tokens so far, tokens/sec. |
| Done | Final stat strip + "run again" + "compare this prompt at another quant". |

**Compare mode** — the pedagogically valuable bit: run the *same* prompt at all three quant
levels sequentially and show the three outputs side by side with their timings. This is where
a visitor actually feels what 2-bit costs you.

⚠️ Privacy notice shown under the form: prompts are not stored; only timings and a hash.

---

## 3. API inventory

Base: `https://llmv.utmcs.online/api` → Axum on `127.0.0.1:8092`.
**Every route below sits behind nginx basic auth.** Exceptions: none.

### 3.1 Read paths — served from SQLite, Mac-independent

| Method | Route | Returns |
|---|---|---|
| `GET` | `/api/health` | `{ status, version, db_ok, uptime_s }` — the backend's own health, not the Mac's |
| `GET` | `/api/runs` | list of stored benchmark runs (id, started_at, host, model, quant levels, note) |
| `GET` | `/api/runs/latest` | the newest run, fully expanded |
| `GET` | `/api/runs/:id` | one run, fully expanded (all measurements) |
| `GET` | `/api/stats` | totals: runs stored, live generations served, first/last run timestamps |

### 3.2 Ingest — the Mac pushes here

| Method | Route | Notes |
|---|---|---|
| `POST` | `/api/ingest` | Body = one benchmark document. Requires `X-Ingest-Token`. Returns `{ run_id }`. **401 with no body on a bad token.** Append-only — never updates an existing run. |

### 3.3 Live paths — require the Mac

| Method | Route | Notes |
|---|---|---|
| `GET` | `/api/live/health` | `{ mac_online, models[], checked_at }`. 1.5 s probe. Never throws — returns `mac_online: false` on any failure. |
| `POST` | `/api/live/generate` | **SSE stream.** Body `{ prompt, quant, max_tokens }`. Events: `meta` → `token`* → `done` \| `error`. Hard 60 s cap. Logs metadata only. |

### 3.4 Deliberately absent

No `DELETE`, no `PUT`, no user routes, no admin routes. Runs are immutable; there is no
account system to serve. If you find yourself adding one, re-read README §2.

---

## 4. URL conventions

- kebab-case, no trailing slashes, no locale prefix (English only).
- `www.llmv.utmcs.online` is **not** configured — one hostname, no redirect to maintain.
- No sitemap.xml and no robots indexing: the site is password-gated, so search engines can
  neither reach nor usefully index it. A `robots.txt` disallowing everything is added anyway
  as a belt-and-braces measure.

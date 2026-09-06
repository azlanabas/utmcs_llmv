# Frontend design — UTM-LLMV

**Compiled:** 2026-09-06. Stack *decided* (README §2); component detail is *draft* until built.
**Next.js App Router + TypeScript + Tailwind**, PM2 `llmv-frontend`, port **3092** on kerry.
Tokens and palette: `color-scheme.md` (validated 2026-09-06 — do not invent colours here).

---

## 1. Principles

1. **The page is a readout, not a pitch.** Numbers get the visual weight; prose supports them.
2. **Never render a number the backend didn't measure.** No client-side estimation, no
   smoothing, no "approximately". If a value is missing it renders as `—`, not as zero.
3. **Always answer "is the Mac on?"** The status badge is in the nav on every page, because
   the honest state of the system is part of what the site teaches.
4. **Two classes of timing, never conflated.** Benchmark numbers (measured locally on the Mac,
   no network) and playground numbers (include the Tailscale hop) are visually and verbally
   distinguished everywhere they appear. See §6 — this is the easiest way for this site to
   start lying.
5. Mobile verified at **390px and 360px** before any page is called done.

---

## 2. Shared shell

### `app/layout.tsx`
- Max width `72rem`, centred, `--surface` background.
- Nav: wordmark **LLMV** · links `What this is` / `Benchmark` / `Playground` ·
  `<MacStatusBadge />` right-aligned.
- Footer: "Measured on an Apple M4 · 16 GB · Llama 3.2 1B" + link to the repo.
- Fonts loaded via `next/font` (self-hosted, no external CDN request).

### `components/MacStatusBadge.tsx`
Polls `GET /api/live/health` on mount and every **30 s**.

| State | Glyph | Label | Token |
|---|---|---|---|
| online | ● | "Mac online" | `--status-good` |
| degraded | ▲ | "Model missing" | `--status-warn` |
| offline | ■ | "Mac asleep" | `--status-off` |
| checking | ◌ | "Checking…" | `--ink-3` |

⚠️ Glyph **and** label always render — never colour alone (`color-scheme.md` §2.3, the
accepted CVD condition). Initial state is `checking`, never an optimistic `online`.

---

## 3. Page: `/` — What this is

Sections in order (content lives in `lib/content.ts`, no CMS):

| # | Section | Component | Notes |
|---|---|---|---|
| 1 | Hero | inline | One sentence + status badge. No image, no gradient. |
| 2 | What / How / Why | `<BriefSection>` ×3 | Three paragraphs, exactly as `llm-quant-benchmark-spec.md` requires of the report brief. |
| 3 | The setup | `<SpecTable>` | Verified hardware: Apple M4 · 16 GB · 10 CPU / 8 GPU cores · Ollama 0.32.3. Marked "measured 2026-09-06". |
| 4 | Concept inventory | `<ConceptCard>` grid | **The "AI Base Knowledge" deliverable.** 12 cards. |
| 5 | Glossary | `<GlossaryList>` | Same 12 terms, one-line definitions, alphabetical, linkable by anchor. |
| 6 | CTA pair | inline | → `/benchmark`, → `/playground`. |

### `<ConceptCard>` — the teaching unit

Each card: term · one-sentence plain-English definition · one line of "where you see it here".

The 12 terms (from the spec's required inventory):
LLM · transformer · inference · quantization (2/4/8-bit) · KV cache · context window ·
tokens/sec · time-to-first-token · attention · model serving · GGUF · Ollama.

⚠️ **Write these for someone who has never called an LLM API.** No term may be defined using
another undefined term from the list. This is the one place on the site where prose quality
matters more than layout.

---

## 4. Page: `/benchmark`

### 4.1 Layout order
1. `<RunPicker>` — run history dropdown, defaults to latest, shows `received_at` and `note`.
2. `<SummaryTable>` — the spec's summary table: quant · avg tokens/sec · avg TTFT · disk size · peak memory.
3. Chart grid (2×2).
4. `<PerQuantDetail>` ×3 — collapsible raw tables, all 27 measurements, unaveraged.
5. `<Observations>` — Azlan's hand-written notes on output *quality*.
6. `<Methodology>` — how each number was taken; links to `bench/run_benchmark.py`.

### 4.2 Charts — forms chosen by job (`dataviz` procedure)

| Chart | Form | Colour job | Why this form |
|---|---|---|---|
| Tokens/sec by quant × prompt | grouped column | **sequential** quant ramp | magnitude comparison across an ordered scale |
| TTFT by quant × prompt | grouped column | sequential | same job |
| Peak memory by quant | column | sequential | single ordered magnitude |
| Size vs speed | scatter, 3 points, direct-labelled | sequential | shows the tradeoff as one shape; 3 points need no legend box |

**Mark rules applied throughout** (`dataviz` §4): thin marks, 4px rounded data-ends anchored
to baseline, 2px surface gap between adjacent bars, recessive grid (`--border`, 1px), axes in
`--ink-2`, values in text tokens **never** in the series colour.

**Mandatory on every chart:**
- Legend present (≥2 series) *and* direct labels where ≤4 series.
- Hover tooltip per mark (`dataviz` §5 — an HTML chart *is* interactive).
- A **"view as table"** toggle — the accessible equivalent, not an afterthought.
- `tabular-nums` on every figure.
- ⚠️ **Never a dual axis.** Tokens/sec and TTFT are different scales → two charts. This is the
  single most common chart mistake and it is banned here.

### 4.3 Empty and partial states

| Condition | Render |
|---|---|
| Zero runs stored | Full-width panel: "No benchmark has been pushed yet." + the exact command to run on the Mac. **Not** an empty chart frame. |
| A repeat failed (`ok = 0`) | Average still shown, with "averaged over 2 of 3 repeats — 1 failed" beneath, and the failure reason in the detail table. |
| A whole quant missing | That series omitted from charts with a named reason; never silently absent. |

⚠️ A chart that quietly averages over fewer samples than it claims is how a benchmark starts
lying (`db_schema.md` §5). The count is always visible when it is short.

---

## 5. Page: `/playground`

### 5.1 Components
- `<QuantPicker>` — three radio cards, each showing the quant, its disk size, and its
  benchmarked avg tokens/sec, coloured with the same ramp as the charts (so the colour means
  the same thing on both pages — non-negotiable: colour follows the entity).
- Prompt `<textarea>` — 4000 char cap, live counter.
- Max-tokens slider — default 256, cap 512 (server enforces independently).
- `<StreamView>` — the token stream plus a live readout strip: TTFT (freezes on first token) ·
  elapsed · tokens · tokens/sec.
- `<CompareMode>` — runs the same prompt at all three quants **sequentially**, three columns
  side by side with their outputs and timings.

### 5.2 SSE handling
`EventSource` is not used (it cannot POST); the client reads the `fetch` response body as a
stream and parses SSE frames manually. Events: `meta` → `token`* → `done` | `error`.

| Event | UI |
|---|---|
| `meta` | start the clock, show the model tag |
| first `token` | **freeze TTFT** — this is the number the page exists to show |
| `token` | append; update tokens + tokens/sec |
| `done` | final stat strip, enable re-run |
| `error` | inline reason (`timeout` / `busy` / `mac_offline`), keep partial output visible |

⚠️ Partial output is **never discarded** on timeout. A truncated generation with an honest
"stopped at 60s" is more informative than an empty box.

### 5.3 Disabled state
When `mac_online` is false the whole form is `disabled` (not merely visually greyed — actually
disabled, so keyboard users can't submit into a void), with the amber panel from
`sitemap.md` §2.3 and a link to `/benchmark`.

### 5.4 Privacy line
Under the form, always visible: *"Prompts aren't stored — only timings and a hash."* This is
a statement `db_schema.md` actually implements; if that ever changes, this line changes first.

---

## 6. The two-timings rule

The single most important correctness detail on this site.

| | Benchmark numbers | Playground numbers |
|---|---|---|
| Measured | on the Mac, locally | in Axum on kerry |
| Includes | model + inference only | + Tailscale hop + nginx + SSE framing |
| Repeats | 3, averaged | 1 |
| Label | "measured" | "indicative" |
| Colour | full quant ramp | quant ramp at 60% opacity |

They **never** appear in the same chart or the same table. Every playground figure carries the
word *indicative* and a tooltip explaining the network hop. Conflating them would make the
benchmark meaningless — which is the whole project.

---

## 7. Accessibility

- Focus ring: 2px `--secondary`, always visible. `outline: none` is banned.
- Charts: legend + direct labels + table toggle ⇒ never colour-alone.
- Live region (`aria-live="polite"`) announces the final stat strip, not every token (which
  would flood a screen reader).
- Status badge: glyph + label + `aria-label`.
- All interactive targets ≥ 44×44px on touch.
- `prefers-reduced-motion`: token stream renders in place with no animated cursor.

---

## 8. Performance notes

- Charts are hand-drawn SVG components — no charting library. Four simple charts do not
  justify a dependency, and hand-drawn SVG makes the mark specs above directly expressible.
- `/` and `/benchmark` are server-rendered from the Axum API at request time. `/playground` is
  a client component (it holds a stream).
- No external network requests from the browser at all: fonts self-hosted, no CDN, no
  analytics, no telemetry.

# Colour scheme — UTM-LLMV

**Compiled:** 2026-09-06. Method per `design_guide/design/design-tokens-ux.md` + the `dataviz`
skill. **Every palette below was validated by running
`dataviz/scripts/validate_palette.js`** on 2026-09-06 — not eyeballed.

---

## 1. Mood

**Instrument panel, not marketing site.** This page reports measurements taken off a real
laptop. The mood is *precise · engineered · quietly technical* — closer to a lab readout or an
oscilloscope than to an AI product launch.

**Refused outright** (owner rule + `design-tokens-ux.md` §1.3): AI purple↔pink gradients,
neon, glow, rainbow ramps, "cyberpunk" accents, grey-on-grey. Anything that would make a
measurement look like a marketing claim.

---

## 2. ACTIVE palette — "Instrument"

### 2.1 Role tokens (light, the shipped mode)

| Role | Token | Hex | Contrast vs surface | Use |
|---|---|---|---|---|
| Surface | `--surface` | `#faf9f7` | — | page background (warm off-white, not clinical `#fff`) |
| Surface raised | `--surface-2` | `#f2f0ec` | — | cards, table stripes |
| Border | `--border` | `#dcd8d1` | — | hairlines, table rules |
| **Primary** (structure) | `--primary` | `#0f3a58` | 11.8:1 | headings, nav, chart axes emphasis |
| **Secondary** (support/links) | `--secondary` | `#2f74a3` | 4.9:1 | links, secondary actions |
| **CTA / action** | `--cta` | `#b5761a` | 3.8:1 (large/UI) | **Run** button — deliberately amber, a *different role* from links (rule §1.2) |
| Text primary | `--ink` | `#1a1d21` | 15.4:1 | body |
| Text secondary | `--ink-2` | `#4a5058` | 7.6:1 | captions, axis labels |
| Text muted | `--ink-3` | `#6b7280` | 4.7:1 | timestamps, hints — still ≥ 4.5:1 |
| Mono / code | `--mono-bg` | `#f2f0ec` | — | code + number blocks |

Body text is `--ink` on `--surface` = **15.4:1**, far above the 4.5:1 hard rule. The lowest
text token, `--ink-3`, is **4.7:1** — passes. No token relies on colour alone.

### 2.2 Quant ramp — SEQUENTIAL, one hue

⚠️ **The quant levels are an ordered scale (2-bit → 4-bit → 8-bit), not identities.** Per the
`dataviz` form heuristic, ordered magnitude takes a **sequential single-hue ramp**, not
categorical hues. More bits = more precision = **darker**. This is the honest encoding and it
is why the three bars are three shades of one blue rather than three different colours.

| Quant | Token | Hex | Meaning |
|---|---|---|---|
| `q2_K` | `--quant-2` | `#6fa8cc` | 2-bit — lightest, least precise |
| `q4_K_M` | `--quant-4` | `#2f74a3` | 4-bit — mid |
| `q8_0` | `--quant-8` | `#0f3a58` | 8-bit — darkest, most precise |

**Validator output, light mode, surface `#faf9f7`, `--ordinal` (2026-09-06):**

```
[PASS] Lightness monotone     steps read light→dark
[PASS] Adjacent ΔL            all gaps >= 0.06
[PASS] Light-end contrast     #6fa8cc at 2.45:1 vs surface
[PASS] Single hue             hue spread 6°
→ ALL CHECKS PASS
```

Two earlier candidates were **rejected by the validator**, recorded so nobody re-proposes them:

| Rejected ramp | Why |
|---|---|
| `#a8cfe8,#4a90c2,#16466b` | FAIL — light end 1.56:1 vs surface, below the 2:1 floor |
| `#86bcd8,#3d84ac,#14425f` | FAIL — light end 1.96:1, still below 2:1 |

### 2.3 Status palette — RESERVED

Used **only** for the Mac's state. Never reused as a chart series (`dataviz` non-negotiable).

| State | Token | Hex | Icon + label (mandatory) |
|---|---|---|---|
| online | `--status-good` | `#2f7d4f` | ● "Mac online" |
| degraded | `--status-warn` | `#b5761a` | ▲ "Model missing" |
| offline | `--status-off` | `#8c2f2f` | ■ "Mac asleep" |

**Validator output, categorical, `--pairs all` (2026-09-06):**

```
[PASS] Lightness band      all 3 inside L 0.43–0.77
[PASS] Chroma floor        all 3 >= 0.1
[WARN] CVD separation      worst #b5761a↔#2f7d4f ΔE 6.7 (protan) · tritan 18.0
[PASS] Normal-vision floor worst ΔE 18.0 (normal)
[PASS] Contrast vs surface all 3 >= 3:1
```

⚠️ **The WARN is accepted under a stated condition, not dismissed.** ΔE 6.7 sits in the 6–8
floor band, which the skill permits *only with secondary encoding*. These three always ship
with **both a distinct glyph and a text label** (see table above), so identity never rests on
colour. If a future change strips the label or the icon, this palette becomes non-compliant
and must be re-stepped.

Note `--status-warn` and `--cta` are the same amber by design — "needs your attention" and
"this is the action" are the same signal here. They never appear adjacent as data marks.

---

## 3. RECORDED ALTERNATE — dark mode (validated, not shipped in v1)

Dark mode is **deferred from v1** (scope, not oversight). The ramp below is already validated
so enabling it later is a token swap with no re-derivation.

| Token | Dark value |
|---|---|
| `--surface` | `#12161c` |
| `--surface-2` | `#1a1f27` |
| `--ink` | `#e8eaed` |
| `--quant-2` | `#9ccbe8` |
| `--quant-4` | `#4e93c0` |
| `--quant-8` | `#2a5f85` |

**Validator output, dark mode, surface `#12161c`, `--ordinal` (2026-09-06):**

```
[PASS] Lightness monotone · [PASS] Adjacent ΔL · [PASS] Light-end contrast 2.66:1 · [PASS] Single hue 7°
→ ALL CHECKS PASS
```

⚠️ Note the ramp is **re-stepped, not inverted.** An automatic flip of the light ramp would
put `#0f3a58` (contrast 1.3:1) on a near-black surface and vanish.

### How to switch to dark
1. Edit `frontend/app/globals.css` — the `:root` block is the only place these values appear.
2. Re-run the validator against `#12161c` before shipping any further colour change.
3. No markup or component changes. That is the point of one master token set.

---

## 4. Rejected palettes (recorded so they aren't re-proposed)

| Palette | Why rejected |
|---|---|
| Violet→magenta "AI" gradient | Owner rule: no AI purple/pink. Also reads as a product launch, not a measurement. |
| Three categorical hues (blue / orange / green) for the quants | Wrong *job*. Quant levels are ordered, so categorical colour discards the ordering the reader needs and implies the three are peers. |
| Terminal green on black | Costume, not clarity. Fails contrast on secondary text and dates the page. |

---

## 5. Typography

Two families, per `design-tokens-ux.md` §3:

| Role | Family | Notes |
|---|---|---|
| UI / body | **Public Sans** | fleet favourite |
| Numbers / code | **IBM Plex Mono** | ⚠️ `font-variant-numeric: tabular-nums` on **every** measurement column and the live token counter — otherwise digits jitter as the stream updates and the readout looks broken |

---

## 6. Pre-delivery checklist

- [ ] Body text ≥ 4.5:1 (computed: 15.4:1) · muted ≥ 4.5:1 (computed: 4.7:1)
- [ ] CTA (`#b5761a`) visually distinct from links (`#2f74a3`) — different hue *and* role
- [ ] No purple/pink gradients, neon, or rainbow
- [ ] One token set; no stray hexes outside `globals.css`
- [ ] Hover/focus states keep contrast (focus ring `--secondary`, 2px, never `outline: none`)
- [ ] Status colours always paired with icon **and** label
- [ ] Charts: sequential ramp for quants, `tnum` on all figures, legend present, table view available
- [ ] Mobile clean at **390px and 360px**
- [ ] Favicon present; `<title>` set per page
- [ ] Validator re-run after any colour change

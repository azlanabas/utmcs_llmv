# User guide — UTM-LLMV

**Compiled:** 2026-09-06. ⚠️ Written against the *designed* system; the site does not exist
yet. Reviewed and corrected to as-built in Phase 7.

Written for two audiences: **visitors** (someone Azlan shares the link with) and **the admin**
(Azlan, or whoever runs the benchmarks).

---

# Part 1 — For visitors

## 1.1 What this site is, in plain terms

Large language models are usually something you rent from a company over the internet. This
site is the opposite: a real language model — Llama 3.2, with a billion parameters — is
running on a laptop, and this site lets you watch what happens when you shrink it.

"Shrinking" is called **quantization**. A model stores millions of numbers; you can store each
one precisely (which is big and accurate) or roughly (which is small and fast, but the model
gets a bit dumber). This site runs the *same* model, squeezed three different ways, and shows
you exactly what you gain and what you lose.

The three squeezes:

| Name | Plain meaning | File size |
|---|---|---|
| **2-bit** (`q2_K`) | squeezed hardest — smallest and fastest, most quality lost | 0.58 GB |
| **4-bit** (`q4_K_M`) | the usual compromise most people actually run | 0.81 GB |
| **8-bit** (`q8_0`) | barely squeezed — closest to the original, biggest and slowest | 1.32 GB |

## 1.2 Getting in

The site is password-protected. Your browser will ask for a username and password the first
time — **Azlan provides these**; they are not published anywhere on the site.

If you get a login box you can't get past, ask Azlan. There is no "forgot password" and no
self-signup — it is one shared credential for people he has shared the link with.

## 1.3 The three pages

| Page | What you'll find |
|---|---|
| **What this is** | The plain-English explanation, plus a card for every technical term used anywhere on the site. Start here if any of the jargon is unfamiliar. |
| **Benchmark** | The measurements. Charts and tables showing speed, responsiveness, and memory for each of the three squeezes. |
| **Playground** | Type your own prompt and watch the model answer, live, from the laptop. |

## 1.4 Why the site sometimes says "Mac asleep"

**The model lives on Azlan's laptop, not on a server.** That is the whole point — you are
watching real hardware, not a cloud service.

So when the laptop is closed or asleep, live runs pause. You'll see an amber badge in the
top-right saying **"Mac asleep"**, and the Playground page will be disabled.

**The Benchmark page keeps working regardless** — those results were measured earlier and
stored on the server. Nothing is broken; the laptop is just off.

The badge tells you the truth as of the last 30 seconds:

| Badge | Meaning |
|---|---|
| ● **Mac online** | The laptop is awake — you can run live prompts |
| ▲ **Model missing** | The laptop is awake but one of the three squeezes isn't loaded |
| ■ **Mac asleep** | The laptop is off or unreachable — Benchmark still works |

## 1.5 Reading the numbers

Two numbers matter most, and they measure different things:

- **Time to first token (TTFT)** — how long you wait before the model starts answering. This
  is what "feels" fast or slow.
- **Tokens per second** — how fast the answer streams once it's started. A token is roughly
  three-quarters of a word.

The general shape you should expect: harder squeezing → smaller file, faster output, and
gradually worse answers. The interesting question the site helps you answer is *how much*
worse, and whether the speed is worth it.

⚠️ **Two kinds of timings, don't mix them.** Numbers on the **Benchmark** page were measured
on the laptop itself with nothing in the way — those are the real ones. Numbers on the
**Playground** are labelled *indicative* because they include the trip over the internet to
the laptop and back. The site keeps them visually separate on purpose.

## 1.6 Using the Playground

1. Check the badge says **Mac online**.
2. Type a prompt.
3. Pick a squeeze level (2-bit / 4-bit / 8-bit).
4. Press **Run** and watch the answer arrive word by word, with the timings updating live.
5. Try **Compare** to run the *same* prompt at all three levels, one after another, and see
   the three answers side by side. This is the most instructive thing on the site.

**Your prompts are not saved.** Only the timings and an anonymous fingerprint (a hash) are
recorded — the text you type is never stored.

Limits: 4,000 characters per prompt, 512 tokens of output, 60 seconds per run. One run at a
time — there's only one laptop.

---

# Part 2 — For the admin

## 2.1 Logins

| What | Credential |
|---|---|
| Site gate | Username **`roger`**. Password is stored in `/etc/nginx/.htpasswd-llmv` on kerry (hashed) and in `~/Documents/Claude/.secrets/app-pass/llmv.md`. |
| Ingest token | In `backend/.env` on kerry and `.secrets/app-pass/llmv.md`. |

⚠️ **There is no application login.** No admin panel, no user accounts, no roles. The fleet
standard admin credential (`web@gaiada.com`) is deliberately **not** used here because there
is no username/password form in the app to seed it into — the only gate is nginx basic auth.

⚠️ **Never display the gate credential on the site**, in a "login help" card, in a hint, or in
any `NEXT_PUBLIC_*` variable. Two prior incidents on this fleet came from exactly that.

## 2.2 Publishing a new benchmark

This is the only routine admin task.

```bash
# On the Mac
cd ~/…/utmcs_llmv/bench
/opt/homebrew/bin/python3 run_benchmark.py     # takes several minutes
/opt/homebrew/bin/python3 push_results.py      # prints the new run_id
```

Then reload https://llmv.utmcs.online/benchmark — the new run appears in the picker and
becomes the default. **Old runs are never overwritten**, so the history is a real record.

## 2.3 Keeping the Playground working

The Playground only works when:
1. The Mac is awake, **and**
2. Ollama is bound to the Tailscale address (`100.69.208.5:11434`), **and**
3. Tailscale is connected on both ends.

Condition 2 is the fragile one — a Homebrew upgrade of Ollama can reset the bind back to
`127.0.0.1`, which silently kills live runs while everything else looks fine. Check with, from
**kerry**:

```bash
curl -s --max-time 3 http://100.69.208.5:11434/api/tags
```

⚠️ Run that **from kerry**, not from the Mac. Testing the Mac's own loopback will succeed even
when the Tailscale binding is broken, which is exactly the failure you're looking for.

## 2.4 Editing the teaching content

All prose — the What/How/Why paragraphs, the 12 concept cards, the glossary, the "What I
observed" notes — lives in one file:

```
/srv/utmcs/llmv/frontend/lib/content.ts
```

There is **no CMS**. Edit that file, then rebuild the frontend (`handover.md` §3.3). This was a
deliberate choice: three pages of rarely-changing prose don't justify a CMS.

The **"What I observed"** section on the Benchmark page is meant to be Azlan's own writing on
how the output *quality* differed between the three squeezes — the one thing the automated
benchmark cannot measure.

## 2.5 What to do when something breaks

Full troubleshooting table: `handover.md` §4. The three most likely:

| Symptom | Cause |
|---|---|
| "Mac asleep" while the Mac is awake | Ollama bind reset to localhost, or Tailscale down |
| Answer appears all at once instead of streaming | nginx `proxy_buffering off` lost on `/api/live/` |
| Site returns 502 | Backend (systemd) or frontend (PM2) is down |

## 2.6 What this site is not

Recorded plainly so expectations stay accurate:

- **Not a security boundary.** One shared password, no rotation, no rate limiting. It keeps
  the site out of search engines and away from strangers; it is not hardened access control.
- **Not high-availability.** Live inference depends on a laptop being awake.
- **Not a general LLM benchmark.** It measures one 1B model on one M4 Mac via Ollama. The
  numbers are true for that setup and should not be generalised to other hardware or models.
- **Not a chat product.** No conversation history, no memory between runs, no accounts.

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { getLiveHealth, QUANTS, type QuantKey } from '@/lib/api'

const COLOR: Record<string, string> = {
  q2_K: 'var(--quant-2)', q4_K_M: 'var(--quant-4)', q8_0: 'var(--quant-8)',
}
const REQUIRED: Record<QuantKey, string> = {
  q2_K: 'llama3.2:1b-instruct-q2_K',
  q4_K_M: 'llama3.2:1b-instruct-q4_K_M',
  q8_0: 'llama3.2:1b-instruct-q8_0',
}

interface Result {
  text: string
  ttft: number | null
  total: number | null
  tokens: number
  tps: number | null
  error: string | null
  running: boolean
}

const blank = (): Result => ({
  text: '', ttft: null, total: null, tokens: 0, tps: null, error: null, running: false,
})

export default function Playground() {
  const [online, setOnline] = useState<boolean | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [prompt, setPrompt] = useState('Explain what quantization does to a language model, in three sentences.')
  const [quant, setQuant] = useState<QuantKey>('q4_K_M')
  const [maxTokens, setMaxTokens] = useState(256)
  const [results, setResults] = useState<Record<string, Result>>({})
  const [busy, setBusy] = useState(false)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    let alive = true
    const check = async () => {
      const h = await getLiveHealth()
      if (!alive) return
      setOnline(h.mac_online)
      setModels(h.models)
    }
    check()
    const t = setInterval(check, 30_000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const runOne = useCallback(async (q: QuantKey) => {
    setResults((r) => ({ ...r, [q]: { ...blank(), running: true } }))
    const ctl = new AbortController()
    abort.current = ctl
    const t0 = performance.now()

    try {
      const res = await fetch('/api/live/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, quant: q, max_tokens: maxTokens }),
        signal: ctl.signal,
      })
      if (!res.body) throw new Error('no stream')

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''

      // Manual SSE parsing — EventSource cannot POST.
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const frames = buf.split('\n\n')
        buf = frames.pop() ?? ''

        for (const frame of frames) {
          let ev = 'message'
          let data = ''
          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) ev = line.slice(6).trim()
            else if (line.startsWith('data:')) data += line.slice(5).trim()
          }
          if (!data) continue
          let p: any
          try { p = JSON.parse(data) } catch { continue }

          if (ev === 'token') {
            setResults((r) => {
              const cur = r[q] ?? blank()
              return {
                ...r,
                [q]: {
                  ...cur,
                  text: cur.text + p.t,
                  tokens: cur.tokens + 1,
                  // TTFT freezes at the first token — the number this page exists for.
                  ttft: cur.ttft ?? performance.now() - t0,
                  total: performance.now() - t0,
                },
              }
            })
          } else if (ev === 'done') {
            setResults((r) => ({
              ...r,
              [q]: {
                ...(r[q] ?? blank()),
                ttft: p.ttft_ms ?? r[q]?.ttft ?? null,
                total: p.total_ms,
                tokens: p.completion_tokens ?? r[q]?.tokens ?? 0,
                tps: p.tokens_per_sec,
                running: false,
              },
            }))
          } else if (ev === 'error') {
            setResults((r) => ({
              ...r,
              [q]: {
                ...(r[q] ?? blank()),
                error: p.detail || p.reason,
                running: false,
              },
            }))
          }
        }
      }
    } catch (e: any) {
      setResults((r) => ({
        ...r,
        [q]: { ...(r[q] ?? blank()), error: e?.message ?? 'request failed', running: false },
      }))
    } finally {
      setResults((r) => ({ ...r, [q]: { ...(r[q] ?? blank()), running: false } }))
    }
  }, [prompt, quant, maxTokens])

  const run = async () => {
    setBusy(true); setResults({})
    await runOne(quant)
    setBusy(false)
  }

  // Sequential, never parallel — parallel would thrash the Mac's unified memory
  // and produce meaningless timings (docs/design_doc_backend.md §3).
  const compare = async () => {
    setBusy(true); setResults({})
    for (const q of QUANTS) await runOne(q.key)
    setBusy(false)
  }

  const missing = (q: QuantKey) => online && !models.includes(REQUIRED[q])
  const disabled = online !== true || busy || !prompt.trim()

  return (
    <div className="py-10">
      <h1 className="text-3xl font-semibold text-primary">Run it live</h1>
      <p className="mt-2 max-w-2xl text-ink2">
        Your prompt goes to a laptop and comes back word by word. Watch the wait before
        the first word, then the speed of the words after it.
      </p>

      {online === false && (
        <div className="mt-6 rounded-lg border p-5"
             style={{ borderColor: 'var(--status-warn)', background: 'var(--surface-2)' }}>
          <p className="font-semibold" style={{ color: 'var(--status-warn)' }}>
            ▲ The Mac is asleep
          </p>
          <p className="mt-2 text-ink2">
            The model lives on Azlan&rsquo;s laptop, not on this server — that is the whole
            point of this project. Live runs resume when it wakes up. The measurements are
            stored here and still work.
          </p>
          <Link href="/benchmark"
                className="mt-3 inline-block rounded-md bg-primary px-4 py-2 text-white">
            See the benchmark
          </Link>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr,320px]">
        <div>
          <label htmlFor="prompt" className="block font-medium text-primary">Prompt</label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value.slice(0, 4000))}
            disabled={online !== true}
            rows={5}
            className="mt-2 w-full rounded-lg border border-border bg-surface p-3 font-sans text-ink disabled:opacity-50"
          />
          <p className="mt-1 text-sm text-ink3 tnum">{prompt.length} / 4000 characters</p>
          <p className="mt-2 text-sm text-ink3">
            Prompts aren&rsquo;t stored — only timings and a hash.
          </p>
        </div>

        <div>
          <fieldset disabled={online !== true} className="disabled:opacity-50">
            <legend className="font-medium text-primary">Compression level</legend>
            <div className="mt-2 space-y-2">
              {QUANTS.map((q) => (
                <label key={q.key}
                       className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface2 p-3">
                  <input type="radio" name="quant" value={q.key}
                         checked={quant === q.key}
                         onChange={() => setQuant(q.key)} />
                  <span className="inline-block h-3 w-3 rounded-sm"
                        style={{ background: COLOR[q.key] }} aria-hidden />
                  <span className="font-medium text-ink">{q.label}</span>
                  <span className="font-mono text-sm text-ink3">{q.bits}</span>
                  {missing(q.key) && (
                    <span className="ml-auto text-xs" style={{ color: 'var(--status-warn)' }}>
                      ▲ not loaded
                    </span>
                  )}
                </label>
              ))}
            </div>

            <label htmlFor="mt" className="mt-4 block font-medium text-primary">
              Max tokens: <span className="font-mono tnum">{maxTokens}</span>
            </label>
            <input id="mt" type="range" min={32} max={512} step={32}
                   value={maxTokens} onChange={(e) => setMaxTokens(+e.target.value)}
                   className="mt-1 w-full" />
          </fieldset>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={run} disabled={disabled}
                    className="rounded-md bg-cta px-5 py-2.5 font-medium text-white disabled:opacity-40">
              {busy ? 'Running…' : 'Run'}
            </button>
            <button onClick={compare} disabled={disabled}
                    className="rounded-md border border-cta px-4 py-2.5 font-medium text-cta disabled:opacity-40">
              Compare all three
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 space-y-5">
        {QUANTS.filter((q) => results[q.key]).map((q) => {
          const r = results[q.key]!
          return (
            <div key={q.key} className="rounded-lg border border-border bg-surface2 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-block h-3 w-3 rounded-sm"
                      style={{ background: COLOR[q.key] }} aria-hidden />
                <span className="font-medium text-primary">{q.label}</span>
                <span className="font-mono text-sm text-ink3">{q.bits}</span>
                {r.running && <span className="text-sm text-ink3">generating…</span>}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['time to first token', r.ttft == null ? '—' : `${r.ttft.toFixed(0)} ms`],
                  ['total', r.total == null ? '—' : `${r.total.toFixed(0)} ms`],
                  ['tokens', String(r.tokens)],
                  ['tokens/sec', r.tps == null ? '—' : r.tps.toFixed(1)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="text-xs uppercase tracking-wide text-ink3">{k}</div>
                    <div className="font-mono text-lg font-semibold tnum text-primary"
                         style={{ opacity: 0.85 }}>
                      {v}
                    </div>
                  </div>
                ))}
              </div>

              {r.error && (
                <p className="mt-3 text-sm" style={{ color: 'var(--status-off)' }}>
                  ■ {r.error}
                </p>
              )}

              {r.text && (
                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface p-3 font-sans text-sm text-ink">
                  {r.text}
                </pre>
              )}
            </div>
          )
        })}
      </div>

      {Object.keys(results).length > 0 && (
        <p className="mt-6 max-w-2xl rounded-md border border-border bg-surface2 p-4 text-sm text-ink2">
          <strong className="text-primary">These timings are indicative.</strong> They
          include the network hop from this server to the Mac, so they are slower than
          the model really is. The{' '}
          <Link href="/benchmark" className="text-secondary underline">benchmark</Link>{' '}
          numbers were measured on the Mac itself with nothing in the way — those are the
          real ones.
        </p>
      )}
    </div>
  )
}

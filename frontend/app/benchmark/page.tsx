import Link from 'next/link'
import { getLatestRun, getRuns, QUANTS, type Measurement } from '@/lib/api'
import { gb, mb, ms, tps, when, quantLabel } from '@/lib/format'
import { methodology, observations } from '@/lib/content'
import GroupedBars from '@/components/charts/GroupedBars'
import SizeVsSpeed from '@/components/charts/SizeVsSpeed'

export const dynamic = 'force-dynamic'

const COLOR: Record<string, string> = {
  q2_K: 'var(--quant-2)',
  q4_K_M: 'var(--quant-4)',
  q8_0: 'var(--quant-8)',
}
const PROMPTS = ['short', 'medium', 'long']

export default async function Benchmark() {
  const [latest, list] = await Promise.all([getLatestRun(), getRuns()])

  if (!latest?.run) {
    return (
      <div className="py-16">
        <h1 className="text-3xl font-semibold text-primary">No benchmark yet</h1>
        <p className="mt-3 max-w-2xl text-ink2">
          Nothing has been pushed from the Mac. Run the harness there and publish it:
        </p>
        <pre className="mt-4 max-w-xl overflow-x-auto rounded-lg border border-border bg-surface2 p-4 font-mono text-sm">
{`cd bench
/opt/homebrew/bin/python3 run_benchmark.py
/opt/homebrew/bin/python3 push_results.py`}
        </pre>
      </div>
    )
  }

  const run = latest.run
  const summary = latest.summary ?? []
  const meas = latest.measurements ?? []

  const avg = (rows: Measurement[], f: (m: Measurement) => number | null) => {
    const v = rows.filter((m) => m.ok).map(f).filter((x): x is number => x != null)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  }

  const series = QUANTS.map((q) => ({
    key: q.key, label: `${q.label} (${q.bits})`, color: COLOR[q.key],
  }))

  const byPrompt = (f: (m: Measurement) => number | null) =>
    PROMPTS.map((p) => ({
      label: p,
      values: Object.fromEntries(
        QUANTS.map((q) => [
          q.key,
          avg(meas.filter((m) => m.prompt_key === p && m.quant === q.key), f),
        ]),
      ),
    }))

  const anyFailed = summary.some((s) => s.n_failed > 0)

  return (
    <div className="py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-primary">Quantization benchmark</h1>
          <p className="mt-1 text-ink2 tnum">
            Run {run.id} · {when(run.started_at)} · {run.repeats} repeats per cell
          </p>
          {run.note && <p className="mt-1 text-sm text-ink3">{run.note}</p>}
        </div>
        {list && list.runs.length > 1 && (
          <p className="text-sm text-ink3 tnum">
            {list.runs.length} runs stored — showing the latest
          </p>
        )}
      </div>

      {anyFailed && (
        <p className="mt-4 rounded-md border border-warn/40 bg-surface2 p-3 text-sm"
           style={{ color: 'var(--status-warn)' }}>
          ▲ Some repeats failed. Averages below are computed over successful repeats
          only, and the counts are shown per row.
        </p>
      )}

      {/* Summary table — the spec's required table */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold text-primary">Summary</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm tnum">
            <thead>
              <tr>
                {['Quant', 'avg tokens/sec', 'avg time to first token', 'size on disk', 'memory while loaded', 'repeats'].map((h) => (
                  <th key={h} className="border-b border-border py-2 pr-4 text-left font-medium text-ink2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.quant}>
                  <td className="border-b border-border py-2 pr-4">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-sm"
                            style={{ background: COLOR[s.quant] }} aria-hidden />
                      <span className="font-mono">{s.quant}</span>
                      <span className="text-ink3">{quantLabel(s.quant)}</span>
                    </span>
                  </td>
                  <td className="border-b border-border py-2 pr-4 font-mono font-semibold text-primary">
                    {tps(s.avg_tokens_per_sec)}
                  </td>
                  <td className="border-b border-border py-2 pr-4 font-mono">{ms(s.avg_ttft_ms)}</td>
                  <td className="border-b border-border py-2 pr-4 font-mono">{gb(s.model_size_bytes)}</td>
                  <td className="border-b border-border py-2 pr-4 font-mono">{mb(s.peak_memory_mb)}</td>
                  <td className="border-b border-border py-2 pr-4 font-mono text-ink3">
                    {s.n_ok}/{s.n_ok + s.n_failed}
                    {s.n_failed > 0 && <span style={{ color: 'var(--status-warn)' }}> ▲</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Charts — never a dual axis; two measures, two charts. */}
      <section className="mt-10 grid gap-5 [&>*]:min-w-0 lg:grid-cols-2">
        <GroupedBars
          title="Generation speed by prompt length"
          unit="tokens/sec"
          series={series}
          groups={byPrompt((m) => m.tokens_per_sec)}
          note="Higher is better. Note how little 2-bit buys over 4-bit."
        />
        <GroupedBars
          title="Time to first token by prompt length"
          unit="ms"
          series={series}
          groups={byPrompt((m) => m.ttft_ms)}
          dp={0}
          note="Lower is better. Driven by prompt length far more than by quantization."
        />
        <GroupedBars
          title="Memory while loaded"
          unit="MB"
          series={series}
          groups={[{
            label: 'resident',
            values: Object.fromEntries(
              QUANTS.map((q) => [
                q.key,
                summary.find((s) => s.quant === q.key)?.peak_memory_mb ?? null,
              ]),
            ),
          }]}
          dp={0}
          note="Reported by the serving engine, not the OS process size."
        />
        <SizeVsSpeed
          points={summary
            .filter((s) => s.model_size_bytes && s.avg_tokens_per_sec)
            .map((s) => ({
              label: quantLabel(s.quant),
              x: s.model_size_bytes! / 1e9,
              y: s.avg_tokens_per_sec!,
              color: COLOR[s.quant],
            }))}
        />
      </section>

      {/* Raw measurements */}
      <section className="mt-12">
        <h2 className="text-xl font-semibold text-primary">Every measurement</h2>
        <p className="mt-1 text-sm text-ink2">
          All {meas.length} runs, unaveraged. This is the raw material the tables above
          are computed from.
        </p>
        {QUANTS.map((q) => {
          const rows = meas.filter((m) => m.quant === q.key)
          if (!rows.length) return null
          return (
            <details key={q.key} className="mt-3 rounded-lg border border-border bg-surface2 p-4">
              <summary className="cursor-pointer font-medium text-primary">
                <span className="inline-block h-3 w-3 rounded-sm align-middle"
                      style={{ background: COLOR[q.key] }} aria-hidden />
                <span className="ml-2 font-mono">{q.key}</span>
                <span className="ml-2 text-ink3">— {rows.length} measurements</span>
              </summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full border-collapse text-sm tnum">
                  <thead>
                    <tr>
                      {['prompt', 'repeat', 'ttft', 'total', 'tokens', 'tok/s (wall)', 'tok/s (engine)', 'ok'].map((h) => (
                        <th key={h} className="border-b border-border py-1.5 pr-3 text-left font-medium text-ink2">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((m, i) => (
                      <tr key={i}>
                        <td className="border-b border-border py-1.5 pr-3">{m.prompt_key}</td>
                        <td className="border-b border-border py-1.5 pr-3 font-mono">{m.repeat_index}</td>
                        <td className="border-b border-border py-1.5 pr-3 font-mono">{ms(m.ttft_ms)}</td>
                        <td className="border-b border-border py-1.5 pr-3 font-mono">{ms(m.total_ms)}</td>
                        <td className="border-b border-border py-1.5 pr-3 font-mono">{m.completion_tokens ?? '—'}</td>
                        <td className="border-b border-border py-1.5 pr-3 font-mono">{tps(m.tokens_per_sec)}</td>
                        <td className="border-b border-border py-1.5 pr-3 font-mono">{tps(m.tokens_per_sec_ollama)}</td>
                        <td className="border-b border-border py-1.5 pr-3">
                          {m.ok ? '✓' : <span style={{ color: 'var(--status-off)' }} title={m.error ?? ''}>✗</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )
        })}
      </section>

      <section className="mt-12 max-w-3xl">
        <h2 className="text-xl font-semibold text-primary">What I observed</h2>
        {observations ? (
          <p className="mt-2 whitespace-pre-line text-ink2">{observations}</p>
        ) : (
          <p className="mt-2 rounded-md border border-dashed border-border p-4 text-ink3">
            Not written yet. This section is for a human read on how the output
            <em> quality</em> differed between the three levels — the one thing no timer
            can measure. Edit <code className="font-mono">lib/content.ts</code>.
          </p>
        )}
      </section>

      <section className="mt-12 max-w-3xl">
        <h2 className="text-xl font-semibold text-primary">How these numbers were taken</h2>
        <dl className="mt-3 space-y-4">
          {methodology.map((m) => (
            <div key={m.q}>
              <dt className="font-medium text-primary">{m.q}</dt>
              <dd className="mt-1 text-ink2">{m.a}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 rounded-md border border-border bg-surface2 p-4 text-sm text-ink2">
          <strong className="text-primary">These are the measured numbers.</strong> They were
          taken on the Mac itself with no network in the path. The figures on the{' '}
          <Link href="/playground" className="text-secondary underline">playground</Link>{' '}
          are labelled <em>indicative</em> because they include the network hop from this
          server to the Mac. The two are never mixed.
        </p>
      </section>
    </div>
  )
}

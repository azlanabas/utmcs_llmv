import Link from 'next/link'
import { brief, concepts } from '@/lib/content'
import { getLatestRun, getStats } from '@/lib/api'
import { gb, tps, ms } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const [latest, stats] = await Promise.all([getLatestRun(), getStats()])
  const summary = latest?.summary ?? []
  const host = latest?.run

  return (
    <div className="py-10">
      <h1 className="max-w-3xl text-3xl font-semibold leading-tight text-primary sm:text-4xl">
        A billion-parameter language model, running on a laptop, squeezed three ways.
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-ink2">
        Same model. Same prompts. Three levels of compression. This is what you gain
        and what it costs.
      </p>

      {summary.length > 0 && (
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {summary.map((s) => (
            <div key={s.quant} className="rounded-lg border border-border bg-surface2 p-4">
              <div className="flex items-baseline gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{
                    background:
                      s.quant === 'q2_K' ? 'var(--quant-2)'
                      : s.quant === 'q4_K_M' ? 'var(--quant-4)'
                      : 'var(--quant-8)',
                  }}
                  aria-hidden
                />
                <span className="font-mono text-sm text-ink2">{s.quant}</span>
              </div>
              <div className="mt-2 font-mono text-2xl font-semibold tnum text-primary">
                {tps(s.avg_tokens_per_sec)}
                <span className="ml-1 text-sm font-normal text-ink3">tok/s</span>
              </div>
              <div className="mt-1 text-sm text-ink3 tnum">
                {ms(s.avg_ttft_ms)} to first token · {gb(s.model_size_bytes)}
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="mt-12 max-w-3xl space-y-8">
        <div>
          <h2 className="text-xl font-semibold text-primary">What this is</h2>
          <p className="mt-2 text-ink2">{brief.what}</p>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-primary">How it works</h2>
          <p className="mt-2 text-ink2">{brief.how}</p>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-primary">Why bother</h2>
          <p className="mt-2 text-ink2">{brief.why}</p>
        </div>
      </section>

      {host && (
        <section className="mt-12">
          <h2 className="text-xl font-semibold text-primary">The machine</h2>
          <table className="mt-3 w-full max-w-xl border-collapse text-sm">
            <tbody>
              {[
                ['Chip', host.host_chip],
                ['Memory', host.host_ram_gb ? `${host.host_ram_gb} GB unified` : null],
                ['Cores', host.host_cpu_cores ? `${host.host_cpu_cores} CPU / ${host.host_gpu_cores ?? '—'} GPU` : null],
                ['OS', host.host_os],
                ['Serving engine', host.ollama_version ? `Ollama ${host.ollama_version}` : null],
                ['Model', `${host.model_family} ${host.model_params}`],
              ].filter(([, v]) => v).map(([k, v]) => (
                <tr key={k as string} className="border-b border-border">
                  <th className="py-2 pr-4 text-left font-medium text-ink2">{k}</th>
                  <td className="py-2 font-mono text-ink">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-primary">Every term used here</h2>
        <p className="mt-2 max-w-2xl text-ink2">
          Written for someone who has never called a language-model API. No entry uses
          another entry&rsquo;s jargon before defining it.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {concepts.map((c) => (
            <div
              key={c.term}
              id={c.term.toLowerCase().replace(/[^a-z0-9]+/g, '-')}
              className="rounded-lg border border-border bg-surface2 p-4"
            >
              <h3 className="font-semibold text-primary">{c.term}</h3>
              <p className="mt-1 text-sm text-ink2">{c.plain}</p>
              <p className="mt-2 border-l-2 border-border pl-3 text-sm text-ink3">
                {c.here}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-12 flex flex-wrap gap-3">
        <Link
          href="/benchmark"
          className="rounded-md bg-primary px-5 py-2.5 font-medium text-white hover:opacity-90"
        >
          See the measurements
        </Link>
        <Link
          href="/playground"
          className="rounded-md border border-cta px-5 py-2.5 font-medium text-cta hover:bg-surface2"
        >
          Run it live
        </Link>
      </div>

      {stats && (
        <p className="mt-6 text-sm text-ink3 tnum">
          {stats.runs} benchmark run{stats.runs === 1 ? '' : 's'} stored ·{' '}
          {stats.measurements} measurements · {stats.live_runs} live generation
          {stats.live_runs === 1 ? '' : 's'} served
        </p>
      )}
    </div>
  )
}

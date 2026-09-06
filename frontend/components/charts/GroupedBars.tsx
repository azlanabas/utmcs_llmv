'use client'

import { useState } from 'react'

// Mark specs per the dataviz skill: thin marks, 4px rounded data-ends anchored to
// the baseline, 2px surface gap between adjacent bars, recessive grid, values in
// text tokens never in the series colour, legend + table toggle always available.

export interface Series {
  key: string
  label: string
  color: string
}

export interface Group {
  label: string
  values: Record<string, number | null>
}

export default function GroupedBars({
  title, unit, series, groups, dp = 1, note,
}: {
  title: string
  unit: string
  series: Series[]
  groups: Group[]
  dp?: number
  note?: string
}) {
  const [asTable, setAsTable] = useState(false)
  const [hover, setHover] = useState<{ g: string; s: string; v: number } | null>(null)

  const all = groups.flatMap((g) => series.map((s) => g.values[s.key])).filter(
    (v): v is number => v != null,
  )
  const max = all.length ? Math.max(...all) : 1
  // Round the axis up to something human.
  const step = Math.pow(10, Math.floor(Math.log10(max || 1)))
  const top = Math.ceil(max / step) * step || 1

  const W = 640, H = 260
  const PAD = { l: 52, r: 12, t: 12, b: 42 }
  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b
  const gW = plotW / groups.length
  const barW = Math.min(34, (gW - 16) / series.length - 2) // 2px surface gap
  const ticks = 4

  return (
    <figure className="min-w-0 rounded-lg border border-border bg-surface2 p-4">
      <figcaption className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold text-primary">{title}</span>
        <button
          onClick={() => setAsTable((v) => !v)}
          className="text-sm text-secondary underline"
          aria-pressed={asTable}
        >
          {asTable ? 'view as chart' : 'view as table'}
        </button>
      </figcaption>

      {/* Legend — always present for >= 2 series. Identity is never colour-alone. */}
      <div className="mb-2 flex flex-wrap gap-4 text-sm text-ink2">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: s.color }}
              aria-hidden
            />
            {s.label}
          </span>
        ))}
      </div>

      {asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm tnum">
            <thead>
              <tr>
                <th className="border-b border-border py-2 text-left font-medium text-ink2">
                  Prompt
                </th>
                {series.map((s) => (
                  <th key={s.key} className="border-b border-border py-2 text-right font-medium text-ink2">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.label}>
                  <td className="border-b border-border py-2 text-ink2">{g.label}</td>
                  {series.map((s) => (
                    <td key={s.key} className="border-b border-border py-2 text-right font-mono text-ink">
                      {g.values[s.key] == null ? '—' : g.values[s.key]!.toFixed(dp)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]" role="img"
               aria-label={`${title}, ${unit}`}>
            {/* recessive grid */}
            {Array.from({ length: ticks + 1 }, (_, i) => {
              const v = (top / ticks) * i
              const y = PAD.t + plotH - (v / top) * plotH
              return (
                <g key={i}>
                  <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y}
                        stroke="var(--border)" strokeWidth={1} />
                  <text x={PAD.l - 8} y={y + 4} textAnchor="end"
                        className="tnum" fontSize={11} fill="var(--ink-3)">
                    {v.toFixed(top < 10 ? 1 : 0)}
                  </text>
                </g>
              )
            })}

            {groups.map((g, gi) => {
              const gx = PAD.l + gi * gW
              const inner = series.length * (barW + 2) - 2
              const start = gx + (gW - inner) / 2
              return (
                <g key={g.label}>
                  {series.map((s, si) => {
                    const v = g.values[s.key]
                    if (v == null) return null
                    const h = Math.max(2, (v / top) * plotH)
                    const x = start + si * (barW + 2)
                    const y = PAD.t + plotH - h
                    const on = hover?.g === g.label && hover?.s === s.key
                    return (
                      <rect
                        key={s.key}
                        x={x} y={y} width={barW} height={h}
                        rx={4} ry={4}
                        fill={s.color}
                        opacity={hover && !on ? 0.55 : 1}
                        onMouseEnter={() => setHover({ g: g.label, s: s.key, v })}
                        onMouseLeave={() => setHover(null)}
                      >
                        <title>{`${s.label} · ${g.label}: ${v.toFixed(dp)} ${unit}`}</title>
                      </rect>
                    )
                  })}
                  <text x={gx + gW / 2} y={H - PAD.b + 18} textAnchor="middle"
                        fontSize={12} fill="var(--ink-2)">
                    {g.label}
                  </text>
                </g>
              )
            })}

            <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + plotH} y2={PAD.t + plotH}
                  stroke="var(--ink-2)" strokeWidth={1} />
          </svg>
        </div>
      )}

      <p className="mt-2 text-sm text-ink3 tnum">
        {hover
          ? `${hover.s} · ${hover.g}: ${hover.v.toFixed(dp)} ${unit}`
          : note ?? unit}
      </p>
    </figure>
  )
}

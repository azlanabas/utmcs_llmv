'use client'

// Three points, direct-labelled — no legend box needed (dataviz series-count ladder).
// Shows the whole tradeoff as one shape.

export interface Point {
  label: string
  x: number // GB on disk
  y: number // tokens/sec
  color: string
}

export default function SizeVsSpeed({ points }: { points: Point[] }) {
  if (!points.length) return null

  const W = 640, H = 300
  const PAD = { l: 56, r: 56, t: 20, b: 48 }
  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b

  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const xMax = Math.ceil(Math.max(...xs) * 1.15 * 10) / 10
  const yMax = Math.ceil(Math.max(...ys) * 1.15 / 10) * 10

  const px = (x: number) => PAD.l + (x / xMax) * plotW
  const py = (y: number) => PAD.t + plotH - (y / yMax) * plotH

  const sorted = [...points].sort((a, b) => a.x - b.x)

  return (
    <figure className="min-w-0 rounded-lg border border-border bg-surface2 p-4">
      <figcaption className="mb-3 font-semibold text-primary">
        Size on disk vs generation speed
      </figcaption>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]" role="img"
             aria-label="Model size on disk against tokens per second">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={PAD.l} x2={W - PAD.r} y1={py(yMax * f)} y2={py(yMax * f)}
                    stroke="var(--border)" strokeWidth={1} />
              <text x={PAD.l - 8} y={py(yMax * f) + 4} textAnchor="end"
                    fontSize={11} fill="var(--ink-3)" className="tnum">
                {Math.round(yMax * f)}
              </text>
            </g>
          ))}
          {[0, 0.5, 1].map((f) => (
            <text key={f} x={px(xMax * f)} y={H - PAD.b + 20} textAnchor="middle"
                  fontSize={11} fill="var(--ink-3)" className="tnum">
              {(xMax * f).toFixed(1)}
            </text>
          ))}

          {/* connecting path — the tradeoff curve */}
          <path
            d={sorted.map((p, i) => `${i ? 'L' : 'M'}${px(p.x)},${py(p.y)}`).join(' ')}
            fill="none" stroke="var(--border)" strokeWidth={2}
          />

          {points.map((p) => (
            <g key={p.label}>
              {/* 2px surface ring on overlapping marks */}
              <circle cx={px(p.x)} cy={py(p.y)} r={9}
                      fill="var(--surface-2)" />
              <circle cx={px(p.x)} cy={py(p.y)} r={6} fill={p.color}>
                <title>{`${p.label}: ${p.x.toFixed(2)} GB, ${p.y.toFixed(1)} tok/s`}</title>
              </circle>
              <text x={px(p.x)} y={py(p.y) - 15} textAnchor="middle"
                    fontSize={12} fontWeight={600} fill="var(--ink-2)">
                {p.label}
              </text>
            </g>
          ))}

          <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + plotH} y2={PAD.t + plotH}
                stroke="var(--ink-2)" strokeWidth={1} />
          <text x={PAD.l + plotW / 2} y={H - 8} textAnchor="middle"
                fontSize={12} fill="var(--ink-2)">
            size on disk (GB) →
          </text>
          <text x={14} y={PAD.t + plotH / 2} fontSize={12} fill="var(--ink-2)"
                transform={`rotate(-90 14 ${PAD.t + plotH / 2})`} textAnchor="middle">
            tokens / sec →
          </text>
        </svg>
      </div>
      <p className="mt-2 text-sm text-ink3">
        Up and to the left is better: faster, and smaller on disk.
      </p>
    </figure>
  )
}

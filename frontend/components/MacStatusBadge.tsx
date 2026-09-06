'use client'

import { useEffect, useState } from 'react'
import { getLiveHealth } from '@/lib/api'

type State = 'checking' | 'online' | 'degraded' | 'offline'

const REQUIRED = [
  'llama3.2:1b-instruct-q2_K',
  'llama3.2:1b-instruct-q4_K_M',
  'llama3.2:1b-instruct-q8_0',
]

// Glyph AND label always render — never colour alone (docs/color-scheme.md §2.3).
const LOOK: Record<State, { glyph: string; label: string; color: string }> = {
  checking: { glyph: '◌', label: 'Checking…',     color: 'var(--ink-3)' },
  online:   { glyph: '●', label: 'Mac online',    color: 'var(--status-good)' },
  degraded: { glyph: '▲', label: 'Model missing', color: 'var(--status-warn)' },
  offline:  { glyph: '■', label: 'Mac asleep',    color: 'var(--status-off)' },
}

export default function MacStatusBadge() {
  // Initial state is "checking", never an optimistic "online".
  const [state, setState] = useState<State>('checking')
  const [missing, setMissing] = useState<string[]>([])

  useEffect(() => {
    let alive = true

    const check = async () => {
      const h = await getLiveHealth()
      if (!alive) return
      if (!h.mac_online) {
        setState('offline')
        setMissing([])
        return
      }
      const absent = REQUIRED.filter((r) => !h.models.includes(r))
      setMissing(absent)
      setState(absent.length ? 'degraded' : 'online')
    }

    check()
    const t = setInterval(check, 30_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  const look = LOOK[state]
  const title =
    state === 'degraded'
      ? `Not loaded: ${missing.join(', ')}`
      : state === 'offline'
        ? 'The Mac is unreachable — benchmark results are still available'
        : undefined

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-sm"
      style={{ color: look.color }}
      title={title}
      aria-label={`Mac status: ${look.label}`}
    >
      <span aria-hidden>{look.glyph}</span>
      <span className="font-medium">{look.label}</span>
    </span>
  )
}

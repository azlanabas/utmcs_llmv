export const ms = (v: number | null | undefined, dp = 0) =>
  v == null ? '—' : `${v.toFixed(dp)} ms`

export const tps = (v: number | null | undefined, dp = 1) =>
  v == null ? '—' : v.toFixed(dp)

export const gb = (bytes: number | null | undefined) =>
  bytes == null ? '—' : `${(bytes / 1e9).toFixed(2)} GB`

export const mb = (v: number | null | undefined) =>
  v == null ? '—' : `${Math.round(v)} MB`

export const when = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  // GMT+8 — the owner's timezone, never UTC.
  return d.toLocaleString('en-GB', {
    timeZone: 'Asia/Singapore',
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }) + ' (GMT+8)'
}

export const quantLabel = (q: string) =>
  ({ q2_K: '2-bit', q4_K_M: '4-bit', q8_0: '8-bit' } as Record<string, string>)[q] ?? q

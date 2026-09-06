// Typed fetch wrapper. Same-origin: nginx serves the UI and proxies /api.

export type QuantKey = 'q2_K' | 'q4_K_M' | 'q8_0'

export const QUANTS: { key: QuantKey; label: string; bits: string; token: string }[] = [
  { key: 'q2_K',   label: '2-bit',  bits: 'q2_K',   token: 'var(--quant-2)' },
  { key: 'q4_K_M', label: '4-bit',  bits: 'q4_K_M', token: 'var(--quant-4)' },
  { key: 'q8_0',   label: '8-bit',  bits: 'q8_0',   token: 'var(--quant-8)' },
]

export interface Measurement {
  quant: QuantKey
  model_tag: string
  model_size_bytes: number | null
  prompt_key: string
  prompt_text: string
  repeat_index: number
  ttft_ms: number | null
  total_ms: number
  prompt_tokens: number | null
  completion_tokens: number | null
  tokens_per_sec: number | null
  tokens_per_sec_ollama: number | null
  peak_memory_mb: number | null
  context_window: number | null
  ok: boolean
  error: string | null
}

export interface QuantSummary {
  quant: QuantKey
  model_size_bytes: number | null
  avg_tokens_per_sec: number | null
  avg_ttft_ms: number | null
  peak_memory_mb: number | null
  n_ok: number
  n_failed: number
}

export interface RunMeta {
  id: number
  started_at: string
  finished_at: string
  received_at: string
  harness_version: string
  model_family: string
  model_params: string
  repeats: number
  host_chip: string | null
  host_ram_gb: number | null
  host_cpu_cores: number | null
  host_gpu_cores: number | null
  host_os: string | null
  ollama_version: string | null
  note: string | null
}

export interface RunDetail {
  run: RunMeta | null
  summary?: QuantSummary[]
  measurements?: Measurement[]
  reason?: string
}

export interface RunListItem {
  id: number
  started_at: string
  received_at: string
  host_chip: string | null
  note: string | null
  measurements: number
  failed: number
}

export interface LiveHealth {
  mac_online: boolean
  models: string[]
  checked_at: string
}

// ⚠️ Server components have no origin, so a relative fetch fails silently and the
// page renders its empty state. Server-side we must address the backend directly;
// client-side we must stay relative so the request goes through nginx (and its
// basic-auth gate). Getting this wrong looks like "no data" with an HTTP 200.
const serverBase = () =>
  process.env.API_INTERNAL_BASE ?? 'http://127.0.0.1:8092'

async function get<T>(path: string, revalidate = 0): Promise<T | null> {
  const base = typeof window === 'undefined' ? serverBase() : ''
  try {
    const res = await fetch(`${base}${path}`, { next: { revalidate } })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export const getLatestRun = () => get<RunDetail>('/api/runs/latest')
export const getRun = (id: number) => get<RunDetail>(`/api/runs/${id}`)
export const getRuns = () => get<{ runs: RunListItem[] }>('/api/runs')
export const getStats = () =>
  get<{ runs: number; measurements: number; live_runs: number }>('/api/stats')

/** Never throws — an unreachable backend reads as "offline", same as an asleep Mac. */
export async function getLiveHealth(): Promise<LiveHealth> {
  try {
    const res = await fetch('/api/live/health', { cache: 'no-store' })
    if (!res.ok) throw new Error()
    return (await res.json()) as LiveHealth
  } catch {
    return { mac_online: false, models: [], checked_at: new Date().toISOString() }
  }
}

import Link from 'next/link'
import MacStatusBadge from './MacStatusBadge'

const links = [
  { href: '/', label: 'What this is' },
  { href: '/benchmark', label: 'Benchmark' },
  { href: '/playground', label: 'Playground' },
]

export default function Nav() {
  return (
    <header className="border-b border-border bg-surface2">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
        <Link href="/" className="font-mono text-lg font-semibold tracking-tight text-primary">
          LLMV
        </Link>
        <nav className="flex gap-5 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-secondary hover:underline">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <MacStatusBadge />
        </div>
      </div>
    </header>
  )
}

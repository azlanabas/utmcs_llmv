import type { Metadata } from 'next'
import { Public_Sans, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import Nav from '@/components/Nav'

const sans = Public_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const mono = IBM_Plex_Mono({
  subsets: ['latin'], weight: ['400', '500', '600'],
  variable: '--font-mono', display: 'swap',
})

export const metadata: Metadata = {
  title: 'LLMV — quantization on a laptop',
  description: 'A 1B language model at 2-bit, 4-bit and 8-bit, measured on an Apple M4.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <Nav />
        <main className="mx-auto max-w-5xl px-5 pb-24">{children}</main>
        <footer className="mx-auto max-w-5xl px-5 py-8 text-sm text-ink3 border-t border-border">
          Measured on an Apple M4 · 16 GB unified memory · 10 CPU / 8 GPU cores ·
          Llama&nbsp;3.2&nbsp;1B via Ollama. Inference runs on the Mac, not on this server.
        </footer>
      </body>
    </html>
  )
}

import { useState } from 'react'
import { Copy, Download, CheckCircle2, Server, FileCode, Terminal, ShieldCheck } from 'lucide-react'
import { FASTAPI_BACKEND_CODE, DOCKERFILE, ENV_EXAMPLE, RENDER_YAML } from '../lib/backendCode'
import { toast } from './ui/toaster'

const FILES: { name: string; lang: string; content: string; icon: React.ReactNode }[] = [
  { name: 'main.py', lang: 'python', content: FASTAPI_BACKEND_CODE, icon: <FileCode className="w-4 h-4" /> },
  { name: 'Dockerfile', lang: 'docker', content: DOCKERFILE, icon: <Server className="w-4 h-4" /> },
  { name: '.env.example', lang: 'bash', content: ENV_EXAMPLE, icon: <ShieldCheck className="w-4 h-4" /> },
  { name: 'render.yaml', lang: 'yaml', content: RENDER_YAML, icon: <Terminal className="w-4 h-4" /> },
]

export function BackendGuide() {
  const [active, setActive] = useState('main.py')
  const current = FILES.find((f) => f.name === active)!

  function copyAll() { navigator.clipboard.writeText(current.content); toast({ title: `${current.name} copied to clipboard` }) }

  function downloadAll() {
    const blob = new Blob([current.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = current.name; a.click()
    URL.revokeObjectURL(url)
    toast({ title: `${current.name} downloaded` })
  }

  function downloadAllFiles() {
    const bundle = FILES.map((f) => `// ${f.name}\n\n${f.content}\n`).join('\n')
    const blob = new Blob([bundle], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'm3-backend-bundle.txt'; a.click()
    URL.revokeObjectURL(url)
    toast({ title: 'Bundle downloaded' })
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Backend Deploy Guide</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">A reference FastAPI server that holds the master M3 API key in its environment and exposes a single <code className="text-blue-300">/v1/chat</code> endpoint for this UI.</p>
        </div>
        <button onClick={downloadAllFiles} className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-violet-500 text-white shadow-lg">
          <Download className="w-4 h-4" /> Download all files
        </button>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400" /> Security architecture</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <Step n={1} title="Browser" desc="This UI sends user prompts to your proxy. No master key is ever embedded." />
          <Step n={2} title="Your proxy" desc="FastAPI server reads M3_API_KEY from environment. Adds it server-side and forwards to M3." />
          <Step n={3} title="M3 API" desc="The model provider only ever sees requests originating from your server's IP, with your master key." />
        </div>
      </section>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
        <div className="flex items-center border-b border-slate-800 bg-slate-950/60">
          {FILES.map((f) => (
            <button key={f.name} onClick={() => setActive(f.name)}
              className={`px-4 py-2.5 text-sm inline-flex items-center gap-2 border-r border-slate-800 ${active === f.name ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {f.icon} {f.name}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-950/40 text-xs text-slate-400">
          <span>{current.lang}</span>
          <div className="flex items-center gap-2">
            <button onClick={copyAll} className="px-2 py-1 rounded hover:bg-slate-800 inline-flex items-center gap-1"><Copy className="w-3 h-3" /> Copy</button>
            <button onClick={downloadAll} className="px-2 py-1 rounded hover:bg-slate-800 inline-flex items-center gap-1"><Download className="w-3 h-3" /> Download</button>
          </div>
        </div>
        <pre className="p-4 text-[12.5px] leading-relaxed overflow-x-auto text-slate-100 max-h-[600px]"><code>{current.content}</code></pre>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="font-semibold mb-3">Deploy in 4 steps</h2>
        <ol className="space-y-2.5 text-sm list-decimal list-inside text-slate-300">
          <li>Create a GitHub repo and commit <code className="text-blue-300">main.py</code>, <code className="text-blue-300">Dockerfile</code>, <code className="text-blue-300">render.yaml</code>.</li>
          <li>On Render / Fly / Railway, set environment variable <code className="text-blue-300">M3_API_KEY</code> in the dashboard, never in git.</li>
          <li>Deploy. The service will be available at <code className="text-blue-300">https://your-app.onrender.com/v1/chat</code>.</li>
          <li>Paste that URL in the <strong>Settings</strong> tab of this UI. Done.</li>
        </ol>
      </section>
    </div>
  )
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 text-xs font-bold flex items-center justify-center">{n}</div>
        <div className="font-semibold text-sm text-slate-200">{title}</div>
      </div>
      <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{desc}</p>
    </div>
  )
}

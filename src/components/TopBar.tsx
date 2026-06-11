import { Activity, Bell, Github } from 'lucide-react'
import { useEffect, useState } from 'react'
import { storage } from '../lib/api'

export function TopBar() {
  const [proxy, setProxy] = useState('')
  const [usage, setUsage] = useState(storage.getUsage())

  useEffect(() => {
    setProxy(storage.getProxyUrl())
    const id = setInterval(() => setUsage(storage.getUsage()), 1500)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="h-14 px-6 flex items-center justify-between border-b border-slate-800 bg-slate-950/60 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="text-sm text-slate-400">Production-Ready M3 Integration Template</div>
        <span
          className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${
            proxy
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          }`}
        >
          {proxy ? 'Live' : 'Demo Mode'}
        </span>
      </div>
      <div className="flex items-center gap-5 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5" />
          <span>{usage.totalRequests} requests</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Tokens:</span>
          <span>{usage.totalTokens.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Est:</span>
          <span>${usage.estimatedCostUSD.toFixed(4)}</span>
        </div>
        <a
          href="https://github.com/nashwanzaher/m3-secure-chat"
          target="_blank"
          rel="noreferrer"
          className="hover:text-slate-200"
        >
          <Github className="w-4 h-4" />
        </a>
      </div>
    </header>
  )
}

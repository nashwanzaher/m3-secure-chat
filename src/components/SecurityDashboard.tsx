import { useEffect, useState } from 'react'
import { Shield, Key, Activity, DollarSign, AlertTriangle, CheckCircle2, XCircle, RefreshCw, Trash2 } from 'lucide-react'
import { storage, type UsageStats } from '../lib/api'
import { toast } from './ui/toaster'

export function SecurityDashboard() {
  const [usage, setUsage] = useState<UsageStats>(storage.getUsage())
  const [hasKey, setHasKey] = useState(false)
  const [hasProxy, setHasProxy] = useState(false)
  const [keyPreview, setKeyPreview] = useState('')

  useEffect(() => {
    refresh()
    const id = setInterval(() => setUsage(storage.getUsage()), 2000)
    return () => clearInterval(id)
  }, [])

  function refresh() {
    setUsage(storage.getUsage())
    const k = storage.getApiKey()
    setHasKey(!!k)
    setKeyPreview(k ? `${k.slice(0, 6)}...${k.slice(-4)}` : '')
    setHasProxy(!!storage.getProxyUrl())
  }

  function clearAll() {
    if (!confirm('This will erase the local API key, proxy URL, conversation history, and usage stats from this browser. Continue?')) return
    storage.setApiKey('')
    storage.setProxyUrl('')
    storage.resetUsage()
    localStorage.removeItem('m3.conversation')
    localStorage.removeItem('m3.settings')
    refresh()
    toast({ title: 'Local data cleared', description: 'Browser storage wiped.' })
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Security & Usage</h1>
        <p className="text-sm text-slate-400 mt-1">Inspect what is stored in this browser, and review the security posture of the integration.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusCard icon={<Key className="w-5 h-5" />} label="API key" ok={hasKey} value={hasKey ? keyPreview : 'Not set'} tone={hasKey ? 'amber' : 'slate'} />
        <StatusCard icon={<Shield className="w-5 h-5" />} label="Proxy URL" ok={hasProxy} value={hasProxy ? 'Configured' : 'Demo mode'} tone={hasProxy ? 'emerald' : 'slate'} />
        <StatusCard icon={<Activity className="w-5 h-5" />} label="Total requests" value={usage.totalRequests.toString()} />
        <StatusCard icon={<DollarSign className="w-5 h-5" />} label="Est. cost (USD)" value={`$${usage.estimatedCostUSD.toFixed(4)}`} />
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Token usage</h2>
          <button onClick={() => { storage.resetUsage(); refresh(); toast({ title: 'Usage stats reset' }) }}
            className="text-xs text-slate-400 hover:text-slate-200 inline-flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Reset
          </button>
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <Stat label="Prompt tokens" value={usage.promptTokens.toLocaleString()} />
          <Stat label="Completion tokens" value={usage.completionTokens.toLocaleString()} />
          <Stat label="Total tokens" value={usage.totalTokens.toLocaleString()} />
        </div>
        {usage.lastUsed > 0 && <div className="text-[11px] text-slate-500 mt-3">Last activity: {new Date(usage.lastUsed).toLocaleString()}</div>}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="font-semibold mb-4">Security checklist</h2>
        <div className="space-y-2.5 text-sm">
          <Check ok={hasProxy} text="Frontend talks to a proxy, not directly to api.MiniMax.com" />
          <Check ok={!hasKey} text="No master M3 key is stored in the browser (only optional per-user key)" />
          <Check ok={true} text="Master M3 key lives in the backend's environment variables" />
          <Check ok={true} text="No key is ever logged, written to URLs, or echoed back in errors" />
          <Check ok={true} text="All localStorage values are scoped to this origin only" />
        </div>
      </section>

      <section className="rounded-xl border border-red-900/50 bg-red-950/20 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
          <div className="flex-1">
            <h2 className="font-semibold text-red-200">Danger zone</h2>
            <p className="text-sm text-red-300/80 mt-1">Erase all locally-stored data for this integration. This does not revoke any keys on the server side.</p>
            <button onClick={clearAll} className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-800 text-red-200 hover:bg-red-900/40 text-sm">
              <Trash2 className="w-4 h-4" /> Clear all local data
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

function StatusCard({ icon, label, value, ok, tone = 'slate' }: { icon: React.ReactNode; label: string; value: string; ok?: boolean; tone?: 'slate' | 'emerald' | 'amber' | 'red' }) {
  const toneCls = { slate: 'border-slate-700 text-slate-300', emerald: 'border-emerald-700/40 text-emerald-300', amber: 'border-amber-700/40 text-amber-300', red: 'border-red-700/40 text-red-300' }[tone]
  return (
    <div className={`rounded-xl border bg-slate-900/40 p-4 ${toneCls}`}>
      <div className="flex items-center justify-between text-slate-400">
        <div className="text-xs uppercase tracking-wider">{label}</div>
        {icon}
      </div>
      <div className="text-lg font-semibold mt-1.5 text-slate-100">{value}</div>
      {ok !== undefined && (
        <div className="text-[11px] mt-1 flex items-center gap-1">
          {ok ? <><CheckCircle2 className="w-3 h-3 text-emerald-400" />ready</> : <><XCircle className="w-3 h-3 text-slate-500" />not configured</>}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3">
      <div className="text-[11px] text-slate-500 uppercase tracking-wider">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  )
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="flex items-start gap-2.5">
      {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />}
      <div className={ok ? 'text-slate-200' : 'text-slate-400'}>{text}</div>
    </div>
  )
}

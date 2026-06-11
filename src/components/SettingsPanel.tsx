import { useEffect, useState } from 'react'
import { Save, RotateCcw, Eye, EyeOff, CheckCircle2, AlertTriangle, Server, Key } from 'lucide-react'
import { storage } from '../lib/api'
import { toast } from './ui/toaster'

const PRESET_MODELS = ['MiniMax-M3', 'MiniMax-M3-fast', 'MiniMax-M3-pro']

export function SettingsPanel() {
  const [proxyUrl, setProxyUrl] = useState('')
  const [userKey, setUserKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [settings, setSettings] = useState(storage.getSettings())
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testMsg, setTestMsg] = useState('')

  useEffect(() => {
    setProxyUrl(storage.getProxyUrl())
    setUserKey(storage.getApiKey())
    setSettings(storage.getSettings())
  }, [])

  function handleSave() {
    storage.setProxyUrl(proxyUrl.trim())
    storage.setApiKey(userKey.trim())
    storage.setSettings(settings)
    toast({ title: 'Settings saved', description: 'Configuration stored locally.' })
  }

  function handleReset() {
    if (!confirm('Reset all settings to defaults?')) return
    storage.setProxyUrl('')
    storage.setApiKey('')
    setProxyUrl('')
    setUserKey('')
    const def = { model: 'MiniMax-M3', temperature: 0.7, max_tokens: 2048, top_p: 0.9, systemPrompt: 'You are a helpful AI assistant powered by MiniMax M3.' }
    setSettings(def)
    storage.setSettings(def)
  }

  async function handleTest() {
    setTestState('testing')
    setTestMsg('')
    try {
      const res = await fetch(proxyUrl.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(userKey ? { 'X-User-Api-Key': userKey } : {}) },
        body: JSON.stringify({ model: settings.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 }),
      })
      if (res.ok) { setTestState('ok'); setTestMsg(`Connected (${res.status})`) }
      else { setTestState('fail'); setTestMsg(`HTTP ${res.status}`) }
    } catch (e: any) { setTestState('fail'); setTestMsg(e?.message || 'Network error') }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Configure your M3 proxy backend and model parameters.</p>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-blue-400" />
          <h2 className="font-semibold">Backend Proxy URL</h2>
        </div>
        <p className="text-xs text-slate-400">Address of your FastAPI proxy that holds the master M3 key.</p>
        <input type="url" value={proxyUrl} onChange={(e) => setProxyUrl(e.target.value)}
          placeholder="https://your-backend.example.com/v1/chat"
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500/60" />
        <div className="flex items-center gap-2">
          <button onClick={handleTest} disabled={!proxyUrl.trim() || testState === 'testing'}
            className="px-3 py-1.5 rounded-md border border-slate-700 text-xs hover:bg-slate-800 disabled:opacity-50">
            {testState === 'testing' ? 'Testing...' : 'Test connection'}
          </button>
          {testState === 'ok' && <div className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" />{testMsg}</div>}
          {testState === 'fail' && <div className="flex items-center gap-1 text-xs text-red-400"><AlertTriangle className="w-3.5 h-3.5" />{testMsg}</div>}
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-violet-400" />
          <h2 className="font-semibold">Per-user key (optional)</h2>
        </div>
        <p className="text-xs text-slate-400">Sent as <code className="text-blue-300">X-User-Api-Key</code> header. The master key is never sent to the browser.</p>
        <div className="relative">
          <input type={showKey ? 'text' : 'password'} value={userKey} onChange={(e) => setUserKey(e.target.value)}
            placeholder="sk-..."
            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-10 py-2.5 text-sm focus:outline-none focus:border-violet-500/60" />
          <button onClick={() => setShowKey((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-200" type="button">
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
        <h2 className="font-semibold">Model parameters</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-400">Model</label>
            <input list="model-presets" value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })}
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
            <datalist id="model-presets">{PRESET_MODELS.map((m) => <option key={m} value={m} />)}</datalist>
          </div>
          <div>
            <label className="text-xs text-slate-400 flex items-center justify-between"><span>Temperature</span><span>{settings.temperature.toFixed(2)}</span></label>
            <input type="range" min="0" max="2" step="0.05" value={settings.temperature}
              onChange={(e) => setSettings({ ...settings, temperature: parseFloat(e.target.value) })} className="mt-2 w-full accent-blue-500" />
          </div>
          <div>
            <label className="text-xs text-slate-400">Max tokens</label>
            <input type="number" min={64} max={32768} value={settings.max_tokens}
              onChange={(e) => setSettings({ ...settings, max_tokens: parseInt(e.target.value) || 2048 })}
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-400 flex items-center justify-between"><span>Top P</span><span>{settings.top_p.toFixed(2)}</span></label>
            <input type="range" min="0" max="1" step="0.05" value={settings.top_p}
              onChange={(e) => setSettings({ ...settings, top_p: parseFloat(e.target.value) })} className="mt-2 w-full accent-blue-500" />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-400">System prompt</label>
          <textarea value={settings.systemPrompt} onChange={(e) => setSettings({ ...settings, systemPrompt: e.target.value })}
            rows={3} className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
        </div>
      </section>

      <div className="flex items-center gap-2">
        <button onClick={handleSave} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-blue-500 to-violet-500 text-white shadow-lg">
          <Save className="w-4 h-4" /> Save settings
        </button>
        <button onClick={handleReset} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800">
          <RotateCcw className="w-4 h-4" /> Reset to defaults
        </button>
      </div>
    </div>
  )
}

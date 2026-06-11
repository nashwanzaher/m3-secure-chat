import { MessageSquare, Settings, Shield, Server, Cpu, Sparkles } from 'lucide-react'

type View = 'chat' | 'settings' | 'security' | 'backend'

interface SidebarProps {
  currentView: View
  onViewChange: (v: View) => void
}

const items: { id: View; label: string; icon: React.ReactNode; description: string }[] = [
  { id: 'chat', label: 'Chat', icon: <MessageSquare className="w-5 h-5" />, description: 'M3 Conversation' },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-5 h-5" />, description: 'API & Model' },
  { id: 'security', label: 'Security', icon: <Shield className="w-5 h-5" />, description: 'Keys & Usage' },
  { id: 'backend', label: 'Backend', icon: <Server className="w-5 h-5" />, description: 'Deploy Guide' },
]

export function Sidebar({ currentView, onViewChange }: SidebarProps) {
  return (
    <aside className="w-64 bg-slate-950/80 border-r border-slate-800 backdrop-blur flex flex-col">
      <div className="p-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 via-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-sm">M3 Secure Chat</div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1">
              <Cpu className="w-3 h-3" /> Powered by MiniMax M3
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {items.map((it) => {
          const active = it.id === currentView
          return (
            <button
              key={it.id}
              onClick={() => onViewChange(it.id)}
              className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left ${
                active
                  ? 'bg-gradient-to-r from-blue-500/15 to-violet-500/15 border border-blue-500/30 text-white'
                  : 'hover:bg-slate-800/50 text-slate-300 border border-transparent'
              }`}
            >
              <div className={active ? 'text-blue-400' : 'text-slate-400'}>{it.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{it.label}</div>
                <div className="text-[11px] text-slate-500">{it.description}</div>
              </div>
            </button>
          )
        })}
      </nav>

      <div className="p-4 border-t border-slate-800 text-[11px] text-slate-500 leading-relaxed">
        <div className="font-semibold text-slate-400 mb-1">Security Model</div>
        API keys are held by a server-side proxy. The browser never sees the master key.
      </div>
    </aside>
  )
}

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react'

type ToastVariant = 'success' | 'error' | 'info' | 'warn'
interface ToastItem { id: number; title: string; description?: string; variant: ToastVariant }
interface Ctx { toast: (t: { title: string; description?: string; variant?: ToastVariant }) => void }

const ToastCtx = createContext<Ctx>({ toast: () => {} })
export function useToast() { return useContext(ToastCtx) }

export function Toaster({ children }: { children?: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const show = useCallback((t: { title: string; description?: string; variant?: ToastVariant }) => {
    const id = Date.now() + Math.random()
    setItems((prev) => [...prev, { id, title: t.title, description: t.description, variant: t.variant || 'info' }])
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 3500)
  }, [])
  useEffect(() => {
    const h = (e: Event) => show((e as CustomEvent).detail as Parameters<typeof show>[0])
    window.addEventListener('m3:show-toast', h as EventListener)
    return () => window.removeEventListener('m3:show-toast', h as EventListener)
  }, [show])
  const toast = show
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
        {items.map((i) => (
          <div key={i.id} className={`flex items-start gap-3 p-3 rounded-lg border backdrop-blur shadow-xl ${toneClass(i.variant)}`}>
            {toneIcon(i.variant)}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{i.title}</div>
              {i.description && <div className="text-xs opacity-80 mt-0.5">{i.description}</div>}
            </div>
            <button onClick={() => setItems((prev) => prev.filter((p) => p.id !== i.id))} className="opacity-60 hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

function toneClass(v: ToastVariant) {
  switch (v) {
    case 'success': return 'bg-emerald-950/80 border-emerald-700/60 text-emerald-100'
    case 'error': return 'bg-red-950/80 border-red-700/60 text-red-100'
    case 'warn': return 'bg-amber-950/80 border-amber-700/60 text-amber-100'
    default: return 'bg-slate-900/80 border-slate-700/60 text-slate-100'
  }
}
function toneIcon(v: ToastVariant) {
  switch (v) {
    case 'success': return <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5" />
    case 'error': return <XCircle className="w-4 h-4 text-red-400 mt-0.5" />
    case 'warn': return <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" />
    default: return <Info className="w-4 h-4 text-blue-400 mt-0.5" />
  }
}

export function toast(t: { title: string; description?: string; variant?: ToastVariant }) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('m3:show-toast', { detail: t }))
}

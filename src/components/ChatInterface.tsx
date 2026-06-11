import { useEffect, useRef, useState } from 'react'
import { Send, Trash2, Bot, User, Loader2, Sparkles } from 'lucide-react'
import { chat, storage, type ChatMessage } from '../lib/api'
import { Markdown } from '../lib/markdown'

interface ConversationMessage extends ChatMessage {
  id: string
  error?: string
}

const STORAGE_CONVERSATION = 'm3.conversation'

export function ChatInterface() {
  const [messages, setMessages] = useState<ConversationMessage[]>(() => {
    const raw = localStorage.getItem(STORAGE_CONVERSATION)
    if (raw) { try { return JSON.parse(raw) } catch { return [] } }
    return []
  })
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_CONVERSATION, JSON.stringify(messages))
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  async function handleSend() {
    const text = input.trim()
    if (!text || isLoading) return
    const userMsg: ConversationMessage = { id: `u-${Date.now()}`, role: 'user', content: text }
    setInput('')
    setMessages((prev) => [...prev, userMsg])
    setIsLoading(true)
    const settings = storage.getSettings()
    const history: ChatMessage[] = [
      { role: 'system', content: settings.systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: text },
    ]
    abortRef.current = new AbortController()
    try {
      const res = await chat(history, { signal: abortRef.current.signal })
      const reply = res.choices[0]?.message?.content || '(empty response)'
      setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: reply }])
      if (res.usage?.total_tokens) storage.addUsage(res.usage.prompt_tokens || 0, res.usage.completion_tokens || 0)
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: 'assistant', content: `**Error**\n\n${err?.message || 'Unknown error'}`, error: err?.message },
      ])
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }

  function handleClear() {
    if (isLoading && abortRef.current) abortRef.current.abort()
    setMessages([])
    localStorage.removeItem(STORAGE_CONVERSATION)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <div className="flex flex-col h-full max-h-screen">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 via-violet-500 to-fuchsia-500 flex items-center justify-center mb-5 shadow-2xl shadow-violet-500/30">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Start a conversation with M3</h2>
            <p className="text-sm text-slate-400 max-w-md mb-8">
              This is a production-ready template for using MiniMax M3 safely,
              with the master API key held server-side.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full">
              {[
                { t: 'Explain quantum computing', d: "Like I'm 5" },
                { t: 'Write a Python function', d: 'that flattens nested lists' },
                { t: 'Compare React vs Vue', d: 'for a 2026 SaaS project' },
                { t: 'Help me debug', d: 'a failing unit test' },
              ].map((p, i) => (
                <button key={i} onClick={() => setInput(p.t)}
                  className="text-left p-4 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-800/60 hover:border-slate-700">
                  <div className="text-sm font-medium text-slate-200">{p.t}</div>
                  <div className="text-xs text-slate-500 mt-1">{p.d}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex gap-3 message-enter ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="w-9 h-9 shrink-0 rounded-lg bg-gradient-to-br from-blue-500 via-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
                <Bot className="w-5 h-5 text-white" />
              </div>
            )}
            <div className={`max-w-[78%] rounded-2xl px-4 py-3 ${
              m.role === 'user'
                ? 'bg-blue-600 text-white'
                : m.error
                ? 'bg-red-950/50 border border-red-800 text-red-100'
                : 'bg-slate-800/70 border border-slate-700/60 text-slate-100'
            }`}>
              {m.role === 'user'
                ? <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
                : <Markdown text={m.content} />}
            </div>
            {m.role === 'user' && (
              <div className="w-9 h-9 shrink-0 rounded-lg bg-slate-700 flex items-center justify-center">
                <User className="w-5 h-5 text-slate-200" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 message-enter">
            <div className="w-9 h-9 shrink-0 rounded-lg bg-gradient-to-br from-blue-500 via-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-slate-300">
              <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
              <span className="pulse-soft">M3 is thinking</span>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-800 bg-slate-950/60 backdrop-blur p-4">
        <div className="max-w-4xl mx-auto flex items-end gap-2">
          <button onClick={handleClear} disabled={messages.length === 0}
            className="p-3 rounded-xl border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-700 disabled:opacity-30"
            title="Clear conversation">
            <Trash2 className="w-4 h-4" />
          </button>
          <div className="flex-1 relative">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKey}
              placeholder="Ask M3 anything... (Enter to send, Shift+Enter for newline)"
              rows={1}
              className="w-full resize-none bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 pr-12 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
              style={{ maxHeight: 160 }} />
          </div>
          <button onClick={handleSend} disabled={!input.trim() || isLoading}
            className="p-3 rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 text-white shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 disabled:opacity-30"
            title="Send">
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="max-w-4xl mx-auto mt-2 text-[11px] text-slate-500 flex items-center gap-3">
          <span>Model: {storage.getSettings().model}</span>
          <span>Temperature: {storage.getSettings().temperature}</span>
          <span>Max tokens: {storage.getSettings().max_tokens}</span>
        </div>
      </div>
    </div>
  )
}

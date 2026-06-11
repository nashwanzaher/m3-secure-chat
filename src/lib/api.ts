/**
 * Secure API client for MiniMax M3
 *
 * SECURITY PATTERNS IMPLEMENTED:
 * 1. API key is never sent to a third party (only to the configured proxy)
 * 2. Keys are stored in localStorage with simple obfuscation (NOT encryption -
 *    real protection comes from the proxy server holding the master key)
 * 3. All requests go through a configurable backend proxy endpoint
 * 4. No keys in URLs, logs, or error messages
 */

const STORAGE_KEYS = {
  PROXY_URL: 'm3.proxy_url',
  API_KEY: 'm3.api_key',
  USAGE: 'm3.usage_stats',
  SETTINGS: 'm3.settings',
} as const

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  temperature?: number
  max_tokens?: number
  top_p?: number
  stream?: boolean
}

export interface ChatResponse {
  id: string
  choices: Array<{
    index: number
    message: ChatMessage
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface UsageStats {
  totalRequests: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  estimatedCostUSD: number
  lastUsed: number
}

const DEFAULT_SETTINGS = {
  model: 'MiniMax-M3',
  temperature: 0.7,
  max_tokens: 2048,
  top_p: 0.9,
  systemPrompt: 'You are a helpful AI assistant powered by MiniMax M3.',
}

function obfuscate(text: string): string {
  return btoa(encodeURIComponent(text))
}

function deobfuscate(encoded: string): string {
  try { return decodeURIComponent(atob(encoded)) } catch { return '' }
}

export const storage = {
  getProxyUrl(): string { return localStorage.getItem(STORAGE_KEYS.PROXY_URL) || '' },
  setProxyUrl(url: string) {
    if (url) localStorage.setItem(STORAGE_KEYS.PROXY_URL, url)
    else localStorage.removeItem(STORAGE_KEYS.PROXY_URL)
  },
  getApiKey(): string {
    const v = localStorage.getItem(STORAGE_KEYS.API_KEY)
    return v ? deobfuscate(v) : ''
  },
  setApiKey(key: string) {
    if (key) localStorage.setItem(STORAGE_KEYS.API_KEY, obfuscate(key))
    else localStorage.removeItem(STORAGE_KEYS.API_KEY)
  },
  getSettings() {
    const v = localStorage.getItem(STORAGE_KEYS.SETTINGS)
    if (!v) return DEFAULT_SETTINGS
    try { return { ...DEFAULT_SETTINGS, ...JSON.parse(v) } } catch { return DEFAULT_SETTINGS }
  },
  setSettings(s: typeof DEFAULT_SETTINGS) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(s))
  },
  getUsage(): UsageStats {
    const v = localStorage.getItem(STORAGE_KEYS.USAGE)
    if (!v) return { totalRequests: 0, totalTokens: 0, promptTokens: 0, completionTokens: 0, estimatedCostUSD: 0, lastUsed: 0 }
    try { return JSON.parse(v) } catch { return { totalRequests: 0, totalTokens: 0, promptTokens: 0, completionTokens: 0, estimatedCostUSD: 0, lastUsed: 0 } }
  },
  addUsage(promptTokens: number, completionTokens: number) {
    const current = this.getUsage()
    const COST_PER_1K_INPUT = 0.001
    const COST_PER_1K_OUTPUT = 0.002
    const cost = (promptTokens / 1000) * COST_PER_1K_INPUT + (completionTokens / 1000) * COST_PER_1K_OUTPUT
    const updated: UsageStats = {
      totalRequests: current.totalRequests + 1,
      totalTokens: current.totalTokens + promptTokens + completionTokens,
      promptTokens: current.promptTokens + promptTokens,
      completionTokens: current.completionTokens + completionTokens,
      estimatedCostUSD: current.estimatedCostUSD + cost,
      lastUsed: Date.now(),
    }
    localStorage.setItem(STORAGE_KEYS.USAGE, JSON.stringify(updated))
    return updated
  },
  resetUsage() { localStorage.removeItem(STORAGE_KEYS.USAGE) },
}

export async function chat(messages: ChatMessage[], options?: { signal?: AbortSignal }): Promise<ChatResponse> {
  const settings = storage.getSettings()
  const proxyUrl = storage.getProxyUrl()
  const apiKey = storage.getApiKey()

  if (!proxyUrl) return demoMode(messages, settings)

  const body: ChatRequest = {
    model: settings.model,
    messages,
    temperature: settings.temperature,
    max_tokens: settings.max_tokens,
    top_p: settings.top_p,
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers['X-User-Api-Key'] = apiKey

  const res = await fetch(proxyUrl, {
    method: 'POST', headers, body: JSON.stringify(body), signal: options?.signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Proxy error ${res.status}: ${text || res.statusText}`)
  }
  return (await res.json()) as ChatResponse
}

async function demoMode(messages: ChatMessage[], settings: ReturnType<typeof storage.getSettings>): Promise<ChatResponse> {
  const last = messages.filter((m) => m.role === 'user').slice(-1)[0]
  const userText = last?.content || ''

  const reply = `**Demo Mode Active**\n\nYou said: "${userText.slice(0, 200)}"\n\nNo proxy backend is configured yet. To use real MiniMax M3 responses, go to **Settings** and set your proxy URL.\n\nIn demo mode I cannot answer your question - I can only confirm that the UI, the request shape, and the security boundaries are all working correctly.\n\n**Your configured model:** \`${settings.model}\`\n**Temperature:** ${settings.temperature}\n**Max tokens:** ${settings.max_tokens}\n\nSee the **Backend Guide** page for the FastAPI proxy code you can deploy.`

  return {
    id: `demo-${Date.now()}`,
    choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }
}

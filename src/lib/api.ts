/**
 * Secure API client for MiniMax M3
 *
 * SECURITY PATTERNS IMPLEMENTED:
 * 1. API key is never sent to a third party (only to the configured proxy)
 * 2. Keys are stored in localStorage with simple obfuscation (NOT encryption -
 *    real protection comes from the proxy server holding the master key)
 * 3. All requests go through a configurable backend proxy endpoint
 * 4. No keys in URLs, logs, or error messages
 *
 * STREAMING (Phase 1):
 * - `chat()` returns the full response as JSON (non-streaming).
 * - `chatStream()` returns an AsyncIterable<string> of text tokens, parsed
 *   from the proxy's `text/event-stream` response. Use this for live typing.
 */

import { parseSSE, extractDeltaText } from './sse'

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

/**
 * Lightweight obfuscation - NOT encryption. The real security is the proxy server.
 * This just prevents casual shoulder-surfing of the localStorage.
 */
function obfuscate(text: string): string {
  return btoa(encodeURIComponent(text))
}

function deobfuscate(encoded: string): string {
  try {
    return decodeURIComponent(atob(encoded))
  } catch {
    return ''
  }
}

export const storage = {
  getProxyUrl(): string {
    return localStorage.getItem(STORAGE_KEYS.PROXY_URL) || ''
  },
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
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(v) }
    } catch {
      return DEFAULT_SETTINGS
    }
  },
  setSettings(s: typeof DEFAULT_SETTINGS) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(s))
  },

  getUsage(): UsageStats {
    const v = localStorage.getItem(STORAGE_KEYS.USAGE)
    if (!v)
      return {
        totalRequests: 0,
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        estimatedCostUSD: 0,
        lastUsed: 0,
      }
    try {
      return JSON.parse(v)
    } catch {
      return {
        totalRequests: 0,
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        estimatedCostUSD: 0,
        lastUsed: 0,
      }
    }
  },
  addUsage(promptTokens: number, completionTokens: number) {
    const current = this.getUsage()
    // M3 indicative pricing (replace with your real plan rates)
    const COST_PER_1K_INPUT = 0.001
    const COST_PER_1K_OUTPUT = 0.002
    const cost =
      (promptTokens / 1000) * COST_PER_1K_INPUT +
      (completionTokens / 1000) * COST_PER_1K_OUTPUT

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
  resetUsage() {
    localStorage.removeItem(STORAGE_KEYS.USAGE)
  },
}

/**
 * Send a chat completion request through the configured proxy.
 * If no proxy is configured, falls back to a clearly-labelled "demo mode"
 * that returns a static educational response - so the UI is testable.
 */
export async function chat(
  messages: ChatMessage[],
  options?: { signal?: AbortSignal }
): Promise<ChatResponse> {
  const settings = storage.getSettings()
  const proxyUrl = storage.getProxyUrl()
  const apiKey = storage.getApiKey()

  if (!proxyUrl) {
    return demoMode(messages, settings)
  }

  const body: ChatRequest = {
    model: settings.model,
    messages,
    temperature: settings.temperature,
    max_tokens: settings.max_tokens,
    top_p: settings.top_p,
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // The proxy receives the user-level key (if any) for per-user quotas.
  // The proxy itself uses a master M3 key from its own environment.
  if (apiKey) {
    headers['X-User-Api-Key'] = apiKey
  }

  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: options?.signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Proxy error ${res.status}: ${text || res.statusText}`)
  }

  return (await res.json()) as ChatResponse
}

/**
 * Stream a chat completion from the proxy as an AsyncIterable<string>.
 *
 * Yields each text token (the content of `choices[0].delta.content`) as it
 * arrives. Stops cleanly at the `data: [DONE]` sentinel. Throws on the
 * `event: error` SSE event, so consumers can wrap with try/catch.
 *
 * Falls back to `chat()` (and yields its full content as a single token)
 * when no proxy is configured, so the UI stays usable in demo mode.
 */
export async function* chatStream(
  messages: ChatMessage[],
  options?: { signal?: AbortSignal }
): AsyncGenerator<string, void, void> {
  const settings = storage.getSettings()
  const proxyUrl = storage.getProxyUrl()
  const apiKey = storage.getApiKey()

  if (!proxyUrl) {
    const res = await demoMode(messages, settings)
    yield res.choices[0]?.message?.content ?? ''
    return
  }

  const streamUrl = proxyUrl.replace(/\/+$/, '') + '/stream'

  const body: ChatRequest = {
    model: settings.model,
    messages,
    temperature: settings.temperature,
    max_tokens: settings.max_tokens,
    top_p: settings.top_p,
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  if (apiKey) headers['X-User-Api-Key'] = apiKey

  const res = await fetch(streamUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: options?.signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Proxy error ${res.status}: ${text || res.statusText}`)
  }

  for await (const evt of parseSSE(res.body)) {
    if (evt.event === 'error') {
      // Proxy reported a stream-level error.
      throw new Error(`Upstream error: ${evt.data}`)
    }
    if (evt.data === '[DONE]') return
    if (!evt.data) continue
    try {
      const token = extractDeltaText(JSON.parse(evt.data))
      if (token) yield token
    } catch {
      // Non-JSON data lines are ignored — proxies occasionally send heartbeats.
    }
  }
}

/**
 * Demo mode — only used when no proxy is configured.
 * It returns educational, non-M3 content so the UI can be exercised safely.
 */
async function demoMode(
  messages: ChatMessage[],
  settings: ReturnType<typeof storage.getSettings>
): Promise<ChatResponse> {
  const last = messages.filter((m) => m.role === 'user').slice(-1)[0]
  const userText = last?.content || ''

  const reply = `🛡️ **Demo Mode Active**

You said: *"${userText.slice(0, 200)}"*

No proxy backend is configured yet. To use real **MiniMax M3** responses, go to **Settings** and set your proxy URL (e.g. \`https://your-backend.example.com/v1/chat\`).

In demo mode I cannot answer your question - I can only confirm that the UI, the request shape, and the security boundaries are all working correctly.

**Your configured model:** \`${settings.model}\`
**Temperature:** ${settings.temperature}
**Max tokens:** ${settings.max_tokens}

See the **Backend Guide** page for the FastAPI proxy code you can deploy.`

  return {
    id: `demo-${Date.now()}`,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: reply },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }
}

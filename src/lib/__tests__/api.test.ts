import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { storage, chat, type ChatMessage } from '../api'

/**
 * Tests for the secure API client.
 *
 * These tests focus on:
 *   1. The storage layer (proxy URL, key, settings, usage) round-trips correctly
 *      and uses base64 obfuscation (not encryption) for the per-user key.
 *   2. The chat() function falls back to demo mode when no proxy is set,
 *      sends the correct headers/body when a proxy is set, and surfaces
 *      upstream errors without leaking them verbatim.
 */
describe('storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('proxyUrl', () => {
    it('returns empty string when nothing is stored', () => {
      expect(storage.getProxyUrl()).toBe('')
    })

    it('round-trips a URL', () => {
      storage.setProxyUrl('https://m3.example.com/v1/chat')
      expect(storage.getProxyUrl()).toBe('https://m3.example.com/v1/chat')
    })

    it('removes the URL when set to empty string', () => {
      storage.setProxyUrl('https://m3.example.com/v1/chat')
      storage.setProxyUrl('')
      expect(storage.getProxyUrl()).toBe('')
      expect(localStorage.getItem('m3.proxy_url')).toBeNull()
    })
  })

  describe('apiKey (base64-obfuscated)', () => {
    it('returns empty string when nothing is stored', () => {
      expect(storage.getApiKey()).toBe('')
    })

    it('round-trips a key without writing the plaintext to storage', () => {
      const secret = 'sk-abcdef1234567890'
      storage.setApiKey(secret)
      const raw = localStorage.getItem('m3.api_key')
      expect(raw).not.toBeNull()
      expect(raw).not.toContain('sk-abcdef')
      // round-trip
      expect(storage.getApiKey()).toBe(secret)
    })

    it('returns empty string when stored value is corrupted', () => {
      localStorage.setItem('m3.api_key', '!!!not-base64!!!')
      expect(storage.getApiKey()).toBe('')
    })

    it('removes the key when set to empty', () => {
      storage.setApiKey('sk-test')
      storage.setApiKey('')
      expect(localStorage.getItem('m3.api_key')).toBeNull()
    })
  })

  describe('settings', () => {
    it('returns defaults when nothing is stored', () => {
      const s = storage.getSettings()
      expect(s.model).toBe('MiniMax-M3')
      expect(s.temperature).toBe(0.7)
      expect(s.max_tokens).toBe(2048)
    })

    it('merges user overrides on top of defaults', () => {
      storage.setSettings({ model: 'MiniMax-M3', temperature: 0.2, max_tokens: 512, top_p: 0.5, systemPrompt: 'be terse' })
      const s = storage.getSettings()
      expect(s.temperature).toBe(0.2)
      expect(s.max_tokens).toBe(512)
      expect(s.systemPrompt).toBe('be terse')
    })

    it('falls back to defaults when stored JSON is malformed', () => {
      localStorage.setItem('m3.settings', '{not valid json')
      const s = storage.getSettings()
      expect(s.model).toBe('MiniMax-M3')
    })
  })

  describe('usage', () => {
    it('returns zeros when nothing is stored', () => {
      const u = storage.getUsage()
      expect(u.totalRequests).toBe(0)
      expect(u.totalTokens).toBe(0)
      expect(u.estimatedCostUSD).toBe(0)
    })

    it('accumulates tokens and a non-negative cost', () => {
      const a = storage.addUsage(1000, 500)
      expect(a.totalRequests).toBe(1)
      expect(a.promptTokens).toBe(1000)
      expect(a.completionTokens).toBe(500)
      expect(a.totalTokens).toBe(1500)
      // $0.001 per 1k input + $0.002 per 1k output = 0.001 + 0.001 = 0.002
      expect(a.estimatedCostUSD).toBeCloseTo(0.002, 6)
    })

    it('resetUsage clears the stored value', () => {
      storage.addUsage(10, 20)
      storage.resetUsage()
      const u = storage.getUsage()
      expect(u.totalRequests).toBe(0)
    })
  })
})

describe('chat()', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const messages: ChatMessage[] = [{ role: 'user', content: 'Hello M3' }]

  it('returns demo-mode response when no proxy URL is configured', async () => {
    const res = await chat(messages)
    expect(res.id).toMatch(/^demo-/)
    expect(res.choices[0].message.role).toBe('assistant')
    expect(res.choices[0].message.content).toContain('Demo Mode')
    expect(res.choices[0].message.content).toContain('Hello M3')
  })

  it('sends POST to the configured proxy with the right body and headers', async () => {
    storage.setProxyUrl('https://m3.example.com/v1/chat')
    storage.setApiKey('user-key-abc')
    storage.setSettings({ model: 'MiniMax-M3', temperature: 0.4, max_tokens: 256, top_p: 0.8, systemPrompt: 'sys' })

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'r1',
          choices: [{ index: 0, message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const res = await chat(messages)
    expect(res.choices[0].message.content).toBe('hi')
    expect(fetchMock).toHaveBeenCalledOnce()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://m3.example.com/v1/chat')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.headers['X-User-Api-Key']).toBe('user-key-abc')

    const body = JSON.parse(init.body)
    expect(body.model).toBe('MiniMax-M3')
    expect(body.temperature).toBe(0.4)
    expect(body.max_tokens).toBe(256)
    expect(body.top_p).toBe(0.8)
    expect(body.messages).toEqual(messages)
  })

  it('omits X-User-Api-Key when no per-user key is stored', async () => {
    storage.setProxyUrl('https://m3.example.com/v1/chat')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'r', choices: [], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await chat(messages)
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['X-User-Api-Key']).toBeUndefined()
  })

  it('throws on non-2xx response including the status', async () => {
    storage.setProxyUrl('https://m3.example.com/v1/chat')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 })),
    )
    await expect(chat(messages)).rejects.toThrow(/Proxy error 429/)
  })

  it('forwards an AbortSignal to fetch', async () => {
    storage.setProxyUrl('https://m3.example.com/v1/chat')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'r', choices: [], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const ctl = new AbortController()
    await chat(messages, { signal: ctl.signal })
    const [, init] = fetchMock.mock.calls[0]
    expect(init.signal).toBe(ctl.signal)
  })
})

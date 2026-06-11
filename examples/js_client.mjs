// examples/js_client.mjs
// Minimal JavaScript client for the M3 Secure Chat proxy.
// Works in Node 18+ (native fetch) and in the browser.
//
// Run:
//   PROXY=https://m3-proxy.example.com node js_client.mjs

const PROXY = (process.env.PROXY || 'http://localhost:8000').replace(/\/$/, '')
const USER_KEY = process.env.PER_USER_KEY || ''

async function chat(messages, options = {}) {
  const url = `${PROXY}/v1/chat`
  const headers = { 'Content-Type': 'application/json' }
  if (USER_KEY) headers['X-User-Api-Key'] = USER_KEY

  const body = {
    model: 'MiniMax-M3',
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 512,
    top_p: options.topP ?? 0.9,
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Proxy error ${res.status}: ${text || res.statusText}`)
  }
  return res.json()
}

const messages = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Say hello in three languages.' },
]

try {
  const data = await chat(messages)
  const reply = data.choices[0].message.content
  const usage = data.usage || {}
  console.log('--- assistant ---')
  console.log(reply)
  console.log('--- usage ---')
  console.log(`prompt=${usage.prompt_tokens} completion=${usage.completion_tokens} total=${usage.total_tokens}`)
} catch (err) {
  console.error('Request failed:', err.message)
  process.exit(1)
}

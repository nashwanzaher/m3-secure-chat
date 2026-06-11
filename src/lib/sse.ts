/**
 * Minimal Server-Sent Events (SSE) parser for the M3 streaming endpoint.
 *
 * Works in both browser (uses ReadableStream from fetch response.body) and
 * Node test environments (you can `feed()` chunks directly).
 *
 * Usage in the browser:
 *   const res = await fetch(url, { method: 'POST', body: ... })
 *   for await (const evt of parseSSE(res.body!)) {
 *     if (evt.event === 'error') throw new Error(evt.data)
 *     if (evt.data === '[DONE]') break
 *     const chunk = JSON.parse(evt.data)
 *     yield chunk.choices?.[0]?.delta?.content ?? ''
 *   }
 */

export interface SSEEvent {
  /** Event name. Defaults to "message" when the server omits the field. */
  event: string
  /** The raw payload of the `data:` line(s), joined with "\n". */
  data: string
  /** Optional SSE id (from `id:` lines). */
  id?: string
}

/**
 * Async-iterable SSE parser over a ReadableStream<Uint8Array>.
 *
 * Decodes UTF-8, splits on \n\n (event boundary) and on \n (within an event).
 * Skips SSE comment lines (those starting with `:`) and unknown fields.
 */
export async function* parseSSE(
  stream: ReadableStream<Uint8Array> | null | undefined
): AsyncGenerator<SSEEvent, void, void> {
  if (!stream) return

  const reader = stream.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // Events are separated by a blank line.
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const event = parseEvent(raw)
        if (event) yield event
        boundary = buffer.indexOf('\n\n')
      }
    }
    // Flush any trailing event that didn't end with a blank line.
    if (buffer.trim().length > 0) {
      const event = parseEvent(buffer)
      if (event) yield event
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // already released
    }
  }
}

/**
 * Test-friendly parser. Splits a raw string into SSE events. Useful for
 * asserting chunking behaviour in unit tests.
 */
export function* parseSSEChunk(chunk: string): Generator<SSEEvent, void, void> {
  // Normalise CRLF to LF.
  const text = chunk.replace(/\r\n/g, '\n')
  const events = text.split('\n\n')
  for (const ev of events) {
    const event = parseEvent(ev)
    if (event) yield event
  }
}

function parseEvent(raw: string): SSEEvent | null {
  const lines = raw.split('\n')
  const dataLines: string[] = []
  let event = 'message'
  let id: string | undefined

  for (const line of lines) {
    if (!line) continue
    // Comment lines start with a colon — ignore.
    if (line.startsWith(':')) continue
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const field = line.slice(0, colon)
    let value = line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    switch (field) {
      case 'event':
        event = value
        break
      case 'data':
        dataLines.push(value)
        break
      case 'id':
        id = value
        break
      // retry, etc. — ignored
    }
  }

  if (dataLines.length === 0 && event === 'message') return null
  return { event, data: dataLines.join('\n'), id }
}

/**
 * Extract the text content from an OpenAI-style streaming chunk.
 * Returns '' if the chunk has no delta.content.
 */
export function extractDeltaText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const p = payload as { choices?: Array<{ delta?: { content?: string } }> }
  return p.choices?.[0]?.delta?.content ?? ''
}

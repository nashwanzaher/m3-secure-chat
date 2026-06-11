import { describe, expect, it } from 'vitest'
import { parseSSEChunk, extractDeltaText, type SSEEvent } from '../sse'

function collect(gen: Iterable<SSEEvent> | AsyncIterable<SSEEvent>): SSEEvent[] {
  const out: SSEEvent[] = []
  for (const v of gen as Iterable<SSEEvent>) out.push(v)
  return out
}

describe('parseSSEChunk', () => {
  it('parses a single complete event', () => {
    const chunk = 'data: hello\n\n'
    const events = collect(parseSSEChunk(chunk))
    expect(events).toEqual([{ event: 'message', data: 'hello' }])
  })

  it('parses multiple events separated by blank lines', () => {
    const chunk =
      'data: first\n\ndata: second\n\ndata: third\n\n'
    const events = collect(parseSSEChunk(chunk))
    expect(events.map((e) => e.data)).toEqual(['first', 'second', 'third'])
  })

  it('recognises explicit event names', () => {
    const chunk = 'event: error\ndata: oops\n\ndata: ok\n\n'
    const events = collect(parseSSEChunk(chunk))
    expect(events[0]).toEqual({ event: 'error', data: 'oops' })
    expect(events[1]).toEqual({ event: 'message', data: 'ok' })
  })

  it('joins multi-line data fields with newlines', () => {
    const chunk = 'data: line1\ndata: line2\n\n'
    const events = collect(parseSSEChunk(chunk))
    expect(events[0].data).toBe('line1\nline2')
  })

  it('captures the SSE id field', () => {
    const chunk = 'id: 42\ndata: hello\n\n'
    const events = collect(parseSSEChunk(chunk))
    expect(events[0].id).toBe('42')
    expect(events[0].data).toBe('hello')
  })

  it('ignores SSE comment lines (heartbeats)', () => {
    const chunk = ': ping\n\ndata: real\n\n'
    const events = collect(parseSSEChunk(chunk))
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe('real')
  })

  it('normalises CRLF line endings', () => {
    const chunk = 'data: hello\r\n\r\ndata: world\r\n\r\n'
    const events = collect(parseSSEChunk(chunk))
    expect(events.map((e) => e.data)).toEqual(['hello', 'world'])
  })

  it('strips a single leading space after the colon (SSE spec)', () => {
    const chunk = 'data:   leading space\n\n'
    const events = collect(parseSSEChunk(chunk))
    expect(events[0].data).toBe('  leading space')
  })

  it('handles a trailing event without the final blank line', () => {
    const chunk = 'data: first\n\ndata: second'
    const events = collect(parseSSEChunk(chunk))
    expect(events.map((e) => e.data)).toEqual(['first', 'second'])
  })

  it('ignores unknown field names', () => {
    const chunk = 'retry: 3000\ndata: hello\n\n'
    const events = collect(parseSSEChunk(chunk))
    expect(events[0].data).toBe('hello')
  })

  it('recognises the [DONE] sentinel as data', () => {
    const chunk = 'data: [DONE]\n\n'
    const events = collect(parseSSEChunk(chunk))
    expect(events[0].data).toBe('[DONE]')
  })
})

describe('extractDeltaText', () => {
  it('extracts content from a valid OpenAI-style chunk', () => {
    const chunk = {
      choices: [{ delta: { content: 'Hello' }, index: 0 }],
    }
    expect(extractDeltaText(chunk)).toBe('Hello')
  })

  it('returns empty string when no delta content', () => {
    expect(extractDeltaText({ choices: [{ delta: {}, index: 0 }] })).toBe('')
    expect(extractDeltaText({ choices: [] })).toBe('')
  })

  it('returns empty string for malformed payloads', () => {
    expect(extractDeltaText(null)).toBe('')
    expect(extractDeltaText(undefined)).toBe('')
    expect(extractDeltaText('not an object')).toBe('')
    expect(extractDeltaText(123)).toBe('')
  })
})

import { useEffect, useState } from 'react'

/**
 * Tiny markdown renderer for assistant messages.
 * Supports: bold, italic, inline code, fenced code blocks, headings, lists, links.
 * Uses no external dependency to keep the bundle small.
 */
export function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text)
  return (
    <div className="prose prose-invert max-w-none">
      {blocks.map((b, i) => renderBlock(b, i))}
    </div>
  )
}

type Block =
  | { type: 'code'; lang?: string; content: string }
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'para'; text: string }
  | { type: 'blank' }

function parseBlocks(text: string): Block[] {
  const lines = text.split('\n')
  const out: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim() || undefined
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        buf.push(lines[i])
        i++
      }
      i++
      out.push({ type: 'code', lang, content: buf.join('\n') })
      continue
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      out.push({
        type: 'heading',
        level: h[1].length as 1 | 2 | 3,
        text: h[2],
      })
      i++
      continue
    }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''))
        i++
      }
      out.push({ type: 'ul', items })
      continue
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''))
        i++
      }
      out.push({ type: 'ol', items })
      continue
    }
    if (line.trim() === '') {
      out.push({ type: 'blank' })
      i++
      continue
    }
    const para: string[] = [line]
    i++
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('```') &&
      !/^#{1,3}\s+/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i])
      i++
    }
    out.push({ type: 'para', text: para.join('\n') })
  }
  return out
}

function renderInline(s: string) {
  const parts: (string | JSX.Element)[] = []
  let i = 0
  let key = 0
  const pushText = (t: string) => {
    if (t) parts.push(t)
  }
  while (i < s.length) {
    if (s[i] === '`') {
      const end = s.indexOf('`', i + 1)
      if (end !== -1) {
        parts.push(
          <code key={`c${key++}`} className="px-1.5 py-0.5 rounded bg-slate-800/60 text-blue-300 text-[0.9em]">
            {s.slice(i + 1, end)}
          </code>
        )
        i = end + 1
        continue
      }
    }
    if (s[i] === '*' && s[i + 1] === '*') {
      const end = s.indexOf('**', i + 2)
      if (end !== -1) {
        parts.push(<strong key={`b${key++}`}>{s.slice(i + 2, end)}</strong>)
        i = end + 2
        continue
      }
    }
    if (s[i] === '*') {
      const end = s.indexOf('*', i + 1)
      if (end !== -1) {
        parts.push(<em key={`i${key++}`}>{s.slice(i + 1, end)}</em>)
        i = end + 1
        continue
      }
    }
    if (s[i] === '[') {
      const close = s.indexOf(']', i + 1)
      const paren = close !== -1 ? s.indexOf('(', close + 1) : -1
      const end = paren !== -1 ? s.indexOf(')', paren + 1) : -1
      if (close !== -1 && paren === close + 1 && end !== -1) {
        parts.push(
          <a
            key={`a${key++}`}
            href={s.slice(paren + 1, end)}
            target="_blank"
            rel="noreferrer"
            className="text-blue-400 underline hover:text-blue-300"
          >
            {s.slice(i + 1, close)}
          </a>
        )
        i = end + 1
        continue
      }
    }
    let next = s.length
    for (const ch of ['`', '**', '*', '[']) {
      const idx = s.indexOf(ch, i + 1)
      if (idx !== -1 && idx < next) next = idx
    }
    pushText(s.slice(i, next))
    i = next
  }
  return parts
}

function renderBlock(b: Block, i: number) {
  switch (b.type) {
    case 'code':
      return <CodeBlock key={i} code={b.content} lang={b.lang} />
    case 'heading':
      if (b.level === 1)
        return (
          <h1 key={i} className="text-2xl font-bold mt-4 mb-2">
            {renderInline(b.text)}
          </h1>
        )
      if (b.level === 2)
        return (
          <h2 key={i} className="text-xl font-semibold mt-3 mb-2">
            {renderInline(b.text)}
          </h2>
        )
      return (
        <h3 key={i} className="text-lg font-semibold mt-3 mb-1.5">
          {renderInline(b.text)}
        </h3>
      )
    case 'ul':
      return (
        <ul key={i} className="list-disc pl-6 my-2 space-y-1">
          {b.items.map((it, j) => (
            <li key={j}>{renderInline(it)}</li>
          ))}
        </ul>
      )
    case 'ol':
      return (
        <ol key={i} className="list-decimal pl-6 my-2 space-y-1">
          {b.items.map((it, j) => (
            <li key={j}>{renderInline(it)}</li>
          ))}
        </ol>
      )
    case 'para':
      return (
        <p key={i} className="my-2 leading-relaxed">
          {renderInline(b.text)}
        </p>
      )
    case 'blank':
      return <div key={i} className="h-2" />
  }
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative my-3 rounded-lg overflow-hidden border border-slate-700 bg-slate-950/80">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/60 border-b border-slate-700 text-xs text-slate-400">
        <span>{lang || 'code'}</span>
        <button
          className="hover:text-slate-100"
          onClick={() => {
            navigator.clipboard.writeText(code)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-3 text-sm overflow-x-auto text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  )
}

export function useTypewriter(text: string, speed = 12) {
  const [out, setOut] = useState('')
  useEffect(() => {
    setOut('')
    let i = 0
    const id = setInterval(() => {
      i += 3
      setOut(text.slice(0, i))
      if (i >= text.length) clearInterval(id)
    }, speed)
    return () => clearInterval(id)
  }, [text, speed])
  return out
}

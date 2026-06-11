import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Markdown } from '../markdown'

describe('Markdown', () => {
  it('renders a heading', () => {
    render(<Markdown text="# Hello" />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toBe('Hello')
  })

  it('renders h2 and h3 correctly', () => {
    render(<Markdown text={'## Two\n\n### Three'} />)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Two')
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Three')
  })

  it('renders unordered and ordered lists', () => {
    const { container } = render(<Markdown text={'- a\n- b\n\n1. one\n2. two'} />)
    expect(container.querySelectorAll('ul > li').length).toBe(2)
    expect(container.querySelectorAll('ol > li').length).toBe(2)
  })

  it('renders a fenced code block with the language label', () => {
    const { container } = render(<Markdown text={'```ts\nconst x = 1\n```'} />)
    expect(screen.getByText('ts')).toBeInTheDocument()
    expect(container.querySelector('pre code')?.textContent).toBe('const x = 1')
  })

  it('renders inline bold and italic', () => {
    render(<Markdown text="some **bold** and *italic* text" />)
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByText('italic').tagName).toBe('EM')
  })

  it('renders inline code with a <code> element', () => {
    const { container } = render(<Markdown text="use `pnpm install` first" />)
    expect(container.querySelector('code')?.textContent).toBe('pnpm install')
  })

  it('renders links as anchor tags with target=_blank', () => {
    render(<Markdown text="visit [GitHub](https://github.com) now" />)
    const a = screen.getByRole('link', { name: 'GitHub' })
    expect(a).toHaveAttribute('href', 'https://github.com')
    expect(a).toHaveAttribute('target', '_blank')
    expect(a).toHaveAttribute('rel', 'noreferrer')
  })

  it('does not crash on empty input', () => {
    const { container } = render(<Markdown text="" />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders paragraphs separated by blank lines', () => {
    render(<Markdown text={'first paragraph\n\nsecond paragraph'} />)
    expect(screen.getByText('first paragraph')).toBeInTheDocument()
    expect(screen.getByText('second paragraph')).toBeInTheDocument()
  })
})

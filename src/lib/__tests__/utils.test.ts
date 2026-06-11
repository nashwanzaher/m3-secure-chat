import { describe, it, expect } from 'vitest'
import { cn } from '../utils'

describe('cn (className utility)', () => {
  it('merges simple class names', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('ignores falsy values', () => {
    expect(cn('a', false, null, undefined, 0, 'b')).toBe('a b')
  })

  it('deduplicates tailwind classes (last one wins)', () => {
    // tailwind-merge resolves conflicts: p-2 and p-4 -> p-4
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })

  it('handles arrays and objects from clsx', () => {
    expect(cn(['a', 'b'], { c: true, d: false })).toBe('a b c')
  })
})

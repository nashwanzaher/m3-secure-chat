/**
 * Vitest global setup.
 *
 * - Imports jest-dom matchers so we can use toBeInTheDocument, etc.
 * - Mocks browser APIs that jsdom does not provide (matchMedia, clipboard).
 * - Resets localStorage between tests.
 */
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'

// jsdom does not implement matchMedia
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

// Clipboard mock (jsdom's is limited)
if (typeof navigator !== 'undefined' && !navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  })
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

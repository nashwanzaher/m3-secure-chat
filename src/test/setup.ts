/**
 * Vitest global setup.
 *
 * - Manually registers `@testing-library/jest-dom` matchers with
 *   vitest's `expect.extend`. This avoids the bare `import 'vitest'`
 *   inside jest-dom's vitest.mjs subpath, which breaks under pnpm's
 *   strict isolated `node_modules` layout.
 * - Mocks browser APIs that jsdom does not provide (matchMedia, clipboard).
 * - Resets localStorage between tests.
 */
import { expect, afterEach, beforeEach, vi } from 'vitest'
import * as matchers from '@testing-library/jest-dom/matchers'

expect.extend(matchers)

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

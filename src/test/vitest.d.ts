/// <reference types="@testing-library/jest-dom" />
/// <reference types="vitest" />

// This file teaches TypeScript about the extra matchers
// (`toBeInTheDocument`, `toHaveAttribute`, etc.) that are registered
// at runtime in `./setup.ts` via `expect.extend(...)`.
//
// We deliberately do NOT use the bare `import '@testing-library/jest-dom/vitest'`
// from the test files themselves, because under pnpm's strict isolated
// `node_modules` layout that subpath resolves to a separate folder where
// the `vitest` peer cannot be found. Registering the matchers manually
// in setup.ts avoids that path entirely.
export {}

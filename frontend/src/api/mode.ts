// Fixtures are a development-only demo mode. Production bundles always use the
// server API even if a stale deployment environment still defines this flag.
export const usingMockApi = import.meta.env.DEV && import.meta.env.VITE_API_MOCK === 'true'

// Component tests keep deterministic fixtures inside the feature adapters, so a
// surface that has no server yet renders in tests and in the demo — and nowhere
// else. Outside these two modes a fixture-only surface returns nothing, and a
// section with nothing to show does not render.
export const usingFixtures = usingMockApi || import.meta.env.MODE === 'test'

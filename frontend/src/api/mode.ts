// Fixtures are a development-only demo mode. Production bundles always use the
// server API even if a stale deployment environment still defines this flag.
export const usingMockApi = import.meta.env.DEV && import.meta.env.VITE_API_MOCK === 'true'

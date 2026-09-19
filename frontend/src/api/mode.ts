// Component tests use fixtures by default. A few transport-focused tests mock this
// value off to exercise the live adapter path. Feature adapters also guard it with a
// direct import.meta.env.MODE check so production builds can erase fixture branches.
export const testFixturesEnabled = true

const LATENCY_MS = 220

export function mockRequest<T>(produce: () => T, delay = LATENCY_MS): Promise<T> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(produce()), delay)
  })
}

export function paginate<T>(rows: T[], page: number, size: number) {
  const start = (page - 1) * size
  return {
    rows: rows.slice(start, start + size),
    total: rows.length,
    page,
    size,
    pages: Math.max(1, Math.ceil(rows.length / size)),
  }
}

export type Page<T> = ReturnType<typeof paginate<T>>

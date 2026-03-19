/** Shared PostgREST retry for gateway timeouts / transient errors. */

export type SupabaseQueryError = { message: string; code?: string; details?: string } | null

export async function supabaseQueryWithRetry<T>(
  label: string,
  fetcher: () => Promise<{ data: T; error: SupabaseQueryError }>,
  maxAttempts = 3,
): Promise<{ data: T; error: SupabaseQueryError }> {
  let last: { data: T; error: SupabaseQueryError } | null = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      last = await fetcher()
    } catch (e) {
      last = {
        data: null as T,
        error: { message: e instanceof Error ? e.message : String(e) },
      }
    }
    if (!last.error) return last
    const msg = [last.error.message, last.error.code, last.error.details].filter(Boolean).join(' ')
    const retryable =
      /\b(502|503|504)\b|timeout|Timeout|ECONNRESET|ETIMEDOUT|fetch failed|gateway|Gateway/i.test(msg)
    if (!retryable || attempt === maxAttempts) {
      if (last.error) console.warn(`[${label}] failed after ${attempt} attempt(s):`, last.error)
      return last
    }
    const delayMs = 400 * attempt * attempt
    console.warn(`[${label}] transient error, retry ${attempt + 1}/${maxAttempts} in ${delayMs}ms`)
    await new Promise(r => setTimeout(r, delayMs))
  }
  return last!
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    }),
  ])
}

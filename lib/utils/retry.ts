const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Retries a flaky call (rate limits, transient network errors) with exponential backoff.
export async function withRetry<T>(
  run: () => Promise<T>,
  { attempts = 4, baseDelayMs = 1500 }: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts - 1) throw error;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
}

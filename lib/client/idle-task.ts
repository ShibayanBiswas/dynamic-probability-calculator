/** Run work after the browser has painted — keeps first interaction responsive. */
export function runWhenIdle(task: () => void, timeoutMs = 800) {
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(task, { timeout: timeoutMs });
    return;
  }
  window.setTimeout(task, 0);
}

/** Parse large JSON after paint — longer idle budget so Vercel cold loads stay responsive. */
export function parseJsonIdle<T>(raw: string): Promise<T> {
  return new Promise((resolve, reject) => {
    runWhenIdle(() => {
      try {
        resolve(JSON.parse(raw) as T);
      } catch (error) {
        reject(error);
      }
    }, 2_000);
  });
}

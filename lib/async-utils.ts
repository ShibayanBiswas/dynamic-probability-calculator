/** Run async work in the background without unhandledRejection noise. */
export function runInBackground(label: string, task: Promise<unknown>) {
  void task.catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[${label}] ${message}`);
  });
}

/** Reject when `promise` does not settle within `ms` (does not cancel the underlying work). */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = "operation"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

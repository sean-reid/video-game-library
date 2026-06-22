// Tiny indirection so error-paths in services can record a failure without
// the call site hardcoding `console.warn` / Sentry / Highlight / etc. Today
// it logs to the console; swap the implementation when a real telemetry
// pipeline lands and every existing call site picks it up for free.
//
// `scope` is a short snake.case identifier — `libraryStorage.load`,
// `gistApi.update`, `news.fetch` — used to group reports without leaking
// PII into the message itself.

export function reportError(scope: string, error: unknown): void {
  // Eat errors thrown by the reporter itself (e.g. console redefined to
  // throw, or a future telemetry SDK throwing on init). The application
  // path that called `reportError` is recoverable by definition — failing
  // its handler would be silently worse than the original silent catch.
  try {
    if (error instanceof Error) {
      console.warn(`[${scope}] ${error.message}`, error);
    } else {
      console.warn(`[${scope}]`, error);
    }
  } catch {
    /* never throw out of the reporter */
  }
}

export interface Env {
  RAWG_API_KEY: string;
  DEBUG?: string;
  /**
   * Comma-separated list of web origins that may call the worker. Falls back
   * to the built-in defaults (production GitHub Pages + localhost dev) when
   * unset.
   */
  ALLOWED_ORIGINS?: string;
}

export function isDebug(env: Env): boolean {
  return env.DEBUG === 'true';
}

// Dev defaults include localhost so `pnpm dev` Just Works. Prod must set
// ALLOWED_ORIGINS explicitly — see `allowedOrigins` for the assertion.
const DEV_ALLOWED_ORIGINS: readonly string[] = [
  'https://danrstaton.github.io',
  'https://sean-reid.github.io',
  'http://localhost:5173',
  'http://localhost:8000',
  'http://localhost:4173',
];

const PROD_DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  'https://danrstaton.github.io',
  'https://sean-reid.github.io',
];

// When DEBUG is off (i.e. prod), accept localhost origins ONLY if the
// codeowner has explicitly set ALLOWED_ORIGINS. Without that, prod refuses
// to echo `Access-Control-Allow-Origin` for `http://localhost:*` so a
// rogue dev tool on a user's machine can't poke our API.
export function allowedOrigins(env: Env): readonly string[] {
  if (env.ALLOWED_ORIGINS) {
    return env.ALLOWED_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return isDebug(env) ? DEV_ALLOWED_ORIGINS : PROD_DEFAULT_ALLOWED_ORIGINS;
}

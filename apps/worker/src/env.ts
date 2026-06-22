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

const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  'https://danrstaton.github.io',
  'https://sean-reid.github.io',
  'http://localhost:5173',
  'http://localhost:8000',
  'http://localhost:4173',
];

export function allowedOrigins(env: Env): readonly string[] {
  if (!env.ALLOWED_ORIGINS) return DEFAULT_ALLOWED_ORIGINS;
  return env.ALLOWED_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

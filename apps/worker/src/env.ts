export interface Env {
  RAWG_API_KEY: string;
  DEBUG?: string;
}

export function isDebug(env: Env): boolean {
  return env.DEBUG === 'true';
}

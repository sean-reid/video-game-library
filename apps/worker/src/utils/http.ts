export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
      ...init?.headers,
    },
  });
}

/**
 * Attach `Access-Control-Allow-Origin` to an existing response when the
 * caller's origin is in the allowlist. Mutates the response headers in place
 * and returns the same response for chaining.
 */
export function applyCorsOrigin(
  response: Response,
  origin: string | null,
  allowed: readonly string[],
): Response {
  if (origin && allowed.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  }
  return response;
}

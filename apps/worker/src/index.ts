export interface Env {
  RAWG_API_KEY: string;
  DEBUG?: string;
}

export default {
  fetch(): Response {
    return new Response(JSON.stringify({ ok: true, app: 'VGL News Worker', version: '0.0.0' }), {
      headers: { 'content-type': 'application/json' },
    });
  },
} satisfies ExportedHandler<Env>;

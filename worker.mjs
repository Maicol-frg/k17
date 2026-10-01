import { onRequest } from './functions/api/[[path]].js';

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      const path = pathname.slice('/api'.length).split('/').filter(Boolean);
      try {
        return await onRequest({ request, env, params: { path }, waitUntil: ctx.waitUntil.bind(ctx) });
      } catch (error) {
        console.error('K17 uncaught API error:', error?.stack || error?.message || String(error));
        return new Response(JSON.stringify({ error: 'K17 tuvo un error interno al procesar la solicitud.' }), {
          status: 500,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
        });
      }
    }
    return env.ASSETS.fetch(request);
  }
};

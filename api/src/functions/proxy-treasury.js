const { app } = require('@azure/functions');

app.http('proxy-treasury', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'proxy/treasury/{*path}',
  handler: async (request, context) => {
    const path = request.params.path || '';
    const query = request.url.includes('?') ? '?' + request.url.split('?')[1] : '';
    const target = `https://api.fiscaldata.treasury.gov/${path}${query}`;
    try {
      const res = await fetch(target, { signal: AbortSignal.timeout(20000) });
      const body = await res.text();
      return {
        status: res.status,
        headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
        body,
      };
    } catch (e) {
      return { status: 502, body: `Proxy error: ${e.message}` };
    }
  },
});

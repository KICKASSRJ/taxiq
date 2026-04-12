const { app } = require('@azure/functions');

app.http('proxy-amfi', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'proxy/amfi/{*path}',
  handler: async (request, context) => {
    const path = request.params.path || '';
    const target = `https://www.amfiindia.com/${path}`;
    try {
      const res = await fetch(target, { signal: AbortSignal.timeout(20000) });
      const body = await res.text();
      return {
        status: res.status,
        headers: { 'Content-Type': res.headers.get('content-type') || 'text/plain' },
        body,
      };
    } catch (e) {
      return { status: 502, body: `Proxy error: ${e.message}` };
    }
  },
});

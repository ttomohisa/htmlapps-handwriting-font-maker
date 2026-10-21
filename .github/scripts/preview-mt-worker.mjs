// Trusted selective isolation wrapper; never import executable code from PR artifacts.
const ISOLATED_ROUTES = new Set(['/index.mt.html', '/index.mt.self-extract.html']);
export default {
  async fetch(request, env) {
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 200) return asset;
    const response = new Response(asset.body, asset);
    response.headers.set('X-RC-Preview-Worker', 'active');
    if (ISOLATED_ROUTES.has(new URL(request.url).pathname)) {
      response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
      response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
    }
    return response;
  },
};

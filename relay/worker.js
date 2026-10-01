const UPSTREAM = 'https://us.i.posthog.com/batch/';
const PROJECT_KEY = 'phc_uD2banhuSNmNhc496TXp3yDo7RkVpUmfPCbSBzzEXwNT';
const PATH = '/e';
const MAX_BYTES = 1_000_000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const reply = (status, body = null) => new Response(body, { status, headers: CORS });

const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const forward = async (request) => {
  const body = await request.text();
  if (body.length > MAX_BYTES) return reply(413);
  if (parse(body)?.api_key !== PROJECT_KEY) return reply(403);
  const upstream = await fetch(UPSTREAM, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  return reply(upstream.status, await upstream.text());
};

const ROUTES = {
  OPTIONS: () => reply(204),
  POST: forward,
};

export default {
  fetch: (request) => {
    if (new URL(request.url).pathname !== PATH) return reply(404);
    return (ROUTES[request.method] ?? (() => reply(405)))(request);
  },
};

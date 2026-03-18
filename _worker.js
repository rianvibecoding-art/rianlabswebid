// Cloudflare Pages Advanced Mode Worker
// Handles POST /webhook/moota, passes everything else to static assets

// Parse ALLOWED_ORIGINS from env (comma-separated) — cached per-request
let _parsedOrigins = null;
let _parsedOriginsRaw = null;

const _metrics = {
  started_at: Date.now(),
  requests_total: 0,
  api_requests: 0,
  api_cache_hit: 0,
  api_cache_miss: 0,
  assets_cache_hit: 0,
  assets_cache_miss: 0,
  compressed: 0,
  rate_limited: 0
};

const _topPaths = new Map();
const _topApiActions = new Map();

const _blockedPaths = new Set([
  '/appscript.js',
  '/load_test.js',
  '/workers.ts',
  '/AUDIT_REPORT.md',
  '/SOP_DATA_CONSISTENCY.md',
  '/setup.js',
  '/validate-config.js',
  '/test-auth.js',
  '/test-sync.js',
  '/wrangler.jsonc',
  '/package.json',
  '/tailwind.config.js',
  '/tailwind.input.css'
]);

function inc(key, n = 1) {
  try { _metrics[key] = (_metrics[key] || 0) + n; } catch (e) { }
}

function mapIncLimited(map, key, limit = 50) {
  if (!key) return;
  const k = String(key);
  map.set(k, (map.get(k) || 0) + 1);
  if (map.size <= limit) return;
  let minKey = null;
  let minVal = Infinity;
  for (const [kk, vv] of map.entries()) {
    if (vv < minVal) {
      minVal = vv;
      minKey = kk;
    }
  }
  if (minKey != null) map.delete(minKey);
}

function metricsAuthOk(request, env) {
  const token = env && env.METRICS_TOKEN ? String(env.METRICS_TOKEN) : '';
  if (!token) return true;
  const url = new URL(request.url);
  const q = url.searchParams.get('t') || '';
  if (q && q === token) return true;
  const h = request.headers.get('Authorization') || '';
  if (h && h.startsWith('Bearer ') && h.slice(7) === token) return true;
  return false;
}

function normalizePath(pathname) {
  try {
    const p = String(pathname || '');
    if (!p) return '/';
    if (p.length > 120) return p.slice(0, 120) + '…';
    return p;
  } catch (e) {
    return '/';
  }
}

function parseAllowedOrigins(env) {
  const raw = env.ALLOWED_ORIGINS || '';
  if (raw === _parsedOriginsRaw) return _parsedOrigins;
  _parsedOriginsRaw = raw;
  _parsedOrigins = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
  return _parsedOrigins;
}

export default {
  async fetch(request, env, ctx) {
    inc('requests_total');
    const url = new URL(request.url);
    mapIncLimited(_topPaths, normalizePath(url.pathname), 60);

    if (url.pathname === '/favicon.ico') {
      const headers = { 'Content-Type': 'image/x-icon', 'Cache-Control': 'public, max-age=86400' };
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === '/__worker_metrics') {
      if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
      if (!metricsAuthOk(request, env)) return new Response('Unauthorized', { status: 401 });
      const topPaths = Array.from(_topPaths.entries()).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => ({ path: k, count: v }));
      const topApiActions = Array.from(_topApiActions.entries()).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => ({ action: k, count: v }));
      const body = JSON.stringify({ status: 'ok', data: { ..._metrics, uptime_ms: Date.now() - _metrics.started_at } });
      return new Response(JSON.stringify({ status: 'ok', data: { ..._metrics, uptime_ms: Date.now() - _metrics.started_at, top_paths: topPaths, top_api_actions: topApiActions } }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }

    const pLower = String(url.pathname || '').toLowerCase();
    if (_blockedPaths.has(url.pathname) || _blockedPaths.has(pLower)) {
      return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    }

    if (url.pathname === '/api') {
      return handleApi(request, env, ctx);
    }

    if (url.pathname === '/health') {
      if (request.method !== 'GET') {
        return new Response(JSON.stringify({ status: 'error', message: 'Method Not Allowed. Use GET.' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json', 'Allow': 'GET' }
        });
      }
      return handleHealth(env, ctx);
    }

    // Route: POST /webhook/moota → Google Apps Script
    if (url.pathname === '/webhook/moota') {
      if (request.method !== 'POST') {
        return new Response(
          JSON.stringify({ status: 'error', message: 'Method Not Allowed. Use POST.' }),
          { status: 405, headers: { 'Content-Type': 'application/json', 'Allow': 'POST' } }
        );
      }
      return handleWebhook(request, env.MOOTA_GAS_URL, env.MOOTA_TOKEN);
    }

    if (request.method === 'GET') {
      const cacheable = isCacheableAssetPath(url.pathname);
      if (cacheable) {
        const cacheKey = new Request(url.toString(), { method: 'GET' });
        const cached = await caches.default.match(cacheKey);
        if (cached) {
          inc('assets_cache_hit');
          return maybeCompress(request, withMetricHeaders(cached, { 'x-edge-cache': 'HIT' }));
        }
        inc('assets_cache_miss');
        try {
          if (env.ASSETS) {
            const res = await env.ASSETS.fetch(request);
            const withHeaders = withMetricHeaders(res, { 'x-edge-cache': 'MISS' });
            if (res.ok) ctx.waitUntil(caches.default.put(cacheKey, withHeaders.clone()));
            return maybeCompress(request, withHeaders);
          }
        } catch (e) { }
      }
    }

    // Everything else → pass to static assets
    try {
      if (env.ASSETS) {
        return maybeCompress(request, await env.ASSETS.fetch(request));
      }
    } catch (e) {
      // fallback if ASSETS binding fails
    }

    // Final fallback: fetch the original URL directly
    return maybeCompress(request, await fetch(request));
  }
};

function corsHeadersFor(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = parseAllowedOrigins(env);
  const isPagesPreview = origin.endsWith('.pages.dev');
  let allowOrigin = (allowed.includes(origin) || isPagesPreview) ? origin : '';
  if (!allowOrigin && origin) {
    try {
      const reqUrl = new URL(request.url);
      const oUrl = new URL(origin);
      if (reqUrl.origin === oUrl.origin) allowOrigin = origin;
    } catch (_) { }
  }
  const headers = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Signature',
    'Access-Control-Max-Age': '86400'
  };
  if (allowOrigin) headers['Access-Control-Allow-Origin'] = allowOrigin;
  return headers;
}

async function handleApi(request, env, ctx) {
  inc('api_requests');
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeadersFor(request, env) });
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ status: 'error', message: 'Method Not Allowed. Use POST.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeadersFor(request, env), 'Allow': 'POST, OPTIONS' }
    });
  }

  const gasUrl = env.APP_GAS_URL || 'GANTI DENGAN GAS ANDA';
  if (!gasUrl) {
    return new Response(JSON.stringify({ status: 'error', message: 'Missing environment variable (APP_GAS_URL)' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeadersFor(request, env) }
    });
  }

  try {
    const requestId = request.headers.get('x-request-id') || ('api_' + Date.now() + '_' + Math.random().toString(16).slice(2));
    const body = await request.text();
    const contentType = request.headers.get('Content-Type') || 'application/json';

    const softLimit = Number(env.API_RPM_SOFT_LIMIT || 0);
    if (softLimit > 0) {
      const ok = softRateLimitOk(request, softLimit);
      if (!ok) {
        inc('rate_limited');
        return new Response(JSON.stringify({ status: 'error', message: 'Rate limited' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', ...corsHeadersFor(request, env), 'Retry-After': '30' }
        });
      }
    }

    const cacheTtls = getApiCacheTtls(env);
    const cacheMeta = await tryGetCacheMeta(body);
    if (cacheMeta && cacheMeta.action) mapIncLimited(_topApiActions, cacheMeta.action, 80);
    const ttl = cacheMeta ? cacheTtls[cacheMeta.action] : 0;
    if (ttl > 0 && request.method === 'POST') {
      const cacheKey = await buildApiCacheKey(request.url, cacheMeta.action, cacheMeta.key);
      const cached = await caches.default.match(cacheKey);
      if (cached) {
        inc('api_cache_hit');
        return withMetricHeaders(cached, { 'x-api-cache': 'HIT' });
      }
      inc('api_cache_miss');
      const upstream = await fetchWithRetry(
        gasUrl,
        { method: 'POST', headers: { 'Content-Type': contentType }, body },
        { maxAttempts: 4, timeoutMs: 25000 }
      );

      const res = await normalizeApiUpstreamResponse(upstream, request, env, requestId);
      if (res.status < 500) {
        const cacheClone = res.clone();
        const cacheable = new Response(cacheClone.body, {
          status: res.status,
          statusText: res.statusText,
          headers: new Headers(res.headers)
        });
        cacheable.headers.set('Cache-Control', `public, max-age=0, s-maxage=${ttl}`);
        if (ctx) ctx.waitUntil(caches.default.put(cacheKey, cacheable));
      }
      return withMetricHeaders(res, { 'x-api-cache': 'MISS' });
    }

    const upstream = await fetchWithRetry(
      gasUrl,
      { method: 'POST', headers: { 'Content-Type': contentType }, body },
      { maxAttempts: 4, timeoutMs: 25000 }
    );

    return normalizeApiUpstreamResponse(upstream, request, env, requestId);
  } catch (e) {
    return new Response(JSON.stringify({ status: 'error', message: 'Upstream request failed: ' + String(e) }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Api-Contract': 'json-v1',
        ...corsHeadersFor(request, env)
      }
    });
  }
}

async function normalizeApiUpstreamResponse(upstream, request, env, requestId) {
  const cors = corsHeadersFor(request, env);
  const baseHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Api-Contract': 'json-v1',
    'X-Request-Id': String(requestId || ''),
    ...cors
  };

  let txt = '';
  try {
    txt = await upstream.text();
  } catch (e) {
    return new Response(JSON.stringify({
      status: 'error',
      message: 'Failed reading upstream response',
      upstream_status: upstream.status || 502,
      request_id: requestId
    }), { status: 502, headers: baseHeaders });
  }

  let parsed = null;
  try { parsed = JSON.parse(txt); } catch (e) { }

  if (!parsed || typeof parsed !== 'object') {
    const preview = String(txt || '').replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').slice(0, 180);
    return new Response(JSON.stringify({
      status: 'error',
      message: 'Invalid upstream JSON response',
      upstream_status: upstream.status || 502,
      request_id: requestId,
      preview
    }), { status: 502, headers: baseHeaders });
  }

  if (!Object.prototype.hasOwnProperty.call(parsed, 'status')) {
    parsed = {
      status: upstream.ok ? 'success' : 'error',
      data: parsed,
      request_id: requestId
    };
  }

  return new Response(JSON.stringify(parsed), {
    status: upstream.status || 200,
    headers: baseHeaders
  });
}

async function handleHealth(env, ctx) {
  const startedAt = Date.now();
  const gasUrl = env.MOOTA_GAS_URL;
  if (!gasUrl) {
    return new Response(JSON.stringify({ status: 'ok', upstream: 'not_configured' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  try {
    const cacheKey = new Request('https://local.health/cache', { method: 'GET' });
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached;
    const res = await fetchWithRetry(gasUrl, { method: 'GET' }, { maxAttempts: 3, timeoutMs: 8000 });
    const ms = Date.now() - startedAt;
    const out = new Response(JSON.stringify({ status: 'ok', upstream: res.ok ? 'ok' : 'degraded', upstream_status: res.status, latency_ms: ms }), {
      status: res.ok ? 200 : 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=0, s-maxage=30' }
    });
    if (ctx) ctx.waitUntil(caches.default.put(cacheKey, out.clone()));
    return out;
  } catch (e) {
    const ms = Date.now() - startedAt;
    return new Response(JSON.stringify({ status: 'error', upstream: 'down', latency_ms: ms, message: String(e) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function calcDelay(attempt) {
  const base = Math.min(8000, 250 * 2 ** (attempt - 1));
  return Math.round(base * (0.6 + Math.random() * 0.8));
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || status === 522 || status === 524;
}

async function fetchWithRetry(url, init, opts) {
  const maxAttempts = Math.max(1, Number(opts?.maxAttempts ?? 3));
  const timeoutMs = Math.max(1, Number(opts?.timeoutMs ?? 25000));
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let controller;
    let timeoutId;
    try {
      const requestInit = init ? { ...init } : {};
      if (!requestInit.signal && typeof AbortController !== 'undefined') {
        controller = new AbortController();
        requestInit.signal = controller.signal;
        timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      }
      const res = await fetch(url, requestInit);
      if (timeoutId) clearTimeout(timeoutId);
      if ((!res.ok) && isRetryableStatus(res.status) && attempt < maxAttempts) {
        await sleep(calcDelay(attempt));
        continue;
      }
      return res;
    } catch (e) {
      if (timeoutId) clearTimeout(timeoutId);
      lastErr = e;
      if (attempt < maxAttempts) {
        await sleep(calcDelay(attempt));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr || new Error('fetch failed');
}

function isCacheableAssetPath(pathname) {
  const p = (pathname || '').toLowerCase();
  if (!p) return false;
  if (p === '/' || p.endsWith('.html')) return false;
  return (
    p.endsWith('.css') ||
    p.endsWith('.js') ||
    p.endsWith('.mjs') ||
    p.endsWith('.json') ||
    p.endsWith('.svg') ||
    p.endsWith('.png') ||
    p.endsWith('.jpg') ||
    p.endsWith('.jpeg') ||
    p.endsWith('.webp') ||
    p.endsWith('.ico') ||
    p.endsWith('.woff2') ||
    p.endsWith('.woff') ||
    p.endsWith('.ttf')
  );
}

function withMetricHeaders(response, extra) {
  try {
    const headers = new Headers(response.headers);
    if (extra) Object.keys(extra).forEach(k => headers.set(k, extra[k]));
    headers.set('x-worker', 'pages-advanced');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (e) {
    return response;
  }
}

async function tryGetCacheMeta(bodyText) {
  if (!bodyText) return null;
  const t = String(bodyText).trim();
  if (!t || t[0] !== '{') return null;
  try {
    const obj = JSON.parse(t);
    const action = String(obj?.action || '');
    if (!action) return null;
    const keyObj = Object.assign({}, obj);
    delete keyObj.rid;
    delete keyObj.ts;
    delete keyObj.nonce;
    return { action, key: keyObj };
  } catch (e) {
    return null;
  }
}

function getApiCacheTtls(env) {
  const defaults = {
    get_global_settings: 300,
    get_products: 60,
    get_product: 60,
    get_page_content: 60,
    get_pages: 120,
    get_bio_link: 60,
    get_sync_state: 10
  };
  try {
    const raw = env.API_CACHE_TTLS_JSON;
    if (!raw) return defaults;
    const parsed = JSON.parse(String(raw));
    if (!parsed || typeof parsed !== 'object') return defaults;
    return { ...defaults, ...parsed };
  } catch (e) {
    return defaults;
  }
}

async function buildApiCacheKey(requestUrl, action, keyObj) {
  const u = new URL(requestUrl);
  const payload = JSON.stringify(keyObj || {});
  const hash = await sha256Base64Url(payload);
  u.searchParams.set('a', String(action || ''));
  u.searchParams.set('k', hash);
  return new Request(u.toString(), { method: 'GET' });
}

async function sha256Base64Url(text) {
  const data = new TextEncoder().encode(String(text || ''));
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function maybeCompress(request, response) {
  try {
    const ae = (request.headers.get('Accept-Encoding') || '').toLowerCase();
    if (!ae.includes('gzip')) return response;
    const already = response.headers.get('Content-Encoding');
    if (already) return response;
    const ct = (response.headers.get('Content-Type') || '').toLowerCase();
    if (!(ct.includes('application/json') || ct.includes('text/') || ct.includes('application/javascript') || ct.includes('text/css'))) return response;
    const cs = new CompressionStream('gzip');
    const headers = new Headers(response.headers);
    headers.set('Content-Encoding', 'gzip');
    headers.delete('Content-Length');
    inc('compressed');
    return new Response(response.body.pipeThrough(cs), { status: response.status, statusText: response.statusText, headers });
  } catch (e) {
    return response;
  }
}

const _rl = new Map();
function softRateLimitOk(request, rpm) {
  try {
    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    const now = Date.now();
    const windowMs = 60000;
    const entry = _rl.get(ip) || { resetAt: now + windowMs, count: 0 };
    if (now > entry.resetAt) {
      entry.resetAt = now + windowMs;
      entry.count = 0;
    }
    entry.count++;
    _rl.set(ip, entry);
    return entry.count <= rpm;
  } catch (e) {
    return true;
  }
}

async function handleWebhook(request, gasUrl, token) {
  if (!gasUrl || !token) {
    return new Response(
      JSON.stringify({ status: 'error', message: 'Missing environment variables (GAS_URL or TOKEN)' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const signature = request.headers.get('Signature') || '';

    const targetUrl = new URL(gasUrl);
    targetUrl.searchParams.append('token', token);
    targetUrl.searchParams.append('moota_signature', signature);

    const body = await request.text();

    let response;
    try {
      response = await fetchWithRetry(targetUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      }, { maxAttempts: 4, timeoutMs: 25000 });
    } catch (err) {
      return new Response(JSON.stringify({ status: 'error', message: 'GAS unreachable after retries: ' + String(err) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const resultText = await response.text();
    return new Response(resultText, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ status: 'error', message: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

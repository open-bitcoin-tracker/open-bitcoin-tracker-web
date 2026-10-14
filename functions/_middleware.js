/**
 * Cloudflare Pages language negotiation for known English page routes.
 * Explicit localized URLs are preserved. A valid language cookie takes priority
 * over Accept-Language; unsupported languages fall back to English.
 * Only the locale code is persisted, for 180 days. No request data is logged or
 * forwarded and no external services are called.
 */

// URL path segment -> the BCP-47 prefixes that should resolve to it. English is
// intentionally absent: it is the root and is never a redirect target. The `pt`
// segment maps from both pt-BR and the bare pt, mirroring astro.config.mjs.
const LOCALE_MATCHERS = [
  { path: 'es', prefixes: ['es'] },
  { path: 'pt', prefixes: ['pt'] }, // pt-BR, pt-PT, pt all start with "pt"
  { path: 'ru', prefixes: ['ru'] },
  { path: 'tr', prefixes: ['tr'] },
  { path: 'vi', prefixes: ['vi'] },
  { path: 'ja', prefixes: ['ja'] },
  { path: 'fr', prefixes: ['fr'] },
  { path: 'de', prefixes: ['de'] },
  { path: 'it', prefixes: ['it'] },
];

const COOKIE_LOCALES = new Set(['en', ...LOCALE_MATCHERS.map((m) => m.path)]);
const PAGE_PATHS = new Set([
  '', 'price-tracker', 'android-app', 'a-bit-of-earth',
  'bitcoin-and-the-dollar', 'about', 'privacy',
]);
const COOKIE_NAME = 'lang';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

/**
 * Parse Accept-Language into a quality-ordered list of lowercase tags.
 * e.g. "de-DE,de;q=0.9,en;q=0.8" -> ["de-de", "de", "en"]
 */
function parseAcceptLanguage(header) {
  if (!header) return [];
  return header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      let q = 1;
      for (const p of params) {
        const m = p.trim().match(/^q=([0-9.]+)$/);
        if (m) q = Number(m[1]);
      }
      return { tag: tag.trim().toLowerCase(), q: Number.isNaN(q) ? 0 : q };
    })
    .filter((e) => e.tag && e.tag !== '*' && e.q > 0 && e.q <= 1)
    .sort((a, b) => b.q - a.q)
    .map((e) => e.tag);
}

/**
 * Walk the visitor's ordered language tags and return the first one that maps
 * to a supported locale path. Returns null when nothing matches (caller keeps
 * the visitor on the English root). English tags match nothing here on purpose.
 */
function matchLocalePath(acceptLanguage) {
  for (const tag of parseAcceptLanguage(acceptLanguage)) {
    const base = tag.split('-')[0];
    if (base === 'en') return null; // English -> stay at root.
    for (const { path, prefixes } of LOCALE_MATCHERS) {
      if (prefixes.some((p) => tag === p || base === p)) return path;
    }
  }
  return null;
}

function readCookie(request, name) {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const page = url.pathname.replace(/\/index\.html$/, '/').replace(/^\/|\/$/g, '');

  // Only negotiate real English pages. Localized URLs, assets, unknown paths,
  // and non-navigation methods pass through, so redirect targets cannot loop.
  if (!['GET', 'HEAD'].includes(request.method) || !PAGE_PATHS.has(page)) {
    return next();
  }

  const cookie = readCookie(request, COOKIE_NAME);
  const saved = COOKIE_LOCALES.has(cookie) ? cookie : null;
  const target = saved ?? matchLocalePath(request.headers.get('Accept-Language')) ?? 'en';
  let response;
  if (target === 'en') {
    response = await next();
  } else {
    url.pathname = `/${target}/${page ? `${page}/` : ''}`;
    response = new Response(null, { status: 302, headers: { Location: url.toString() } });
  }

  // Negotiated pages and redirects are personal responses. Preserve any other
  // Vary fields and prevent caches from reusing one visitor's language choice.
  const res = new Response(response.body, response);
  const vary = new Set((res.headers.get('Vary') ?? '').split(',').map((v) => v.trim()).filter(Boolean));
  vary.add('Accept-Language');
  vary.add('Cookie');
  res.headers.set('Vary', [...vary].join(', '));
  res.headers.set('Cache-Control', 'private, no-store');
  if (!saved) {
    const secure = url.protocol === 'https:' ? '; Secure' : '';
    res.headers.append('Set-Cookie',
      `${COOKIE_NAME}=${target}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`);
  }
  return res;
}

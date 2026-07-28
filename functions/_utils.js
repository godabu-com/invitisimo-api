const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// One Supabase client per invocation, using the service_role key.
// This key bypasses RLS entirely — it must NEVER be exposed to the browser.
// It only ever lives here, as a Netlify environment variable.
function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// All three functions are called cross-origin, from every *.netlify.app
// invite subdomain, so CORS has to be wide open on this API site.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// Minimal HMAC-signed token: base64url(payload) + "." + HMAC-SHA256 signature.
// Used for the admin "remember me" session (30-day expiry, per project convention).
function signToken(payload) {
  const secret = process.env.ADMIN_TOKEN_SECRET;
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

function verifyToken(token) {
  try {
    const secret = process.env.ADMIN_TOKEN_SECRET;
    const [b64, sig] = token.split('.');
    if (!b64 || !sig) return null;
    const expectedSig = crypto.createHmac('sha256', secret).update(b64).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    // Constant-time comparison — same reasoning as the Shopify HMAC check in Security node.
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString());
    if (payload.exp && Date.now() > payload.exp) return null; // expired
    return payload;
  } catch (e) {
    return null;
  }
}

// Rate limiting — calls the check_rate_limit() Postgres function (atomic
// fixed-window counter, see rate_limits table). Returns true if the request
// is allowed, false if the caller is over the limit for that key+window.
// Fails OPEN on any Supabase error (allows the request through) — a rate
// limiter outage should never take down login/RSVP for everyone.
async function checkRateLimit(key, limit, windowSeconds) {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error('checkRateLimit error (failing open):', error);
      return true;
    }
    return data === true;
  } catch (e) {
    console.error('checkRateLimit exception (failing open):', e);
    return true;
  }
}

// Extracts the caller's IP from Netlify's forwarded headers.
// x-nf-client-connection-ip is Netlify's own header (most reliable);
// x-forwarded-for is the generic fallback (may contain a comma-separated list).
function getClientIp(event) {
  const headers = event.headers || {};
  return (
    headers['x-nf-client-connection-ip'] ||
    (headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    'unknown'
  );
}

module.exports = {
  getSupabase,
  CORS_HEADERS,
  jsonResponse,
  signToken,
  verifyToken,
  checkRateLimit,
  getClientIp,
};

const { getSupabase, jsonResponse, CORS_HEADERS, checkRateLimit, getClientIp } = require('./_utils');

// POST body (from the "opening soon" / password page signup form):
// { email }
//
// Public endpoint, no auth — same trust level as submit-rsvp.js. Upserts
// into marketing_contacts keyed on email, so a returning customer never
// gets duplicated, just has marketing_accepted flipped back to true.
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  const email = (body.email || '').trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse(400, { error: 'Adresă de email invalidă' });
  }

  // Rate limit: 5 signups / hour per IP — generous for a real visitor,
  // enough to stop naive scripted abuse of a public, unauthenticated form.
  const ip = getClientIp(event);
  const allowed = await checkRateLimit(`subscribe:${ip}`, 5, 60 * 60);
  if (!allowed) {
    return jsonResponse(429, { error: 'Prea multe încercări. Te rugăm încearcă din nou mai târziu.' });
  }

  const supabase = getSupabase();

  // Upsert on email: a brand-new address gets a fresh row; an address that
  // already exists (e.g. from a past order) just has marketing_accepted
  // and consent fields refreshed — total_orders and other order-derived
  // fields are left untouched (this endpoint never writes them).
  const { data, error } = await supabase
    .from('marketing_contacts')
    .upsert(
      {
        email,
        marketing_accepted: true,
        consent_date: new Date().toISOString(),
        consent_source: 'Pagina opening soon',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'email' }
    )
    .select()
    .single();

  if (error) {
    console.error('subscribe error:', error);
    return jsonResponse(500, { error: 'A apărut o eroare. Încearcă din nou.' });
  }

  return jsonResponse(200, { success: true, contact: data });
};

const { getSupabase, CORS_HEADERS } = require('./_utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Invalid JSON' }),
    };
  }

  const email = (body.email || '').trim().toLowerCase();

  if (!email || !email.includes('@')) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Email invalid' }),
    };
  }

  const supabase = getSupabase();

  // Notă: NU verificăm dacă rândul există înainte — un UPDATE pe un
  // email inexistent pur și simplu nu modifică nimic (0 rows affected),
  // fără eroare. Răspundem mereu cu success, indiferent de rezultat,
  // ca să nu scurgem informație despre ce emailuri sunt în baza de
  // marketing (același principiu ca la admin-login.js).
  const { error } = await supabase
    .from('marketing_contacts')
    .update({
      marketing_accepted: false,
      consent_date: new Date().toISOString(),
      consent_source: 'Unsubscribe link',
    })
    .eq('email', email);

  if (error) {
    console.error('unsubscribe error:', error);
    // Chiar și la eroare internă, răspundem generic către client —
    // nu expunem detalii de infrastructură.
  }

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({ success: true }),
  };
};

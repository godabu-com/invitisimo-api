const { getSupabase, jsonResponse, CORS_HEADERS, signToken } = require('./_utils');

// POST body: { invite_slug, username, password }
// invite_slug is read client-side from window.location.hostname
// (e.g. "majoratdanpetrescu931" from majoratdanpetrescu931.netlify.app)
// so admin.html never needs any manual configuration per invitation.
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  const { invite_slug, username, password } = body;
  if (!invite_slug || !username || !password) {
    return jsonResponse(400, { error: 'Lipsesc invite_slug, username sau password' });
  }

  const supabase = getSupabase();

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, category, admin_username, admin_password, netlify_link')
    .ilike('netlify_link', `%${invite_slug}%`)
    .maybeSingle();

  // Same generic error whether the slug doesn't match an order or the
  // credentials are wrong — never reveal which one failed.
  if (error || !order) {
    return jsonResponse(401, { error: 'Utilizator sau parolă incorecte' });
  }
  if (order.admin_username !== username || order.admin_password !== password) {
    return jsonResponse(401, { error: 'Utilizator sau parolă incorecte' });
  }

  const token = signToken({
    order_id: order.id,
    invite_slug,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days, per "remember me" convention
  });

  return jsonResponse(200, { token, order_id: order.id, category: order.category });
};

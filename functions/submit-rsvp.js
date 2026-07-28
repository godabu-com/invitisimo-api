const { getSupabase, jsonResponse, CORS_HEADERS } = require('./_utils');

// POST body (from index.html's RSVP modal):
// { invite_slug, category, shopify_order_id, full_name, attending,
//   total_persons, adult_menu, child_menu, accommodation, contact_phone, group_id }
//
// No auth here on purpose — this is the public guest-facing endpoint.
// It can only INSERT into confirmations, never read/update/delete other data.
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  const {
    invite_slug,
    category,
    shopify_order_id,
    full_name,
    attending,
    total_persons,
    adult_menu,
    child_menu,
    accommodation,
    contact_phone,
    group_id,
  } = body;

  if (!invite_slug || !full_name) {
    return jsonResponse(400, { error: 'Lipsesc câmpuri obligatorii (nume)' });
  }

  const supabase = getSupabase();

  // Best-effort link back to the parent order (not required for the insert to work).
  const { data: order } = await supabase
    .from('orders')
    .select('id')
    .ilike('netlify_link', `%${invite_slug}%`)
    .maybeSingle();

  const { data, error } = await supabase
    .from('confirmations')
    .insert({
      order_id: order ? order.id : null,
      invite_slug,
      category: category || null,
      shopify_order_id: shopify_order_id || null,
      full_name,
      attending: attending !== undefined ? attending : true,
      total_persons: total_persons || 1,
      adult_menu: adult_menu || null,
      child_menu: child_menu || null,
      accommodation: accommodation || false,
      contact_phone: contact_phone || null,
      ...(group_id ? { group_id } : {}),
    })
    .select()
    .single();

  if (error) return jsonResponse(500, { error: 'Eroare la salvarea confirmării' });

  return jsonResponse(200, { success: true, confirmation: data });
};

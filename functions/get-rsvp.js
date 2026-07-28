const { getSupabase, jsonResponse, CORS_HEADERS, verifyToken } = require('./_utils');

// Requires Authorization: Bearer <token> from admin-login.js.
// GET    ?invite_slug=xxx              -> list confirmations + counts
// DELETE { invite_slug, ids: [...] }   -> soft-delete (sets deleted = true)
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace('Bearer ', '');
  const payload = verifyToken(token);
  if (!payload) return jsonResponse(401, { error: 'Sesiune expirată sau invalidă' });

  const supabase = getSupabase();

  if (event.httpMethod === 'GET') {
    const invite_slug = event.queryStringParameters && event.queryStringParameters.invite_slug;
    if (!invite_slug || invite_slug !== payload.invite_slug) {
      return jsonResponse(403, { error: 'Acces interzis pentru această invitație' });
    }

    const { data, error } = await supabase
      .from('confirmations')
      .select('*')
      .eq('invite_slug', invite_slug)
      .eq('deleted', false)
      .order('confirmed_at', { ascending: false });

    if (error) return jsonResponse(500, { error: 'Eroare la citirea confirmărilor' });

    const total_persons = data.reduce((sum, r) => sum + (r.total_persons || 1), 0);
    return jsonResponse(200, { confirmations: data, count: data.length, total_persons });
  }

  if (event.httpMethod === 'DELETE') {
    let body;
    try {
      body = JSON.parse(event.body);
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON' });
    }

    const { invite_slug, ids } = body;
    if (!invite_slug || invite_slug !== payload.invite_slug || !Array.isArray(ids) || ids.length === 0) {
      return jsonResponse(400, { error: 'Cerere invalidă' });
    }

    // Soft delete only, scoped to this invite_slug — an admin token for
    // one invitation can never touch another invitation's rows.
    const { error } = await supabase
      .from('confirmations')
      .update({ deleted: true })
      .eq('invite_slug', invite_slug)
      .in('id', ids);

    if (error) return jsonResponse(500, { error: 'Eroare la ștergere' });
    return jsonResponse(200, { success: true, deleted_ids: ids });
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

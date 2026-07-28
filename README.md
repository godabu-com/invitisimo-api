# Invitisimo API (centralized Netlify Functions site)

This is **one separate Netlify site**, distinct from every per-customer invite
site. All `index.html` / `admin.html` files across all invitations call this
same site over the network — nothing gets bundled into the deploy zip.

## 1. Deploy this site

1. Push this folder to a new repo (or a new branch on `invitisimo-templates`,
   e.g. `api-main`) — doesn't need to be public.
2. In Netlify: **Add new site → Import from Git**, point it at this repo.
3. Pick a memorable site name, e.g. `invitisimo-api` →
   `https://invitisimo-api.netlify.app`
4. Site settings → **Environment variables**, add:
   - `SUPABASE_URL` — your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — service_role key (Project Settings → API).
     **Never** put this in any frontend file — it belongs only here.
   - `ADMIN_TOKEN_SECRET` — any long random string (e.g. `openssl rand -hex 32`),
     used to sign admin session tokens.
5. Deploy. Your three endpoints are now live at:
   - `POST https://invitisimo-api.netlify.app/.netlify/functions/submit-rsvp`
   - `POST https://invitisimo-api.netlify.app/.netlify/functions/admin-login`
   - `GET/DELETE https://invitisimo-api.netlify.app/.netlify/functions/get-rsvp`

## 2. Wire it into index.html (guest RSVP form)

Every template's RSVP modal submit handler should call `submit-rsvp`. The
`invite_slug` is read automatically from the subdomain — no per-template
configuration needed:

```javascript
const API_BASE = 'https://invitisimo-api.netlify.app/.netlify/functions';
const inviteSlug = window.location.hostname.split('.')[0];

async function submitRsvp(formData) {
  const res = await fetch(`${API_BASE}/submit-rsvp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      invite_slug: inviteSlug,
      full_name: formData.fullName,
      attending: formData.attending,
      total_persons: formData.totalPersons,
      contact_phone: formData.phone,
      // adult_menu / child_menu / accommodation only if the template collects them
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Eroare la trimitere');
  return data;
}
```

## 3. Wire it into admin.html (login + confirmations table)

```javascript
const API_BASE = 'https://invitisimo-api.netlify.app/.netlify/functions';
const inviteSlug = window.location.hostname.split('.')[0];

async function login(username, password) {
  const res = await fetch(`${API_BASE}/admin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_slug: inviteSlug, username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Autentificare eșuată');
  localStorage.setItem('invitisimo_admin_token', data.token); // 30-day HMAC token
  return data;
}

async function loadConfirmations() {
  const token = localStorage.getItem('invitisimo_admin_token');
  const res = await fetch(`${API_BASE}/get-rsvp?invite_slug=${inviteSlug}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Eroare la citire');
  return data; // { confirmations, count, total_persons }
}

async function deleteConfirmations(ids) {
  const token = localStorage.getItem('invitisimo_admin_token');
  const res = await fetch(`${API_BASE}/get-rsvp`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ invite_slug: inviteSlug, ids }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Eroare la ștergere');
  return data;
}
```

Replace `admin.html`'s mock array + login stub with these three calls, and
`index.html`'s "simulated" confirmation with the real `submitRsvp()` call.

## Notes / open decisions

- **`admin_password` is compared as plain text** in `admin-login.js`, matching
  how it's currently stored in the `orders` table (needed since n8n emails
  the real password to the client at order time). This is fine as long as the
  comparison stays server-side only (it does — the browser never sees this
  column). If you want it hashed at rest later, that's a small change to both
  this function and the n8n `data extraction` node — not urgent.
- `invite_slug` matching uses `ilike ... netlify_link` since that's the only
  place the slug currently lives on `orders`. If you'd rather match on a
  dedicated `netlify_slug` column, that's a 1-line change here plus adding
  the column to the `orders` table.
- CORS is wide open (`*`) since every `*.netlify.app` invite subdomain needs
  to call this API — there's no practical way to allowlist them all up front.

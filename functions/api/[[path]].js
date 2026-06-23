const ONE_DAY_SECONDS = 60 * 60 * 24;

function json(data, init = {}) {
  return Response.json(data, init);
}

function getEnv(context, key) {
  return context.env[key];
}

function getSupabaseConfig(context) {
  const url = getEnv(context, 'SUPABASE_URL');
  const key = getEnv(context, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('Supabase env missing: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return { url: url.replace(/\/$/, ''), key };
}

async function supabaseFetch(context, path, init = {}) {
  const { url, key } = getSupabaseConfig(context);
  const headers = new Headers(init.headers || {});
  headers.set('apikey', key);
  headers.set('authorization', `Bearer ${key}`);
  headers.set('content-type', headers.get('content-type') || 'application/json');
  headers.set('prefer', headers.get('prefer') || 'return=representation');

  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    return { data: null, error: { message: data?.message || data?.hint || text || res.statusText }, count: null };
  }

  const countHeader = res.headers.get('content-range');
  const count = countHeader?.includes('/') ? Number(countHeader.split('/').pop()) : null;
  return { data, error: null, count };
}

function qs(params) {
  return new URLSearchParams(params).toString();
}

async function selectRows(context, table, filters = {}, options = {}) {
  const params = {
    select: options.select || '*',
    ...filters
  };
  if (options.order) params.order = options.order;
  if (options.limit) params.limit = String(options.limit);

  const headers = {};
  if (options.count) headers.prefer = 'count=exact';
  return supabaseFetch(context, `${table}?${qs(params)}`, { headers });
}

async function insertRow(context, table, payload, select = '*') {
  return supabaseFetch(context, `${table}?select=${encodeURIComponent(select)}`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

async function updateRows(context, table, filters, payload, select = '*') {
  return supabaseFetch(context, `${table}?${qs({ ...filters, select })}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

function single(data) {
  return Array.isArray(data) ? data[0] : data;
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function textToBase64Url(text) {
  return base64Url(new TextEncoder().encode(text));
}

function base64UrlToText(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
}

async function hmacSha256(secret, text) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return base64Url(new Uint8Array(sig));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function getSecret(context) {
  return getEnv(context, 'ADMIN_SESSION_SECRET') || getEnv(context, 'ADMIN_PASSWORD') || 'dev-secret';
}

async function createAdminToken(context) {
  const exp = Math.floor(Date.now() / 1000) + ONE_DAY_SECONDS;
  const payload = textToBase64Url(JSON.stringify({ role: 'admin', exp }));
  const sig = await hmacSha256(getSecret(context), payload);
  return `${payload}.${sig}`;
}

async function verifyAdminToken(context, token) {
  if (!token || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  const expected = await hmacSha256(getSecret(context), payload);
  if (!timingSafeEqual(sig, expected)) return false;

  try {
    const data = JSON.parse(base64UrlToText(payload));
    return data.role === 'admin' && data.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

async function requireAdmin(context) {
  const auth = context.request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!(await verifyAdminToken(context, token))) {
    return json({ ok: false, message: '管理员登录已失效' }, { status: 401 });
  }
  return null;
}

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

async function requestBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function countRegistrations(context, activityId) {
  const { count } = await selectRows(
    context,
    'registrations',
    { activity_id: `eq.${activityId}`, deleted_at: 'is.null' },
    { select: 'id', count: true }
  );
  return count || 0;
}

async function getActivityWithCount(context, id) {
  const { data, error } = await selectRows(
    context,
    'activities',
    { id: `eq.${id}`, status: 'neq.deleted' },
    { limit: 1 }
  );
  const activity = single(data);
  if (error || !activity) return { error: error || { message: '活动不存在' } };
  return { activity: { ...activity, registered_count: await countRegistrations(context, id) } };
}

function activityPayload(body) {
  return {
    title: body.title || '',
    description: body.description || '',
    event_time: body.event_time || '',
    location: body.location || '',
    fee_text: body.fee_text || '',
    max_people: Number(body.max_people || 0),
    custom_fields: Array.isArray(body.custom_fields) ? body.custom_fields : [],
    status: body.status || 'open',
    updated_at: new Date().toISOString()
  };
}

async function listActivities(context) {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  const { data, error } = await selectRows(
    context,
    'activities',
    { status: 'neq.deleted' },
    { order: 'created_at.desc' }
  );
  if (error) return json({ ok: false, message: error.message }, { status: 500 });

  const rows = [];
  for (const activity of data || []) {
    rows.push({ ...activity, registered_count: await countRegistrations(context, activity.id) });
  }

  return json({ ok: true, activities: rows });
}

async function createActivity(context) {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  const body = await requestBody(context.request);
  const payload = activityPayload(body);
  if (!payload.title) return json({ ok: false, message: '请填写活动主题' }, { status: 400 });

  const { data, error } = await insertRow(context, 'activities', payload);
  if (error) return json({ ok: false, message: error.message }, { status: 500 });
  return json({ ok: true, activity: single(data) });
}

async function getActivity(context, id) {
  const { activity, error } = await getActivityWithCount(context, id);
  if (error) return json({ ok: false, message: '活动不存在' }, { status: 404 });
  return json({ ok: true, activity });
}

async function updateActivity(context, id) {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  const body = await requestBody(context.request);
  const { data, error } = await updateRows(context, 'activities', { id: `eq.${id}` }, activityPayload(body));
  if (error) return json({ ok: false, message: error.message }, { status: 500 });
  return json({ ok: true, activity: single(data) });
}

async function deleteActivity(context, id) {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  const { error } = await updateRows(context, 'activities', { id: `eq.${id}` }, {
    status: 'deleted',
    updated_at: new Date().toISOString()
  });
  if (error) return json({ ok: false, message: error.message }, { status: 500 });
  return json({ ok: true });
}

async function listRegistrations(context, activityId) {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  const { data, error } = await selectRows(
    context,
    'registrations',
    { activity_id: `eq.${activityId}`, deleted_at: 'is.null' },
    { order: 'created_at.asc' }
  );
  if (error) return json({ ok: false, message: error.message }, { status: 500 });
  return json({ ok: true, registrations: data || [] });
}

async function createRegistration(context, activityId) {
  const body = await requestBody(context.request);

  const { data: activityRows, error: activityError } = await selectRows(
    context,
    'activities',
    { id: `eq.${activityId}`, status: 'eq.open' },
    { limit: 1 }
  );
  const activity = single(activityRows);
  if (activityError || !activity) {
    return json({ ok: false, message: '活动不存在或报名已关闭' }, { status: 404 });
  }

  const count = await countRegistrations(context, activityId);
  if (activity.max_people > 0 && count >= activity.max_people) {
    return json({ ok: false, message: '报名已满' }, { status: 400 });
  }

  const childName = (body.child_name || '').trim();
  const phone = (body.phone || '').trim();
  if (!childName || !phone) {
    return json({ ok: false, message: '请填写孩子姓名和联系电话' }, { status: 400 });
  }

  const editToken = randomToken();
  const { data, error } = await insertRow(context, 'registrations', {
    activity_id: activityId,
    child_name: childName,
    phone,
    custom_answers: body.custom_answers || {},
    edit_token: editToken,
    updated_at: new Date().toISOString()
  });
  if (error) return json({ ok: false, message: error.message }, { status: 500 });

  const site = getEnv(context, 'NEXT_PUBLIC_SITE_URL') || new URL(context.request.url).origin;
  return json({
    ok: true,
    registration: single(data),
    manage_url: `${site}/manage/${editToken}`
  });
}

async function findByToken(context, token) {
  const { data, error } = await selectRows(
    context,
    'registrations',
    { edit_token: `eq.${token}`, deleted_at: 'is.null' },
    { select: '*,activities(*)', limit: 1 }
  );
  return { data: single(data), error };
}

async function getRegistrationByToken(context, token) {
  const { data, error } = await findByToken(context, token);
  if (error || !data) return json({ ok: false, message: '报名记录不存在' }, { status: 404 });
  return json({ ok: true, registration: data });
}

async function updateRegistrationByToken(context, token) {
  const body = await requestBody(context.request);
  const found = await findByToken(context, token);
  if (found.error || !found.data) return json({ ok: false, message: '报名记录不存在' }, { status: 404 });

  const childName = (body.child_name || '').trim();
  const phone = (body.phone || '').trim();
  if (!childName || !phone) {
    return json({ ok: false, message: '请填写孩子姓名和联系电话' }, { status: 400 });
  }

  const { data, error } = await updateRows(
    context,
    'registrations',
    { edit_token: `eq.${token}`, deleted_at: 'is.null' },
    {
      child_name: childName,
      phone,
      custom_answers: body.custom_answers || {},
      updated_at: new Date().toISOString()
    },
    '*,activities(*)'
  );
  if (error) return json({ ok: false, message: error.message }, { status: 500 });
  return json({ ok: true, registration: single(data) });
}

async function deleteRegistrationByToken(context, token) {
  const found = await findByToken(context, token);
  if (found.error || !found.data) return json({ ok: false, message: '报名记录不存在' }, { status: 404 });

  const { error } = await updateRows(context, 'registrations', { edit_token: `eq.${token}` }, {
    deleted_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  if (error) return json({ ok: false, message: error.message }, { status: 500 });
  return json({ ok: true });
}

async function updateRegistrationAdmin(context, id) {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  const body = await requestBody(context.request);
  const { data, error } = await updateRows(
    context,
    'registrations',
    { id: `eq.${id}`, deleted_at: 'is.null' },
    {
      child_name: body.child_name || '',
      phone: body.phone || '',
      custom_answers: body.custom_answers || {},
      updated_at: new Date().toISOString()
    }
  );
  if (error) return json({ ok: false, message: error.message }, { status: 500 });
  return json({ ok: true, registration: single(data) });
}

async function deleteRegistrationAdmin(context, id) {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  const { error } = await updateRows(context, 'registrations', { id: `eq.${id}` }, {
    deleted_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  if (error) return json({ ok: false, message: error.message }, { status: 500 });
  return json({ ok: true });
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

async function exportCsv(context, id) {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  const { data: activityRows, error: activityError } = await selectRows(context, 'activities', { id: `eq.${id}` }, { limit: 1 });
  const activity = single(activityRows);
  if (activityError || !activity) return json({ ok: false, message: activityError?.message || '活动不存在' }, { status: 404 });

  const { data, error } = await selectRows(
    context,
    'registrations',
    { activity_id: `eq.${id}`, deleted_at: 'is.null' },
    { order: 'created_at.asc' }
  );
  if (error) return json({ ok: false, message: error.message }, { status: 500 });

  const fields = Array.isArray(activity.custom_fields) ? activity.custom_fields : [];
  const headers = ['孩子姓名', '联系电话', ...fields.map(f => f.label), '报名时间'];
  const rows = [headers.map(csvEscape).join(',')];
  for (const reg of data || []) {
    const answers = reg.custom_answers || {};
    rows.push([
      reg.child_name,
      reg.phone,
      ...fields.map(f => Array.isArray(answers[f.id]) ? answers[f.id].join('; ') : answers[f.id] || ''),
      reg.created_at
    ].map(csvEscape).join(','));
  }

  return new Response('\ufeff' + rows.join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${encodeURIComponent(activity.title || 'registrations')}.csv"`
    }
  });
}

async function login(context) {
  const body = await requestBody(context.request);
  const expected = getEnv(context, 'ADMIN_PASSWORD') || 'june';
  if (body.password !== expected) {
    return json({ ok: false, message: '管理员密码不正确' }, { status: 401 });
  }
  return json({ ok: true, token: await createAdminToken(context) });
}

export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const method = context.request.method;
    const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);

    if (method === 'POST' && parts.join('/') === 'admin/login') return login(context);
    if (method === 'GET' && parts[0] === 'activities' && parts.length === 1) return listActivities(context);
    if (method === 'POST' && parts[0] === 'activities' && parts.length === 1) return createActivity(context);
    if (method === 'GET' && parts[0] === 'activities' && parts.length === 2) return getActivity(context, parts[1]);
    if (method === 'PUT' && parts[0] === 'activities' && parts.length === 2) return updateActivity(context, parts[1]);
    if (method === 'DELETE' && parts[0] === 'activities' && parts.length === 2) return deleteActivity(context, parts[1]);
    if (method === 'GET' && parts[0] === 'activities' && parts[2] === 'registrations') return listRegistrations(context, parts[1]);
    if (method === 'POST' && parts[0] === 'activities' && parts[2] === 'registrations') return createRegistration(context, parts[1]);
    if (method === 'GET' && parts[0] === 'registrations' && parts[1]) return getRegistrationByToken(context, parts[1]);
    if (method === 'PUT' && parts[0] === 'registrations' && parts[1]) return updateRegistrationByToken(context, parts[1]);
    if (method === 'DELETE' && parts[0] === 'registrations' && parts[1]) return deleteRegistrationByToken(context, parts[1]);
    if (method === 'PUT' && parts[0] === 'admin' && parts[1] === 'registrations' && parts[2]) return updateRegistrationAdmin(context, parts[2]);
    if (method === 'DELETE' && parts[0] === 'admin' && parts[1] === 'registrations' && parts[2]) return deleteRegistrationAdmin(context, parts[2]);
    if (method === 'GET' && parts[0] === 'admin' && parts[1] === 'export' && parts[2]) return exportCsv(context, parts[2]);

    return json({ ok: false, message: 'API route not found' }, { status: 404 });
  } catch (err) {
    return json({ ok: false, message: err.message || 'Server error' }, { status: 500 });
  }
}

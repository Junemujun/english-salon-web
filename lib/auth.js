import crypto from 'crypto';

const ONE_DAY_SECONDS = 60 * 60 * 24;

function getSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || 'dev-secret';
}

export function createAdminToken() {
  const exp = Math.floor(Date.now() / 1000) + ONE_DAY_SECONDS;
  const payload = Buffer.from(JSON.stringify({ role: 'admin', exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyAdminToken(token) {
  if (!token || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  return data.role === 'admin' && data.exp > Math.floor(Date.now() / 1000);
}

export function requireAdmin(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!verifyAdminToken(token)) {
    return Response.json({ ok: false, message: '管理员登录已失效' }, { status: 401 });
  }
  return null;
}

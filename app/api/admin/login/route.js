import { createAdminToken } from '../../../../lib/auth';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const expected = process.env.ADMIN_PASSWORD || 'june';

  if (body.password !== expected) {
    return Response.json({ ok: false, message: '管理员密码错误' }, { status: 401 });
  }

  return Response.json({
    ok: true,
    token: createAdminToken()
  });
}

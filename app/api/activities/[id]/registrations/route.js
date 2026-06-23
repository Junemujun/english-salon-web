import { requireAdmin } from '../../../../../lib/auth';
import { createEditToken } from '../../../../../lib/registration';
import { getSupabaseAdmin } from '../../../../../lib/supabase';

export async function GET(request, { params }) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('registrations')
    .select('*')
    .eq('activity_id', params.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) return Response.json({ ok: false, message: error.message }, { status: 500 });
  return Response.json({ ok: true, registrations: data || [] });
}

export async function POST(request, { params }) {
  const body = await request.json();
  const supabase = getSupabaseAdmin();

  const { data: activity, error: activityError } = await supabase
    .from('activities')
    .select('*')
    .eq('id', params.id)
    .eq('status', 'open')
    .single();

  if (activityError || !activity) {
    return Response.json({ ok: false, message: '活动不存在或报名已关闭' }, { status: 404 });
  }

  const { count } = await supabase
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('activity_id', params.id)
    .is('deleted_at', null);

  if (activity.max_people > 0 && (count || 0) >= activity.max_people) {
    return Response.json({ ok: false, message: '报名已满' }, { status: 400 });
  }

  const childName = (body.child_name || '').trim();
  const phone = (body.phone || '').trim();
  if (!childName || !phone) {
    return Response.json({ ok: false, message: '请填写孩子姓名和联系电话' }, { status: 400 });
  }

  const editToken = createEditToken();
  const { data, error } = await supabase
    .from('registrations')
    .insert({
      activity_id: params.id,
      child_name: childName,
      phone,
      custom_answers: body.custom_answers || {},
      edit_token: editToken,
      updated_at: new Date().toISOString()
    })
    .select('*')
    .single();

  if (error) return Response.json({ ok: false, message: error.message }, { status: 500 });

  const site = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  return Response.json({
    ok: true,
    registration: data,
    manage_url: `${site}/manage/${editToken}`
  });
}

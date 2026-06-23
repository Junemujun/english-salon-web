import { requireAdmin } from '../../../lib/auth';
import { getSupabaseAdmin } from '../../../lib/supabase';

export async function GET(request) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .neq('status', 'deleted')
    .order('created_at', { ascending: false });

  if (error) return Response.json({ ok: false, message: error.message }, { status: 500 });

  const rows = [];
  for (const activity of data || []) {
    const { count } = await supabase
      .from('registrations')
      .select('id', { count: 'exact', head: true })
      .eq('activity_id', activity.id)
      .is('deleted_at', null);
    rows.push({ ...activity, registered_count: count || 0 });
  }

  return Response.json({ ok: true, activities: rows });
}

export async function POST(request) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const body = await request.json();
  const supabase = getSupabaseAdmin();
  const payload = {
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

  if (!payload.title) {
    return Response.json({ ok: false, message: '请填写活动主题' }, { status: 400 });
  }

  const { data, error } = await supabase.from('activities').insert(payload).select('*').single();
  if (error) return Response.json({ ok: false, message: error.message }, { status: 500 });
  return Response.json({ ok: true, activity: data });
}

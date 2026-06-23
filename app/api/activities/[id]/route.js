import { requireAdmin } from '../../../../lib/auth';
import { getSupabaseAdmin } from '../../../../lib/supabase';

async function getActivityWithCount(id) {
  const supabase = getSupabaseAdmin();
  const { data: activity, error } = await supabase
    .from('activities')
    .select('*')
    .eq('id', id)
    .neq('status', 'deleted')
    .single();

  if (error) return { error };

  const { count } = await supabase
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('activity_id', id)
    .is('deleted_at', null);

  return { activity: { ...activity, registered_count: count || 0 } };
}

export async function GET(_request, { params }) {
  const { activity, error } = await getActivityWithCount(params.id);
  if (error) return Response.json({ ok: false, message: '活动不存在' }, { status: 404 });
  return Response.json({ ok: true, activity });
}

export async function PUT(request, { params }) {
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

  const { data, error } = await supabase
    .from('activities')
    .update(payload)
    .eq('id', params.id)
    .select('*')
    .single();

  if (error) return Response.json({ ok: false, message: error.message }, { status: 500 });
  return Response.json({ ok: true, activity: data });
}

export async function DELETE(request, { params }) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('activities')
    .update({ status: 'deleted', updated_at: new Date().toISOString() })
    .eq('id', params.id);

  if (error) return Response.json({ ok: false, message: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

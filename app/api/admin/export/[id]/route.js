import { requireAdmin } from '../../../../../lib/auth';
import { getSupabaseAdmin } from '../../../../../lib/supabase';

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request, { params }) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const supabase = getSupabaseAdmin();
  const { data: activity, error: activityError } = await supabase
    .from('activities')
    .select('*')
    .eq('id', params.id)
    .single();
  if (activityError) return Response.json({ ok: false, message: activityError.message }, { status: 404 });

  const { data, error } = await supabase
    .from('registrations')
    .select('*')
    .eq('activity_id', params.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) return Response.json({ ok: false, message: error.message }, { status: 500 });

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

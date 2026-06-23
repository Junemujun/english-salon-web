import { getSupabaseAdmin } from '../../../../lib/supabase';

async function findByToken(token) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('registrations')
    .select('*, activities(*)')
    .eq('edit_token', token)
    .is('deleted_at', null)
    .single();
  return { supabase, data, error };
}

export async function GET(_request, { params }) {
  const { data, error } = await findByToken(params.token);
  if (error || !data) return Response.json({ ok: false, message: '报名记录不存在' }, { status: 404 });
  return Response.json({ ok: true, registration: data });
}

export async function PUT(request, { params }) {
  const body = await request.json();
  const { supabase, data, error } = await findByToken(params.token);
  if (error || !data) return Response.json({ ok: false, message: '报名记录不存在' }, { status: 404 });

  const childName = (body.child_name || '').trim();
  const phone = (body.phone || '').trim();
  if (!childName || !phone) {
    return Response.json({ ok: false, message: '请填写孩子姓名和联系电话' }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabase
    .from('registrations')
    .update({
      child_name: childName,
      phone,
      custom_answers: body.custom_answers || {},
      updated_at: new Date().toISOString()
    })
    .eq('edit_token', params.token)
    .is('deleted_at', null)
    .select('*, activities(*)')
    .single();

  if (updateError) return Response.json({ ok: false, message: updateError.message }, { status: 500 });
  return Response.json({ ok: true, registration: updated });
}

export async function DELETE(_request, { params }) {
  const { supabase, data, error } = await findByToken(params.token);
  if (error || !data) return Response.json({ ok: false, message: '报名记录不存在' }, { status: 404 });

  const { error: deleteError } = await supabase
    .from('registrations')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('edit_token', params.token);

  if (deleteError) return Response.json({ ok: false, message: deleteError.message }, { status: 500 });
  return Response.json({ ok: true });
}

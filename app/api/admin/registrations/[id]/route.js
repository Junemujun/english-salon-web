import { requireAdmin } from '../../../../../lib/auth';
import { getSupabaseAdmin } from '../../../../../lib/supabase';

export async function PUT(request, { params }) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const body = await request.json();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('registrations')
    .update({
      child_name: body.child_name || '',
      phone: body.phone || '',
      custom_answers: body.custom_answers || {},
      updated_at: new Date().toISOString()
    })
    .eq('id', params.id)
    .is('deleted_at', null)
    .select('*')
    .single();

  if (error) return Response.json({ ok: false, message: error.message }, { status: 500 });
  return Response.json({ ok: true, registration: data });
}

export async function DELETE(request, { params }) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('registrations')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', params.id);

  if (error) return Response.json({ ok: false, message: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

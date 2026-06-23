import crypto from 'crypto';

export function createEditToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function publicRegistration(row) {
  return {
    id: row.id,
    activity_id: row.activity_id,
    child_name: row.child_name,
    custom_answers: row.custom_answers || {},
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function activeRegistrationFilter(query) {
  return query.is('deleted_at', null);
}

'use client';

import { useEffect, useState } from 'react';

export default function ManageRegistrationPage({ params }) {
  const [registration, setRegistration] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/registrations/${params.token}`)
      .then(res => res.json())
      .then(data => {
        if (!data.ok) throw new Error(data.message);
        setRegistration(data.registration);
      })
      .catch(err => setMessage(err.message))
      .finally(() => setLoading(false));
  }, [params.token]);

  function setAnswer(field, value) {
    setRegistration(prev => ({
      ...prev,
      custom_answers: { ...(prev.custom_answers || {}), [field.id]: value }
    }));
  }

  function toggleCheckbox(field, option) {
    const current = Array.isArray(registration.custom_answers?.[field.id]) ? registration.custom_answers[field.id] : [];
    const next = current.includes(option) ? current.filter(x => x !== option) : [...current, option];
    setAnswer(field, next);
  }

  async function save(e) {
    e.preventDefault();
    setMessage('');
    const res = await fetch(`/api/registrations/${params.token}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(registration)
    });
    const data = await res.json();
    if (!data.ok) return setMessage(data.message);
    setRegistration(data.registration);
    setMessage('报名信息已更新。');
  }

  async function remove() {
    if (!confirm('确定删除自己的报名吗？删除后会释放名额。')) return;
    const res = await fetch(`/api/registrations/${params.token}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.ok) return setMessage(data.message);
    setRegistration(null);
    setMessage('报名已删除，名额已释放。');
  }

  if (loading) return <main className="page"><div className="card">正在加载报名...</div></main>;
  if (!registration) return <main className="page"><div className="card">{message || '报名记录不存在'}</div></main>;

  const activity = registration.activities || {};
  const fields = activity.custom_fields || [];

  return (
    <main className="page">
      <section className="card hero">
        <h1>我的报名管理</h1>
        <p className="muted">{activity.title}</p>
      </section>

      <section className="card">
        <form onSubmit={save}>
          <label>孩子姓名 *</label>
          <input value={registration.child_name} onChange={e => setRegistration({ ...registration, child_name: e.target.value })} required />
          <label>联系电话 *</label>
          <input value={registration.phone} onChange={e => setRegistration({ ...registration, phone: e.target.value })} required />

          {fields.map(field => (
            <div key={field.id}>
              <label>{field.label}</label>
              {field.type === 'textarea' && <textarea value={registration.custom_answers?.[field.id] || ''} onChange={e => setAnswer(field, e.target.value)} />}
              {field.type === 'text' && <input value={registration.custom_answers?.[field.id] || ''} onChange={e => setAnswer(field, e.target.value)} />}
              {field.type === 'radio' && (field.options || []).map(option => (
                <label key={option} style={{ fontWeight: 500 }}>
                  <input type="radio" name={field.id} checked={registration.custom_answers?.[field.id] === option} onChange={() => setAnswer(field, option)} />
                  {' '}{option}
                </label>
              ))}
              {field.type === 'checkbox' && (field.options || []).map(option => (
                <label key={option} style={{ fontWeight: 500 }}>
                  <input type="checkbox" checked={(registration.custom_answers?.[field.id] || []).includes(option)} onChange={() => toggleCheckbox(field, option)} />
                  {' '}{option}
                </label>
              ))}
            </div>
          ))}

          <div className="actions">
            <button>保存修改</button>
            <button type="button" className="danger" onClick={remove}>删除报名</button>
          </div>
        </form>
        {message && <p className="muted">{message}</p>}
      </section>
    </main>
  );
}

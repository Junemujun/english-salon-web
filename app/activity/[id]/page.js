'use client';

import { useEffect, useMemo, useState } from 'react';

function emptyAnswers(fields) {
  return Object.fromEntries((fields || []).map(field => [field.id, field.type === 'checkbox' ? [] : '']));
}

export default function ActivityPage({ params }) {
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [manageUrl, setManageUrl] = useState('');
  const [form, setForm] = useState({ child_name: '', phone: '', custom_answers: {} });

  useEffect(() => {
    fetch(`/api/activities/${params.id}`)
      .then(res => res.json())
      .then(data => {
        if (!data.ok) throw new Error(data.message);
        setActivity(data.activity);
        setForm(prev => ({ ...prev, custom_answers: emptyAnswers(data.activity.custom_fields) }));
      })
      .catch(err => setMessage(err.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  const isFull = useMemo(() => {
    if (!activity) return false;
    return activity.max_people > 0 && activity.registered_count >= activity.max_people;
  }, [activity]);

  function setAnswer(field, value) {
    setForm(prev => ({
      ...prev,
      custom_answers: { ...prev.custom_answers, [field.id]: value }
    }));
  }

  function toggleCheckbox(field, option) {
    const current = Array.isArray(form.custom_answers[field.id]) ? form.custom_answers[field.id] : [];
    const next = current.includes(option) ? current.filter(x => x !== option) : [...current, option];
    setAnswer(field, next);
  }

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');
    setManageUrl('');
    try {
      const res = await fetch(`/api/activities/${params.id}/registrations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message);
      setManageUrl(data.manage_url);
      setMessage('报名成功，请保存下面的报名管理链接。');
      setActivity(prev => ({ ...prev, registered_count: prev.registered_count + 1 }));
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <main className="page"><div className="card">正在加载活动...</div></main>;
  if (!activity) return <main className="page"><div className="card">{message || '活动不存在'}</div></main>;

  return (
    <main className="page">
      <section className="card hero">
        <h1>{activity.title}</h1>
        <div
  className="muted"
  style={{
    whiteSpace: 'pre-line',
    lineHeight: '1.8'
  }}
>
  {activity.description}
</div>
        <p><strong>时间：</strong>{activity.event_time || '待定'}</p>
        <p><strong>地点：</strong>{activity.location || '待定'}</p>
        <p><strong>费用：</strong>{activity.fee_text || '见活动说明'}</p>
        <span className="badge">已报名 {activity.registered_count} / {activity.max_people || '不限'}</span>
      </section>

      {isFull ? (
        <section className="card">
          <h2>报名已满</h2>
          <p className="muted">当前活动名额已满。如有家长删除报名，名额会自动释放。</p>
        </section>
      ) : (
        <section className="card">
          <h2>填写报名信息</h2>
          <form onSubmit={submit}>
            <label>孩子姓名 *</label>
            <input value={form.child_name} onChange={e => setForm({ ...form, child_name: e.target.value })} required />
            <label>联系电话 *</label>
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
            <p className="hidden-phone">联系电话仅管理员可见，普通报名页面不会公开显示。</p>

            {(activity.custom_fields || []).map(field => (
              <div key={field.id}>
                <label>{field.label}</label>
                {field.type === 'textarea' && (
                  <textarea value={form.custom_answers[field.id] || ''} onChange={e => setAnswer(field, e.target.value)} />
                )}
                {field.type === 'text' && (
                  <input value={form.custom_answers[field.id] || ''} onChange={e => setAnswer(field, e.target.value)} />
                )}
                {field.type === 'radio' && (field.options || []).map(option => (
                  <label key={option} style={{ fontWeight: 500 }}>
                    <input type="radio" name={field.id} checked={form.custom_answers[field.id] === option} onChange={() => setAnswer(field, option)} />
                    {' '}{option}
                  </label>
                ))}
                {field.type === 'checkbox' && (field.options || []).map(option => (
                  <label key={option} style={{ fontWeight: 500 }}>
                    <input type="checkbox" checked={(form.custom_answers[field.id] || []).includes(option)} onChange={() => toggleCheckbox(field, option)} />
                    {' '}{option}
                  </label>
                ))}
              </div>
            ))}

            <div className="actions">
              <button disabled={submitting}>{submitting ? '提交中...' : '提交报名'}</button>
            </div>
          </form>

          {message && <p className="muted">{message}</p>}
          {manageUrl && (
            <div className="card" style={{ marginTop: 16, background: '#f6fffb' }}>
              <h3>我的报名管理链接</h3>
              <p className="muted">请复制保存。以后可用它修改或删除自己的报名。</p>
              <input readOnly value={manageUrl} onFocus={e => e.target.select()} />
              <div className="actions">
                <button type="button" className="secondary" onClick={() => navigator.clipboard.writeText(manageUrl)}>复制链接</button>
              </div>
            </div>
          )}
        </section>
      )}

      <p className="privacy">您填写的信息仅用于本次英语沙龙活动联系与报名确认，不会用于其他用途。</p>
    </main>
  );
}

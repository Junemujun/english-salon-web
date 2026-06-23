'use client';

import { useEffect, useMemo, useState } from 'react';

const FIELD_TYPES = [
  { value: 'text', label: '文本' },
  { value: 'textarea', label: '备注' },
  { value: 'radio', label: '单选' },
  { value: 'checkbox', label: '多选' }
];

const emptyActivity = {
  title: '',
  description: '',
  event_time: '',
  location: '',
  fee_text: '',
  max_people: 10,
  status: 'open',
  custom_fields: []
};

function fieldId() {
  return 'field_' + Math.random().toString(36).slice(2, 10);
}

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [activities, setActivities] = useState([]);
  const [selected, setSelected] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('english_salon_admin_token') || '';
    if (saved) {
      setToken(saved);
      loadActivities(saved);
    }
  }, []);

  const selectedLink = useMemo(() => {
    if (!selected?.id) return '';
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    return `${origin}/activity/${selected.id}`;
  }, [selected]);

  function headers(t = token) {
    return { authorization: `Bearer ${t}`, 'content-type': 'application/json' };
  }

  async function login(e) {
    e.preventDefault();
    setMessage('');
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!data.ok) return setMessage(data.message);
    localStorage.setItem('english_salon_admin_token', data.token);
    setToken(data.token);
    setPassword('');
    await loadActivities(data.token);
  }

  async function loadActivities(t = token) {
    const res = await fetch('/api/activities', { headers: headers(t) });
    const data = await res.json();
    if (!data.ok) return setMessage(data.message);
    setActivities(data.activities);
    if (!selected && data.activities[0]) selectActivity(data.activities[0], t);
  }

  async function selectActivity(activity, t = token) {
    setSelected(JSON.parse(JSON.stringify(activity)));
    const res = await fetch(`/api/activities/${activity.id}/registrations`, { headers: headers(t) });
    const data = await res.json();
    if (!data.ok) return setMessage(data.message);
    setRegistrations(data.registrations);
  }

  function updateSelected(key, value) {
    setSelected(prev => ({ ...prev, [key]: value }));
  }

  function addField() {
    setSelected(prev => ({
      ...prev,
      custom_fields: [
        ...(prev.custom_fields || []),
        { id: fieldId(), label: '新字段', type: 'text', options: [] }
      ]
    }));
  }

  function updateField(index, patch) {
    setSelected(prev => ({
      ...prev,
      custom_fields: prev.custom_fields.map((field, i) => i === index ? { ...field, ...patch } : field)
    }));
  }

  function removeField(index) {
    setSelected(prev => ({
      ...prev,
      custom_fields: prev.custom_fields.filter((_, i) => i !== index)
    }));
  }

  async function saveActivity(e) {
    e.preventDefault();
    setMessage('');
    const isNew = !selected.id;
    const res = await fetch(isNew ? '/api/activities' : `/api/activities/${selected.id}`, {
      method: isNew ? 'POST' : 'PUT',
      headers: headers(),
      body: JSON.stringify(selected)
    });
    const data = await res.json();
    if (!data.ok) return setMessage(data.message);
    setMessage('活动已保存。');
    await loadActivities();
    setSelected(data.activity);
    if (data.activity?.id) await selectActivity(data.activity);
  }

  async function deleteActivity() {
    if (!selected?.id || !confirm('确定删除这个活动吗？')) return;
    const res = await fetch(`/api/activities/${selected.id}`, { method: 'DELETE', headers: headers() });
    const data = await res.json();
    if (!data.ok) return setMessage(data.message);
    setSelected(null);
    setRegistrations([]);
    await loadActivities();
  }

  async function deleteRegistration(id) {
    if (!confirm('确定删除这条报名吗？删除后会释放名额。')) return;
    const res = await fetch(`/api/admin/registrations/${id}`, { method: 'DELETE', headers: headers() });
    const data = await res.json();
    if (!data.ok) return setMessage(data.message);
    await selectActivity(selected);
  }

  async function updateRegistration(reg) {
    const res = await fetch(`/api/admin/registrations/${reg.id}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(reg)
    });
    const data = await res.json();
    if (!data.ok) return setMessage(data.message);
    setMessage('报名已修改。');
    await selectActivity(selected);
  }

  function copyRoster() {
    const fields = selected.custom_fields || [];
    const lines = registrations.map((reg, i) => {
      const extra = fields.map(field => {
        const value = reg.custom_answers?.[field.id];
        return `${field.label}: ${Array.isArray(value) ? value.join('/') : value || ''}`;
      }).join('；');
      return `${i + 1}. ${reg.child_name}，${reg.phone}${extra ? '，' + extra : ''}`;
    });
    navigator.clipboard.writeText(lines.join('\n'));
    setMessage('报名名单已复制。');
  }

  function logout() {
    localStorage.removeItem('english_salon_admin_token');
    setToken('');
    setSelected(null);
    setActivities([]);
    setRegistrations([]);
  }

  if (!token) {
    return (
      <main className="page">
        <section className="card hero">
          <h1>管理员登录</h1>
          <p className="muted">输入管理员密码后进入活动后台。</p>
          <form onSubmit={login}>
            <label>管理员密码</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
            <div className="actions"><button>登录</button></div>
          </form>
          {message && <p className="muted">{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="card hero">
        <h1>英语沙龙活动后台</h1>
        <p className="muted">创建活动、复制链接发到微信群、查看和管理报名名单。</p>
        <div className="actions">
          <button onClick={() => setSelected({ ...emptyActivity, custom_fields: [] })}>新建活动</button>
          <button className="secondary" onClick={logout}>退出登录</button>
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <h2>活动列表</h2>
          {activities.map(activity => (
            <div key={activity.id} className="card" style={{ padding: 14 }}>
              <h3>{activity.title}</h3>
              <p className="muted">{activity.event_time || '时间待定'} · {activity.registered_count}/{activity.max_people || '不限'}</p>
              <div className="actions">
                <button className="secondary" onClick={() => selectActivity(activity)}>管理</button>
                <a className="button secondary" href={`/activity/${activity.id}`} target="_blank">打开报名页</a>
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <h2>{selected?.id ? '编辑活动' : '新建活动'}</h2>
          {!selected ? <p className="muted">请选择或新建活动。</p> : (
            <form onSubmit={saveActivity}>
              <label>活动主题</label>
              <input value={selected.title} onChange={e => updateSelected('title', e.target.value)} />
              <label>活动时间</label>
              <input value={selected.event_time || ''} onChange={e => updateSelected('event_time', e.target.value)} placeholder="2026-07-01 15:00" />
              <label>活动地点</label>
              <input value={selected.location || ''} onChange={e => updateSelected('location', e.target.value)} />
              <label>费用说明</label>
              <input value={selected.fee_text || ''} onChange={e => updateSelected('fee_text', e.target.value)} />
              <label>活动介绍</label>
              <textarea value={selected.description || ''} onChange={e => updateSelected('description', e.target.value)} />
              <label>人数上限</label>
              <input type="number" value={selected.max_people || 0} onChange={e => updateSelected('max_people', e.target.value)} />
              <label>状态</label>
              <select value={selected.status || 'open'} onChange={e => updateSelected('status', e.target.value)}>
                <option value="open">开启报名</option>
                <option value="closed">关闭报名</option>
              </select>

              <h3 style={{ marginTop: 22 }}>自定义报名字段</h3>
              {(selected.custom_fields || []).map((field, index) => (
                <div className="card" key={field.id} style={{ padding: 14 }}>
                  <label>字段名称</label>
                  <input value={field.label} onChange={e => updateField(index, { label: e.target.value })} />
                  <label>字段类型</label>
                  <select value={field.type} onChange={e => updateField(index, { type: e.target.value })}>
                    {FIELD_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                  {(field.type === 'radio' || field.type === 'checkbox') && (
                    <>
                      <label>选项，一行一个</label>
                      <textarea value={(field.options || []).join('\n')} onChange={e => updateField(index, { options: e.target.value.split('\n').map(x => x.trim()).filter(Boolean) })} />
                    </>
                  )}
                  <div className="actions">
                    <button type="button" className="danger" onClick={() => removeField(index)}>删除字段</button>
                  </div>
                </div>
              ))}
              <div className="actions">
                <button type="button" className="secondary" onClick={addField}>添加自定义字段</button>
              </div>

              {selected.id && (
                <>
                  <label>活动链接</label>
                  <input readOnly value={selectedLink} onFocus={e => e.target.select()} />
                  <div className="actions">
                    <button type="button" className="secondary" onClick={() => navigator.clipboard.writeText(selectedLink)}>复制活动链接</button>
                  </div>
                </>
              )}

              <div className="actions">
                <button>保存活动</button>
                {selected.id && <button type="button" className="danger" onClick={deleteActivity}>删除活动</button>}
              </div>
            </form>
          )}
        </div>
      </section>

      {selected?.id && (
        <section className="card">
          <h2>报名名单</h2>
          <p className="muted">已报名 {registrations.length} / {selected.max_people || '不限'}</p>
          <div className="actions">
            <button className="secondary" onClick={copyRoster}>复制报名名单</button>
            <a className="button secondary" href={`/api/admin/export/${selected.id}`} onClick={e => {
              e.preventDefault();
              fetch(`/api/admin/export/${selected.id}`, { headers: { authorization: `Bearer ${token}` } })
                .then(res => res.blob())
                .then(blob => {
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${selected.title || 'registrations'}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                });
            }}>导出 CSV</a>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>孩子姓名</th>
                  <th>联系电话</th>
                  {(selected.custom_fields || []).map(field => <th key={field.id}>{field.label}</th>)}
                  <th>报名时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {registrations.map(reg => (
                  <tr key={reg.id}>
                    <td><input value={reg.child_name} onChange={e => setRegistrations(list => list.map(x => x.id === reg.id ? { ...x, child_name: e.target.value } : x))} /></td>
                    <td><input value={reg.phone} onChange={e => setRegistrations(list => list.map(x => x.id === reg.id ? { ...x, phone: e.target.value } : x))} /></td>
                    {(selected.custom_fields || []).map(field => (
                      <td key={field.id}>
                        <input
                          value={Array.isArray(reg.custom_answers?.[field.id]) ? reg.custom_answers[field.id].join(', ') : reg.custom_answers?.[field.id] || ''}
                          onChange={e => setRegistrations(list => list.map(x => x.id === reg.id ? {
                            ...x,
                            custom_answers: { ...(x.custom_answers || {}), [field.id]: e.target.value }
                          } : x))}
                        />
                      </td>
                    ))}
                    <td>{new Date(reg.created_at).toLocaleString('zh-CN')}</td>
                    <td>
                      <div className="actions">
                        <button className="secondary" onClick={() => updateRegistration(reg)}>保存</button>
                        <button className="danger" onClick={() => deleteRegistration(reg.id)}>删除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {message && <section className="card"><p className="muted">{message}</p></section>}
    </main>
  );
}

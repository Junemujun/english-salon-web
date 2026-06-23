import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

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

function emptyAnswers(fields) {
  return Object.fromEntries((fields || []).map(field => [field.id, field.type === 'checkbox' ? [] : '']));
}

function registrationTokenKey(activityId) {
  return `activity_${activityId}_registration_tokens`;
}

function readStoredTokens(activityId) {
  try {
    const raw = window.localStorage.getItem(registrationTokenKey(activityId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (err) {
    console.warn('Failed to read registration tokens', err);
    return [];
  }
}

function saveStoredToken(activityId, token) {
  try {
    const oldTokens = readStoredTokens(activityId);
    const nextTokens = oldTokens.includes(token) ? oldTokens : [...oldTokens, token];
    window.localStorage.setItem(registrationTokenKey(activityId), JSON.stringify(nextTokens));
    return nextTokens;
  } catch (err) {
    console.warn('Failed to save registration token', err);
    return [];
  }
}

async function api(path, options = {}) {
  const res = await fetch(path, options);
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    return { httpStatus: res.status, ...data };
  }
  const text = await res.text();
  return {
    ok: res.ok,
    httpStatus: res.status,
    message: text || res.statusText || 'Request failed',
    raw: text
  };
}

function formatApiError(data, fallback = '请求失败') {
  const lines = [
    data?.message || fallback,
    data?.httpStatus ? `HTTP: ${data.httpStatus}` : '',
    data?.operation ? `Operation: ${data.operation}` : '',
    data?.error?.status ? `Supabase status: ${data.error.status}` : '',
    data?.error?.code ? `Code: ${data.error.code}` : '',
    data?.error?.details ? `Details: ${data.error.details}` : '',
    data?.error?.hint ? `Hint: ${data.error.hint}` : '',
    data?.error?.raw ? `Raw: ${data.error.raw}` : ''
  ].filter(Boolean);
  return lines.join('\n');
}

function HomePage() {
  return (
    <main className="page">
      <section className="card hero">
        <h1>英语沙龙报名系统</h1>
        <p className="muted">请打开老师分享的活动链接报名。管理员请进入后台创建活动。</p>
        <a className="button" href="/admin">进入管理员后台</a>
      </section>
    </main>
  );
}

function ActivityPage({ id }) {
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [manageUrl, setManageUrl] = useState('');
  const [myRegistrations, setMyRegistrations] = useState([]);
  const [form, setForm] = useState({ child_name: '', phone: '', custom_answers: {} });

  useEffect(() => {
    let cancelled = false;

    async function loadMyRegistrations() {
      const tokens = readStoredTokens(id);
      if (!tokens.length) {
        setMyRegistrations([]);
        return;
      }

      const results = [];
      for (const token of tokens) {
        try {
          const data = await api(`/api/registrations/${token}`);
          if (data.ok && data.registration) results.push(data.registration);
        } catch (err) {
          console.warn('Failed to load stored registration', err);
        }
      }
      if (!cancelled) setMyRegistrations(results);
    }

    loadMyRegistrations();

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    api(`/api/activities/${id}`)
      .then(data => {
        if (!data.ok) throw new Error(data.message);
        setActivity(data.activity);
        setForm(prev => ({ ...prev, custom_answers: emptyAnswers(data.activity.custom_fields) }));
      })
      .catch(err => setMessage(err.message))
      .finally(() => setLoading(false));
  }, [id]);

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
      const data = await api(`/api/activities/${id}/registrations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (!data.ok) throw new Error(data.message);

      setManageUrl(data.manage_url);
      if (data.registration?.edit_token) {
        const tokens = saveStoredToken(id, data.registration.edit_token);
        const results = [];
        for (const token of tokens) {
          const item = await api(`/api/registrations/${token}`);
          if (item.ok && item.registration) results.push(item.registration);
        }
        setMyRegistrations(results);
      }

      setMessage('报名成功，请保存下面的报名管理链接。');
      setActivity(prev => ({ ...prev, registered_count: prev.registered_count + 1 }));
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function copyManageUrl() {
    try {
      await navigator.clipboard.writeText(manageUrl);
      setMessage('报名管理链接已复制。');
    } catch {
      setMessage('复制失败，请手动长按或选中链接复制。');
    }
  }

  if (loading) return <main className="page"><div className="card">正在加载活动...</div></main>;
  if (!activity) return <main className="page"><div className="card">{message || '活动不存在'}</div></main>;

  return (
    <main className="page">
      <section className="card hero">
        <h1>{activity.title}</h1>
        <div className="muted preserve-lines">{activity.description}</div>
        <p><strong>时间：</strong>{activity.event_time || '待定'}</p>
        <p><strong>地点：</strong>{activity.location || '待定'}</p>
        <p><strong>费用：</strong>{activity.fee_text || '见活动说明'}</p>
        <span className="badge">已报名 {activity.registered_count} / {activity.max_people || '不限'}</span>
      </section>

      {myRegistrations.length > 0 && (
        <section className="card mine-card">
          <h2>我的报名</h2>
          <p className="muted">这台设备保存过以下报名管理入口，可继续编辑或删除自己的报名。</p>
          <div className="list">
            {myRegistrations.map(item => (
              <div className="list-item" key={item.edit_token}>
                <div>
                  <strong>{item.child_name || '已报名'}</strong>
                  <p className="muted">{item.created_at ? new Date(item.created_at).toLocaleString() : ''}</p>
                </div>
                <a className="button-link" href={'/manage/' + item.edit_token}>编辑报名</a>
              </div>
            ))}
          </div>
        </section>
      )}

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
              <CustomField
                key={field.id}
                field={field}
                value={form.custom_answers[field.id]}
                onSet={setAnswer}
                onToggle={toggleCheckbox}
              />
            ))}

            <div className="actions">
              <button disabled={submitting}>{submitting ? '提交中...' : '提交报名'}</button>
            </div>
          </form>

          {message && <p className="muted">{message}</p>}
          {manageUrl && (
            <div className="card mine-card nested-card">
              <h3>我的报名管理链接</h3>
              <p className="muted">请复制保存。以后可用它修改或删除自己的报名。</p>
              <input readOnly value={manageUrl} onFocus={e => e.target.select()} />
              <div className="actions">
                <button type="button" className="secondary" onClick={copyManageUrl}>复制链接</button>
              </div>
            </div>
          )}
        </section>
      )}

      <p className="privacy">您填写的信息仅用于本次英语沙龙活动联系与报名确认，不会用于其他用途。</p>
    </main>
  );
}

function CustomField({ field, value, onSet, onToggle }) {
  return (
    <div>
      <label>{field.label}</label>
      {field.type === 'textarea' && (
        <textarea value={value || ''} onChange={e => onSet(field, e.target.value)} />
      )}
      {field.type === 'text' && (
        <input value={value || ''} onChange={e => onSet(field, e.target.value)} />
      )}
      {field.type === 'radio' && (field.options || []).map(option => (
        <label key={option} className="option-label">
          <input type="radio" name={field.id} checked={value === option} onChange={() => onSet(field, option)} />
          {' '}{option}
        </label>
      ))}
      {field.type === 'checkbox' && (field.options || []).map(option => (
        <label key={option} className="option-label">
          <input type="checkbox" checked={(value || []).includes(option)} onChange={() => onToggle(field, option)} />
          {' '}{option}
        </label>
      ))}
    </div>
  );
}

function ManageRegistrationPage({ token }) {
  const [registration, setRegistration] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api(`/api/registrations/${token}`)
      .then(data => {
        if (!data.ok) throw new Error(data.message);
        setRegistration(data.registration);
      })
      .catch(err => setMessage(err.message))
      .finally(() => setLoading(false));
  }, [token]);

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
    const data = await api(`/api/registrations/${token}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(registration)
    });
    if (!data.ok) return setMessage(data.message);
    setRegistration(data.registration);
    setMessage('报名信息已更新。');
  }

  async function remove() {
    if (!confirm('确定删除自己的报名吗？删除后会释放名额。')) return;
    const data = await api(`/api/registrations/${token}`, { method: 'DELETE' });
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
            <CustomField
              key={field.id}
              field={field}
              value={registration.custom_answers?.[field.id]}
              onSet={setAnswer}
              onToggle={toggleCheckbox}
            />
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

function AdminPage() {
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
    return `${window.location.origin}/activity/${selected.id}`;
  }, [selected]);

  function headers(t = token) {
    return { authorization: `Bearer ${t}`, 'content-type': 'application/json' };
  }

  async function login(e) {
    e.preventDefault();
    setMessage('');
    const data = await api('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (!data.ok) return setMessage(data.message);
    localStorage.setItem('english_salon_admin_token', data.token);
    setToken(data.token);
    setPassword('');
    await loadActivities(data.token);
  }

  async function loadActivities(t = token) {
    const data = await api('/api/activities', { headers: headers(t) });
    if (!data.ok) return setMessage(data.message);
    setActivities(data.activities);
    if (!selected && data.activities[0]) selectActivity(data.activities[0], t);
  }

  async function selectActivity(activity, t = token) {
    setSelected(JSON.parse(JSON.stringify(activity)));
    const data = await api(`/api/activities/${activity.id}/registrations`, { headers: headers(t) });
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
    try {
      const isNew = !selected.id;
      const data = await api(isNew ? '/api/activities' : `/api/activities/${selected.id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: headers(),
        body: JSON.stringify(selected)
      });
      if (!data.ok) {
        const message = formatApiError(data, '保存活动失败');
        setMessage(message);
        alert(message);
        return;
      }
      setMessage('活动已保存。');
      await loadActivities();
      setSelected(data.activity);
      if (data.activity?.id) await selectActivity(data.activity);
    } catch (err) {
      const message = `保存活动失败\n${err?.message || err}`;
      setMessage(message);
      alert(message);
      console.error('saveActivity error', err);
    }
  }

  async function deleteActivity() {
    if (!selected?.id || !confirm('确定删除这个活动吗？')) return;
    const data = await api(`/api/activities/${selected.id}`, { method: 'DELETE', headers: headers() });
    if (!data.ok) return setMessage(data.message);
    setSelected(null);
    setRegistrations([]);
    await loadActivities();
  }

  async function deleteRegistration(id) {
    if (!confirm('确定删除这条报名吗？删除后会释放名额。')) return;
    const data = await api(`/api/admin/registrations/${id}`, { method: 'DELETE', headers: headers() });
    if (!data.ok) return setMessage(data.message);
    await selectActivity(selected);
  }

  async function updateRegistration(reg) {
    const data = await api(`/api/admin/registrations/${reg.id}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(reg)
    });
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

  function exportCsv(e) {
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
            <div key={activity.id} className="card compact-card">
              <h3>{activity.title}</h3>
              <p className="muted">{activity.event_time || '时间待定'} · {activity.registered_count}/{activity.max_people || '不限'}</p>
              <div className="actions">
                <button className="secondary" onClick={() => selectActivity(activity)}>管理</button>
                <a className="button secondary" href={`/activity/${activity.id}`} target="_blank" rel="noreferrer">打开报名页</a>
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

              <h3 className="section-title">自定义报名字段</h3>
              {(selected.custom_fields || []).map((field, index) => (
                <div className="card compact-card" key={field.id}>
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
            <a className="button secondary" href={`/api/admin/export/${selected.id}`} onClick={exportCsv}>导出 CSV</a>
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

function App() {
  const path = window.location.pathname;
  if (path.startsWith('/activity/')) return <ActivityPage id={decodeURIComponent(path.split('/')[2] || '')} />;
  if (path.startsWith('/manage/')) return <ManageRegistrationPage token={decodeURIComponent(path.split('/')[2] || '')} />;
  if (path === '/admin') return <AdminPage />;
  return <HomePage />;
}

createRoot(document.getElementById('root')).render(<App />);

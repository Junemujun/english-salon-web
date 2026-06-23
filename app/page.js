export default function HomePage() {
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

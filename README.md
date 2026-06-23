# 英语沙龙网页版报名系统

这是一个适合发到微信群的网页报名系统：

- 家长点活动链接即可报名
- 报名成功后生成“我的报名管理链接”
- 管理员密码登录后台，查看完整电话和名单
- 支持自定义报名字段
- Supabase 免费数据库 + Vercel 免费部署

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Supabase 建表

在 Supabase SQL Editor 执行：

```sql
-- 见 supabase/schema.sql
```

## Vercel 环境变量

```text
NEXT_PUBLIC_SITE_URL=https://你的域名.vercel.app
SUPABASE_URL=Supabase Project URL
SUPABASE_SERVICE_ROLE_KEY=Supabase service_role key
ADMIN_PASSWORD=june
ADMIN_SESSION_SECRET=任意长随机字符串
```

## 使用

1. 打开 `/admin`
2. 输入管理员密码
3. 创建活动
4. 复制活动链接，例如：

```text
https://你的域名.vercel.app/activity/活动ID
```

发到微信群即可。

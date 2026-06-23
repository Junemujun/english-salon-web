import './globals.css';

export const metadata = {
  title: '英语沙龙报名',
  description: '英语沙龙活动网页版报名系统'
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

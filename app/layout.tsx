import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "학교 업무관리",
  description: "학사일정 · 업무 분장 · 학생 참여 관리",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // suppressHydrationWarning — 브라우저 확장(다크모드 등)이 React 가 붙기 전에
  // <html> 에 속성(dm-loaded 같은)을 끼워넣어 하이드레이션 불일치가 납니다.
  // 이 속성은 해당 엘리먼트의 '속성'에만, '한 단계'까지만 적용되므로
  // 실제 코드에서 생긴 불일치는 그대로 잡힙니다.
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}

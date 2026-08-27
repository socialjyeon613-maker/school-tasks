import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "학교 업무관리",
  description: "학사일정 · 업무 분장 · 학생 참여 관리",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}

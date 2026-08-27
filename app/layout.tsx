import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorker from "./service-worker";

/**
 * 배포 주소. OG 이미지 같은 절대 URL 을 만들 때 씁니다.
 * Vercel 은 VERCEL_PROJECT_PRODUCTION_URL 을 넣어 주므로 따로 설정하지 않아도
 * 운영 주소가 잡히고, 로컬에서는 localhost 로 떨어집니다.
 */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ? process.env.NEXT_PUBLIC_SITE_URL
  : process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000";

const title = "학교 업무관리 시스템";
const description =
  "학사일정 · 업무 분장 · 학생 참여를 한 곳에서. 날짜와 교시로 짜는 학년 일정표, 반별 참여 체크와 자동 집계.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: `%s · ${title}`,
  },
  description,
  applicationName: title,
  keywords: ["학사일정", "학교", "업무분장", "출결", "교직원", "학년부장", "담임"],
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: title,
    title,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  // 홈화면에 추가했을 때 iOS 가 앱처럼 띄우도록
  appleWebApp: {
    capable: true,
    title: "학교업무",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  // 학교 내부용이라 검색엔진에 올리지 않습니다.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#225286",
  width: "device-width",
  initialScale: 1,
  // 선생님들이 명렬표를 확대해 볼 수 있어야 합니다 — 확대를 막지 않습니다.
  maximumScale: 5,
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
        <ServiceWorker />
      </body>
    </html>
  );
}

import type { MetadataRoute } from "next";

/**
 * PWA 매니페스트.
 * 선생님들이 폰 홈화면에 추가해 앱처럼 쓸 수 있게 합니다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "학교 업무관리 시스템",
    short_name: "학교업무",
    description: "학사일정 · 업무 분장 · 학생 참여를 한 곳에서",
    lang: "ko",
    start_url: "/schools",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#225286",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // maskable 은 안드로이드가 원형·물방울 등 기기 모양으로 잘라냅니다.
      // 안전영역(가운데 80%) 안에 엠블럼이 들어가도록 따로 만들었습니다.
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "내 할 일", url: "/schools", description: "오늘 해야 할 일" },
      { name: "학사일정", url: "/schools", description: "월간 일정표" },
    ],
  };
}

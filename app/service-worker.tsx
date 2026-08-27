"use client";

import { useEffect } from "react";

/**
 * 서비스 워커 등록.
 * 개발 중에는 캐시가 헷갈리게 하므로 운영에서만 붙입니다.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // 등록에 실패해도 앱은 그대로 동작합니다.
      });
    };

    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}

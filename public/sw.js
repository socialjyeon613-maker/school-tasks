/*
  서비스 워커 — PWA 설치 요건이자, 접속이 끊겼을 때 안내를 띄웁니다.

  일부러 캐시를 거의 쓰지 않습니다.
  학사일정 · 참여 현황 · 쪽지는 늘 최신이어야 하는 데이터라,
  오래된 화면을 보여주는 것이 안 보여주는 것보다 나쁩니다.
  아이콘 같은 정적 파일만 담아 둡니다.
*/
const VERSION = "v1";
const SHELL = `shell-${VERSION}`;
const SHELL_FILES = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 화면 이동은 항상 네트워크 우선. 끊겼을 때만 안내 페이지.
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request).catch(() =>
        caches.match("/offline.html").then((r) => r ?? Response.error())
      )
    );
    return;
  }

  // 아이콘 등 정적 파일만 캐시에서
  if (url.pathname.startsWith("/icons/")) {
    e.respondWith(caches.match(request).then((r) => r ?? fetch(request)));
  }
});

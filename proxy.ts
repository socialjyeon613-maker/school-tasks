import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getVerifiedClaims } from "@/lib/supabase/auth";

// Next 16 부터 middleware.ts → proxy.ts, middleware() → proxy() 로 바뀌었습니다.

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  // 도움말 — 가입 전에 링크만 받아 읽어볼 수 있어야 합니다.
  "/help",
  // PWA — 브라우저가 로그인 없이 가져갑니다.
  "/manifest.webmanifest",
  "/sw.js",
  "/offline.html",
];

function isPublic(pathname: string) {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/invite/") ||
    // 캘린더 구독 — 폰 캘린더 앱은 로그인을 할 수 없습니다.
    // 대신 주소에 든 비밀 토큰이 열쇠이고, calendar_feed() 가 범위를 정합니다.
    pathname.startsWith("/ical/")
  );
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 세션 확인 + 갱신. getClaims() 는 JWT 를 로컬에서 검증하므로
  // 매 요청마다 Auth 서버로 왕복하지 않습니다.
  const claims = await getVerifiedClaims(supabase);
  const signedIn = Boolean(claims?.sub);

  const { pathname } = request.nextUrl;

  if (!signedIn && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (signedIn && (pathname === "/login" || pathname === "/signup")) {
    const next = request.nextUrl.searchParams.get("next");
    const url = request.nextUrl.clone();
    url.pathname = next && next.startsWith("/") ? next : "/schools";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

import type { JWK, SupabaseClient } from "@supabase/supabase-js";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

/* ------------------------------------------------------------------
   JWT 서명 공개키(JWKS) 캐시

   supabase-js 의 JWKS 캐시는 클라이언트 인스턴스 단위인데, 서버에서는
   요청마다 새 클라이언트를 만들기 때문에 매번 공개키를 다시 받아오게 된다.
   프로세스 단위로 캐시해 getClaims 에 직접 넘긴다.
------------------------------------------------------------------ */

const JWKS_TTL_MS = 10 * 60 * 1000;
let jwksCache: { keys: JWK[]; at: number } | null = null;
let jwksInFlight: Promise<JWK[]> | null = null;

async function loadJwks(): Promise<JWK[]> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.at < JWKS_TTL_MS) return jwksCache.keys;
  if (jwksInFlight) return jwksInFlight;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return [];

  jwksInFlight = (async () => {
    try {
      const res = await fetch(`${base}/auth/v1/.well-known/jwks.json`, {
        next: { revalidate: 600 },
      });
      const data = (await res.json()) as { keys?: JWK[] };
      jwksCache = { keys: data.keys ?? [], at: Date.now() };
      return jwksCache.keys;
    } catch {
      // 실패하면 supabase-js 가 알아서 받아오도록 빈 배열을 넘긴다
      return [];
    } finally {
      jwksInFlight = null;
    }
  })();

  return jwksInFlight;
}

/** JWT 클레임을 로컬에서 검증해 읽는다 (Auth 서버 왕복 없음) */
export async function getVerifiedClaims(supabase: SupabaseClient) {
  const keys = await loadJwks();
  const { data } = await supabase.auth.getClaims(
    undefined,
    keys.length > 0 ? { keys } : undefined
  );
  return data?.claims ?? null;
}

/** 로그인 사용자 정보 */
export async function getSessionUser(
  supabase: SupabaseClient
): Promise<SessionUser | null> {
  const claims = await getVerifiedClaims(supabase);
  if (!claims?.sub) return null;

  const meta = (claims.user_metadata ?? {}) as { name?: string };
  const email = typeof claims.email === "string" ? claims.email : "";
  return {
    id: claims.sub,
    email,
    name: meta.name?.trim() || email.split("@")[0] || "",
  };
}

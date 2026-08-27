import { createBrowserClient } from "@supabase/ssr";

/**
 * NEXT_PUBLIC_* 는 빌드 시점에 번들로 박힙니다.
 * .env.local 을 만들기 전에 dev 서버를 띄웠다면 값이 undefined 인 채로 굳어,
 * 버튼을 눌러도 아무 일이 안 일어나는 것처럼 보입니다.
 * 조용히 죽지 않도록 여기서 분명히 실패시킵니다.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase 환경변수가 없습니다. .env.local 에 NEXT_PUBLIC_SUPABASE_URL 과 " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY 를 넣고 dev 서버를 다시 시작하세요."
    );
  }

  return createBrowserClient(url, key);
}

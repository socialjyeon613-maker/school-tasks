import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";
import AcceptInvite from "./accept-invite";

const STATUS_MESSAGE: Record<string, string> = {
  NOT_FOUND: "존재하지 않는 초대 링크입니다.",
  EXPIRED: "만료된 초대 링크입니다.",
  EXHAUSTED: "사용 횟수를 모두 소진한 초대 링크입니다.",
};

// Next 16 에서 params 는 Promise 입니다.
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_invite_info", { p_token: token });
  const info = Array.isArray(data) ? data[0] : data;
  const user = await getSessionUser(supabase);

  if (!info || info.status !== "VALID") {
    return (
      <Shell>
        <p className="text-slate-600">
          {STATUS_MESSAGE[info?.status] ?? "초대를 확인할 수 없습니다."}
        </p>
      </Shell>
    );
  }

  const domains: string[] = info.allowed_domains ?? [];
  const emailDomain = user?.email.split("@")[1]?.toLowerCase() ?? "";
  const domainOk =
    domains.length === 0 || domains.some((d) => d.toLowerCase() === emailDomain);

  return (
    <Shell>
      <p className="mb-1 text-sm text-slate-500">초대받은 학교</p>
      <h2 className="mb-6 text-lg font-bold">{info.school_name}</h2>

      {!user ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            초대를 수락하려면 먼저 로그인하세요.
          </p>
          <div className="flex gap-2">
            <Link
              href={`/login?next=/invite/${token}`}
              className="flex-1 rounded-lg bg-slate-900 py-2.5 text-center font-medium text-white"
            >
              로그인
            </Link>
            <Link
              href={`/signup?next=/invite/${token}`}
              className="flex-1 rounded-lg border border-slate-300 py-2.5 text-center font-medium"
            >
              가입
            </Link>
          </div>
        </div>
      ) : !domainOk ? (
        <div className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-800">
          이 학교는 <b>{domains.join(", ")}</b> 도메인 계정만 합류할 수 있습니다.
          <br />
          현재 로그인: {user.email}
        </div>
      ) : (
        <AcceptInvite token={token} />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-xl font-bold">학교 합류</h1>
        {children}
      </div>
    </main>
  );
}

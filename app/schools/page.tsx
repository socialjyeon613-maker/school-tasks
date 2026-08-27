import Link from "next/link";
import { listMySchools } from "@/lib/school";
import { ROLE_LABEL } from "@/lib/types";
import CreateSchool from "./create-school";
import SignOut from "./sign-out";

export default async function SchoolsPage() {
  const rows = await listMySchools();

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">학교 선택</h1>
          <p className="mt-1 text-sm text-slate-500">
            소속된 학교가 여기에 표시됩니다.
          </p>
        </div>
        <SignOut />
      </div>

      {rows.length === 0 ? (
        <div className="mb-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-600">
            아직 소속된 학교가 없습니다.
            <br />
            초대 링크를 받으셨다면 그 링크로 합류하세요.
          </p>
        </div>
      ) : (
        <ul className="mb-8 space-y-2">
          {rows.map((r) => (
            <li key={r.school.id}>
              <Link
                href={`/schools/${r.school.id}`}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 transition hover:border-slate-400"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{r.school.name}</p>
                  <p className="text-sm text-slate-500">
                    {r.year.name}
                    {/* 한 사람이 부장이면서 담임일 수 있습니다 */}
                    {r.duties.length > 0 && ` · ${r.duties.join(" · ")}`}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  {ROLE_LABEL[r.role]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CreateSchool />
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSchoolContext } from "@/lib/school";
import { formatDate } from "@/lib/format";
import SearchBox from "./search-box";

interface Hit {
  kind: string;
  id: string;
  title: string;
  subtitle: string;
  link: string;
  on_date: string | null;
}

const KIND_LABEL: Record<string, string> = {
  event: "일정",
  attachment: "첨부",
  student: "학생",
};

const KIND_STYLE: Record<string, string> = {
  event: "bg-sky-100 text-sky-800",
  attachment: "bg-violet-100 text-violet-800",
  student: "bg-amber-100 text-amber-800",
};

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ schoolId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { schoolId } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(schoolId);
  if (!ctx) notFound();

  const q = (sp.q ?? "").trim();
  const supabase = await createClient();

  const { data } = q
    ? await supabase.rpc("search_school", { p_school: schoolId, p_q: q })
    : { data: [] };

  const hits = (data ?? []) as Hit[];
  const grouped = ["event", "attachment", "student"].map((k) => ({
    kind: k,
    items: hits.filter((h) => h.kind === k),
  }));

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-3 text-lg font-bold">검색</h1>
      <SearchBox schoolId={schoolId} initial={q} />

      {q && (
        <p className="mt-3 text-sm text-slate-500">
          &ldquo;{q}&rdquo; — {hits.length}건
        </p>
      )}

      {q && hits.length === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">
          찾는 것이 없습니다.
          <br />
          <span className="text-xs">
            학생은 담당하는 반만 검색됩니다.
          </span>
        </p>
      )}

      <div className="mt-4 space-y-5">
        {grouped
          .filter((g) => g.items.length > 0)
          .map((g) => (
            <section key={g.kind}>
              <h2 className="mb-1.5 text-sm font-semibold text-slate-600">
                {KIND_LABEL[g.kind]} {g.items.length}
              </h2>
              <ul className="space-y-1">
                {g.items.map((h, i) => (
                  <li key={`${h.kind}-${h.id}-${i}`}>
                    <Link
                      href={h.link}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 transition hover:border-slate-400"
                    >
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${KIND_STYLE[h.kind]}`}
                      >
                        {KIND_LABEL[h.kind]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {h.title}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {h.subtitle}
                        </span>
                      </span>
                      {h.on_date && (
                        <span className="shrink-0 text-xs text-slate-400">
                          {formatDate(h.on_date)}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </main>
  );
}

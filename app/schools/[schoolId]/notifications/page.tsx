import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSchoolContext } from "@/lib/school";
import NotificationList, { type Notice } from "./notification-list";

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ schoolId: string }>;
}) {
  const { schoolId } = await params;
  const ctx = await getSchoolContext(schoolId);
  if (!ctx) notFound();

  const supabase = await createClient();

  // RLS 상 내 알림만 돌아옵니다.
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, read_at, created_at")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-lg font-bold">알림</h1>
      <NotificationList
        schoolId={schoolId}
        notifications={(data ?? []) as Notice[]}
      />
    </main>
  );
}

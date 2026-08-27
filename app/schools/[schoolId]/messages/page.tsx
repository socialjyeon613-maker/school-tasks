import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSchoolContext, listMembers } from "@/lib/school";
import MessageBoard, { type Conversation, type Note } from "./message-board";

export default async function MessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ schoolId: string }>;
  searchParams: Promise<{ with?: string }>;
}) {
  const { schoolId } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(schoolId);
  if (!ctx) notFound();

  const supabase = await createClient();

  // 대화를 열면 상대가 보낸 쪽지를 읽음 처리합니다.
  if (sp.with) {
    await supabase.rpc("mark_messages_read", {
      p_school: schoolId,
      p_other: sp.with,
    });
  }

  const [{ data: convRows }, members] = await Promise.all([
    supabase.rpc("my_conversations", { p_school: schoolId }),
    listMembers(schoolId, ctx.year.id),
  ]);

  const conversations = (convRows ?? []) as Conversation[];

  let thread: Note[] = [];
  if (sp.with) {
    // RLS 상 내가 낀 쪽지만 보이므로, 상대만 지정하면 됩니다.
    const { data } = await supabase
      .from("messages")
      .select("id, sender_id, body, created_at, read_at")
      .eq("school_id", schoolId)
      .or(`sender_id.eq.${sp.with},recipient_id.eq.${sp.with}`)
      .order("created_at");
    thread = (data ?? []) as Note[];
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-4 text-lg font-bold">쪽지</h1>
      <MessageBoard
        schoolId={schoolId}
        meId={ctx.userId}
        conversations={conversations}
        members={members.filter((m) => m.user_id !== ctx.userId)}
        withId={sp.with ?? ""}
        thread={thread}
      />
    </main>
  );
}

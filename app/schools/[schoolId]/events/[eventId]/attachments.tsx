"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fileIcon, formatBytes } from "@/lib/format";

interface Attachment {
  id: string;
  kind: "file" | "link";
  file_path: string | null;
  url: string | null;
  file_name: string;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
  profile: { name: string } | null;
}

/** Supabase 무료 플랜의 파일당 기본 상한 */
const MAX_BYTES = 50 * 1024 * 1024;

/**
 * 스토리지 경로는 `{school_id}/{event_id}/{uuid}.{ext}` 입니다.
 * 첫 두 폴더가 RLS 정책의 검사 대상이라 순서를 바꾸면 안 됩니다.
 * 한글 파일명은 키로 쓰지 않고 DB의 file_name 에만 보관합니다.
 */
function storagePath(schoolId: string, eventId: string, name: string) {
  const ext = name.includes(".") ? "." + name.split(".").pop() : "";
  return `${schoolId}/${eventId}/${crypto.randomUUID()}${ext}`;
}

export default function Attachments({
  schoolId,
  eventId,
  meId,
}: {
  schoolId: string;
  eventId: string;
  meId: string;
}) {
  const [rows, setRows] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("event_attachments")
      .select("id, kind, file_path, url, file_name, file_size, uploaded_by, created_at, profile:profiles(name)")
      .eq("event_id", eventId)
      .order("created_at");
    setRows((data ?? []) as unknown as Attachment[]);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setError("");

    const supabase = createClient();

    for (const [i, file] of list.entries()) {
      if (file.size > MAX_BYTES) {
        setError(`${file.name} 은(는) ${formatBytes(MAX_BYTES)} 를 넘습니다.`);
        continue;
      }

      setBusy(`${i + 1}/${list.length} · ${file.name}`);
      const path = storagePath(schoolId, eventId, file.name);

      const { error: upErr } = await supabase.storage
        .from("attachments")
        .upload(path, file, { contentType: file.type || undefined });

      if (upErr) {
        setError(`${file.name} 업로드 실패: ${upErr.message}`);
        continue;
      }

      const { error: dbErr } = await supabase.from("event_attachments").insert({
        event_id: eventId,
        kind: "file",
        file_path: path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || null,
        uploaded_by: meId,
      });

      if (dbErr) {
        // 목록에 안 잡히는 파일이 스토리지에 남지 않도록 되돌립니다.
        await supabase.storage.from("attachments").remove([path]);
        setError(`${file.name} 등록 실패: ${dbErr.message}`);
      }
    }

    setBusy("");
    if (inputRef.current) inputRef.current.value = "";
    load();
  }

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    const url = linkUrl.trim();
    if (!url) return;

    const supabase = createClient();
    const { error } = await supabase.from("event_attachments").insert({
      event_id: eventId,
      kind: "link",
      url,
      file_name: linkName.trim() || url,
      uploaded_by: meId,
    });

    if (error) {
      setError("링크 추가에 실패했습니다.");
      return;
    }
    setLinkUrl("");
    setLinkName("");
    setLinkOpen(false);
    load();
  }

  /** 비공개 버킷이라 매번 서명된 URL 을 발급받아 엽니다. */
  async function open(a: Attachment) {
    if (a.kind === "link") {
      window.open(a.url!, "_blank", "noopener,noreferrer");
      return;
    }

    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("attachments")
      .createSignedUrl(a.file_path!, 60, { download: a.file_name });

    if (error || !data) {
      setError("파일을 여는 데 실패했습니다.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function remove(a: Attachment) {
    const supabase = createClient();

    const { error } = await supabase
      .from("event_attachments")
      .delete()
      .eq("id", a.id);

    if (error) {
      setError("삭제할 권한이 없습니다.");
      return;
    }
    if (a.file_path)
      await supabase.storage.from("attachments").remove([a.file_path]);

    load();
  }

  return (
    <section className="no-print mt-4 rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-3 font-semibold">
        첨부 {rows.length > 0 && rows.length}
      </h2>

      {rows.length > 0 && (
        <ul className="mb-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {rows.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span aria-hidden>
                {a.kind === "link" ? "🔗" : fileIcon(a.file_name)}
              </span>

              <button
                onClick={() => open(a)}
                className="flex-1 truncate text-left font-medium hover:underline"
                title={a.file_name}
              >
                {a.file_name}
              </button>

              <span className="shrink-0 text-xs text-slate-400">
                {formatBytes(a.file_size)}
                {a.profile?.name && ` · ${a.profile.name}`}
              </span>

              {a.uploaded_by === meId && (
                <button
                  onClick={() => remove(a)}
                  className="shrink-0 text-xs text-slate-400 hover:text-rose-600"
                >
                  삭제
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files);
        }}
        className={`rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
          dragging ? "border-slate-900 bg-slate-50" : "border-slate-300"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={(e) => e.target.files && upload(e.target.files)}
          className="hidden"
          id="attachment-input"
        />

        {busy ? (
          <p className="text-sm text-slate-600">업로드 중… {busy}</p>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              파일을 끌어다 놓거나{" "}
              <label
                htmlFor="attachment-input"
                className="cursor-pointer font-medium text-slate-900 underline"
              >
                선택
              </label>
              하세요
            </p>
            <p className="mt-1 text-xs text-slate-400">
              한글(.hwp/.hwpx) 포함 · 파일당 최대 {formatBytes(MAX_BYTES)}
            </p>
          </>
        )}
      </div>

      <div className="mt-3">
        {linkOpen ? (
          <form onSubmit={addLink} className="flex flex-wrap gap-2">
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://…"
              type="url"
              required
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
            <input
              value={linkName}
              onChange={(e) => setLinkName(e.target.value)}
              placeholder="표시 이름 (선택)"
              className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
            <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              추가
            </button>
            <button
              type="button"
              onClick={() => setLinkOpen(false)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              취소
            </button>
          </form>
        ) : (
          <button
            onClick={() => setLinkOpen(true)}
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            + 링크 추가
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
    </section>
  );
}

import { redirect } from "next/navigation";

export default async function SchoolHome({
  params,
}: {
  params: Promise<{ schoolId: string }>;
}) {
  const { schoolId } = await params;
  redirect(`/schools/${schoolId}/calendar`);
}

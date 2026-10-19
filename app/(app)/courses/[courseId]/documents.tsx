import { revalidatePath } from "next/cache";
import Link from "next/link";
import { DocumentRow } from "@/components/course/document-row";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

async function deleteDocument(documentId: string, courseId: string) {
  "use server";
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (doc) {
    await supabase.storage.from("documents").remove([doc.storage_path]);
    await supabase.from("documents").delete().eq("id", documentId); // cascades pages, chunks, jobs
  }
  revalidatePath(`/courses/${courseId}`);
}

export async function CourseDocuments({ courseId }: { courseId: string }) {
  const supabase = await createClient();
  const { data: documents } = await supabase
    .from("documents")
    .select("id, title, week_number, status, error, page_count")
    .eq("course_id", courseId)
    .order("week_number", { ascending: true, nullsFirst: false })
    .order("created_at");

  const groups = new Map<number | null, NonNullable<typeof documents>>();
  for (const doc of documents ?? []) {
    groups.set(doc.week_number, [...(groups.get(doc.week_number) ?? []), doc]);
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Notlar</h2>
        <Button
          nativeButton={false}
          render={<Link href={`/courses/${courseId}/upload`} />}
          className="min-h-11"
        >
          Not yükle
        </Button>
      </div>

      {groups.size === 0 && (
        <p className="text-sm text-muted-foreground">Henüz not yüklemedin.</p>
      )}

      {[...groups].map(([week, docs]) => (
        <div key={week ?? "none"} className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              {week === null ? "Haftaya bağlı değil" : `${week}. Hafta`}
            </h3>
            {week !== null && (
              <Link
                href={`/courses/${courseId}/week/${week}`}
                className="flex min-h-11 items-center text-sm underline underline-offset-4"
              >
                Haftayı anlat
              </Link>
            )}
          </div>
          <ul className="space-y-2">
            {docs.map((doc) => (
              <DocumentRow
                key={doc.id}
                id={doc.id}
                title={doc.title}
                status={doc.status}
                error={doc.error}
                pageCount={doc.page_count}
                deleteAction={deleteDocument.bind(null, doc.id, courseId)}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

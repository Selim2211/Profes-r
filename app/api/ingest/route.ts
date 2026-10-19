import { z } from "zod";
import { startIngestJob } from "@/lib/ingest/pipeline";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const bodySchema = z.object({ documentId: z.string().uuid() });

// Creates (or revives after a failure) the ingestion job for a document.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Giriş gerekli." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Geçersiz istek." }, { status: 400 });

  try {
    const jobId = await startIngestJob(supabase, parsed.data.documentId);
    return Response.json({ jobId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "İş başlatılamadı.";
    return Response.json({ error: message }, { status: 400 });
  }
}

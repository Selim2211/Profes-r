import { z } from "zod";
import { runGuarded } from "@/lib/ai/guard";
import { runIngestStep } from "@/lib/ingest/pipeline";
import { createClient } from "@/lib/supabase/server";

// One slice of work (pages read by the vision model, embeddings, the week summary) can take over a minute on
// a free model, so this uses the longest duration Vercel allows on the free plan.
export const maxDuration = 300;

// Processes one slice of the job; the client calls this repeatedly until the stage is done or failed.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Giriş gerekli." }, { status: 401 });

  const { jobId } = await params;
  if (!z.string().uuid().safeParse(jobId).success) {
    return Response.json({ error: "Geçersiz iş." }, { status: 400 });
  }

  // Embeddings are logged as "embed", page transcription as "ocr"; the rest of ingestion (the week summary) is "summarize".
  return runGuarded(supabase, auth.user.id, "summarize", {}, async () => {
    try {
      return Response.json(await runIngestStep(supabase, jobId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "İşlem başarısız.";
      return Response.json({ error: message }, { status: 400 });
    }
  });
}

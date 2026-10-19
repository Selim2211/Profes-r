import { z } from "zod";
import { runSummaryStep } from "@/lib/summary/pipeline";
import { createClient } from "@/lib/supabase/server";

// A slice can include a long model call (writing or checking the summary).
export const maxDuration = 300;

// Processes one slice of the job; the client calls this repeatedly until the step is done or failed.
export async function POST(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Giriş gerekli." }, { status: 401 });

  const { jobId } = await params;
  if (!z.string().uuid().safeParse(jobId).success) return Response.json({ error: "Geçersiz iş." }, { status: 400 });

  try {
    return Response.json(await runSummaryStep(supabase, jobId));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "İşlem başarısız." }, { status: 400 });
  }
}

import { z } from "zod";
import { startSummaryJob } from "@/lib/summary/pipeline";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

const bodySchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("document"),
    courseId: z.string().uuid(),
    documentId: z.string().uuid(),
    level: z.enum(["short", "standard", "detailed"]),
  }),
  z.object({
    scope: z.literal("week"),
    courseId: z.string().uuid(),
    weekNumber: z.number().int().min(1).max(52),
    level: z.enum(["short", "standard", "detailed"]),
  }),
]);

// Creates (or resumes) the summary job for a document or a week.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Giriş gerekli." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Geçersiz istek." }, { status: 400 });

  try {
    const jobId = await startSummaryJob(supabase, parsed.data);
    return Response.json({ jobId });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "İş başlatılamadı." }, { status: 400 });
  }
}

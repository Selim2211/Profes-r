import { streamText } from "ai";
import { z } from "zod";
import { runGuarded } from "@/lib/ai/guard";
import { chatModel } from "@/lib/ai/models";
import { WEEK_LECTURE_PROMPT } from "@/lib/ai/prompts";
import { formatWeekForPrompt, getWeekContent } from "@/lib/rag/week";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const bodySchema = z.object({
  courseId: z.string().uuid(),
  week: z.number().int().min(1).max(52),
});

// Streams the detailed "explain this week" lecture, generated on demand from the week's notes.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Giriş gerekli." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Geçersiz istek." }, { status: 400 });

  return runGuarded(supabase, auth.user.id, "summarize", {}, async () => {
    const content = await getWeekContent(supabase, parsed.data.courseId, parsed.data.week);
    if (!content) {
      return Response.json({ error: `${parsed.data.week}. hafta için yüklenmiş not yok.` }, { status: 404 });
    }

    const result = streamText({
      model: chatModel(),
      system: WEEK_LECTURE_PROMPT,
      prompt: formatWeekForPrompt(content),
    });
    return result.toTextStreamResponse();
  });
}

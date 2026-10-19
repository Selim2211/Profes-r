"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { saveSummary } from "@/lib/summary/store";
import type { SummaryLevel } from "@/lib/summary/template";

const inputSchema = z.object({
  summaryId: z.string().uuid(),
  contentMd: z.string().trim().min(20, "Özet çok kısa.").max(200_000, "Özet çok uzun."),
});

// A user edit is stored as a new version of the same summary; earlier versions stay available.
export async function saveEditedSummary(summaryId: string, contentMd: string): Promise<{ id?: string; error?: string }> {
  const parsed = inputSchema.safeParse({ summaryId, contentMd });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Giriş gerekli." };

  const { data: base } = await supabase.from("summaries").select("*").eq("id", parsed.data.summaryId).maybeSingle();
  if (!base) return { error: "Özet bulunamadı." };

  const verification = { ...((base.verification as Record<string, unknown> | null) ?? {}), edited: true, editedFromVersion: base.version };
  const common = { userId: auth.user.id, courseId: base.course_id as string };
  const target =
    base.scope === "document"
      ? ({ ...common, scope: "document", documentId: base.document_id as string } as const)
      : ({ ...common, scope: "week", weekNumber: base.week_number as number } as const);

  try {
    const saved = await saveSummary(supabase, {
      ...target,
      level: base.level as SummaryLevel,
      contentMd: parsed.data.contentMd,
      model: "kullanici-duzenlemesi",
      coverage: base.coverage as number | null,
      verification,
      status: "ready",
    });
    return { id: saved.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Kaydedilemedi." };
  }
}

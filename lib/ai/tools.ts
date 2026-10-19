import type { SupabaseClient } from "@supabase/supabase-js";
import { tool } from "ai";
import { z } from "zod";
import { citationLabel, searchNotes, toCitation, type Citation } from "@/lib/rag/search";
import { getWeekContent } from "@/lib/rag/week";
import { getSavedWeekSummary } from "@/lib/summary/saved";

export type ToolContext = {
  supabase: SupabaseClient;
  // Course the conversation is bound to; null for general chats.
  courseId: string | null;
  // Collects every note returned to the model so the saved message can carry its sources.
  citations: Map<string, Citation & { label: string; pageStart: number; pageEnd: number }>;
};

export function createTools(ctx: ToolContext) {
  return {
    search_notes: tool({
      description:
        "Öğrencinin yüklediği ders notlarında arama yapar. Ders içeriğiyle ilgili her soruda önce bunu kullan. Sonuçlar kaynak etiketiyle gelir.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Aranacak konu veya soru, kısa ve net"),
        courseId: z.string().uuid().optional().describe("Ders kimliği; sohbet bir derse bağlı değilse kullan"),
        weeks: z.array(z.number().int().min(1).max(52)).optional().describe("Yalnızca bu haftalarda ara"),
      }),
      execute: async ({ query, courseId, weeks }) => {
        const hits = await searchNotes(ctx.supabase, {
          query,
          courseId: ctx.courseId ?? courseId ?? null,
          weeks,
        });

        return hits.map((hit) => {
          const label = citationLabel(hit);
          ctx.citations.set(hit.id, {
            ...toCitation(hit),
            label,
            pageStart: hit.page_start,
            pageEnd: hit.page_end,
          });
          return {
            etiket: label,
            hafta: hit.week_number,
            sayfa: hit.page_start === hit.page_end ? `${hit.page_start}` : `${hit.page_start}-${hit.page_end}`,
            baslik: hit.heading,
            metin: hit.content,
          };
        });
      },
    }),

    get_week_content: tool({
      description:
        "Bir dersin belirli bir haftasının özetini, konularını ve notlarını getirir. Öğrenci bir haftayı anlatmanı istediğinde ('3. haftayı anlat') kullan.",
      inputSchema: z.object({
        week: z.number().int().min(1).max(52).describe("Hafta numarası"),
        courseId: z.string().uuid().optional().describe("Ders kimliği; sohbet bir derse bağlı değilse kullan"),
        level: z
          .enum(["short", "standard", "detailed"])
          .optional()
          .describe("Kayıtlı özetin seviyesi: öğrenci 'kısa özet' isterse short, 'detaylı' isterse detailed"),
      }),
      execute: async ({ week, courseId, level }) => {
        const effectiveCourse = ctx.courseId ?? courseId;
        if (!effectiveCourse) {
          return { hata: "Hangi dersin haftası olduğu belli değil. Öğrenciye hangi dersi kastettiğini sor." };
        }

        // A saved summary is generated, checked for coverage and verified against the notes: prefer it.
        const saved = await getSavedWeekSummary(ctx.supabase, effectiveCourse, week, level);
        if (saved) {
          return {
            hafta: week,
            kayitliOzet: { seviye: saved.level, versiyon: saved.version, metin: saved.contentMd },
          };
        }

        const content = await getWeekContent(ctx.supabase, effectiveCourse, week);
        if (!content) return { hata: `Bu derste ${week}. hafta için yüklenmiş not yok.` };
        const courseLink = `/courses/${effectiveCourse}`;

        for (const chunk of content.chunks) {
          ctx.citations.set(chunk.id, {
            ...toCitation({ ...chunk, course_id: effectiveCourse, score: 0 }),
            label: chunk.label,
            pageStart: chunk.page_start,
            pageEnd: chunk.page_end,
          });
        }

        return {
          hafta: content.week,
          kayitliOzet: null,
          ozetSayfasi: courseLink,
          baslik: content.title,
          ozet: content.summary,
          konular: content.topics,
          kismi: content.truncated,
          parcalar: content.chunks.map((c) => ({
            etiket: c.label,
            sayfa: c.page_start === c.page_end ? `${c.page_start}` : `${c.page_start}-${c.page_end}`,
            baslik: c.heading,
            metin: c.content,
          })),
        };
      },
    }),
  };
}

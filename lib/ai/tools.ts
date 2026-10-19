import type { SupabaseClient } from "@supabase/supabase-js";
import { tool } from "ai";
import { z } from "zod";
import { citationLabel, searchNotes, toCitation, type Citation } from "@/lib/rag/search";

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
  };
}

import { z } from "zod";

export const weekSummarySchema = z.object({
  weekTitle: z.string().describe("Kısa hafta başlığı (Türkçe)"),
  topics: z
    .array(
      z.object({
        name: z.string().describe("Kavram/konu adı, kısa ve tekil"),
        description: z.string().describe("Tek cümlelik açıklama"),
      }),
    )
    .min(1)
    .max(15),
  summary: z.string().describe("Markdown formatında hafta özeti (Türkçe)"),
});

export type WeekSummary = z.infer<typeof weekSummarySchema>;

const pagesField = z.array(z.number().int()).describe("Bilginin geçtiği sayfa numaraları ([s.N] işaretlerinden)");

// MAP output: structured notes extracted from one section of a document.
export const sectionNotesSchema = z.object({
  keyPoints: z.array(z.object({ text: z.string(), pages: pagesField })),
  definitions: z.array(z.object({ term: z.string(), text: z.string(), pages: pagesField })),
  formulas: z.array(
    z.object({
      latex: z.string().describe("Formül, LaTeX olarak ($ işaretleri olmadan)"),
      meaning: z.string().describe("Notlarda formülün ne anlama geldiği/ne zaman kullanıldığı"),
      pages: pagesField,
    }),
  ),
  examples: z.array(z.object({ text: z.string(), pages: pagesField })),
  warnings: z.array(z.object({ text: z.string(), pages: pagesField })),
});

export type SectionNotes = z.infer<typeof sectionNotesSchema>;

export const outlineSchema = z.object({
  sections: z
    .array(
      z.object({
        title: z.string().describe("Bölümün kısa başlığı (notlardaki dilde)"),
        startPage: z.number().int().describe("Bölümün başladığı sayfa numarası"),
      }),
    )
    .min(1)
    .max(40),
});

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

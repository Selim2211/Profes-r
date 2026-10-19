import { generateStructured } from "@/lib/ai/structured";
import { fastModel } from "@/lib/ai/models";
import { WEEK_SUMMARY_PROMPT } from "@/lib/ai/prompts";
import { weekSummarySchema, type WeekSummary } from "@/lib/ai/schemas";

const MAX_INPUT_CHARS = 60_000;

// Keeps the input within budget by sampling evenly across the notes instead of cutting off the end.
export function fitToBudget(parts: string[], maxChars = MAX_INPUT_CHARS): string {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  if (total <= maxChars) return parts.join("\n\n");

  const keepRatio = maxChars / total;
  const kept = parts.filter((_, i) => Math.floor(i * keepRatio) !== Math.floor((i - 1) * keepRatio));
  return kept.join("\n\n").slice(0, maxChars);
}

export async function summarizeWeek(input: {
  courseName: string;
  weekNumber: number | null;
  chunkTexts: string[];
}): Promise<WeekSummary> {
  const notes = fitToBudget(input.chunkTexts);
  const object = await generateStructured({
    model: fastModel(),
    schema: weekSummarySchema,
    system: WEEK_SUMMARY_PROMPT,
    prompt: `Ders: ${input.courseName}\nHafta: ${input.weekNumber ?? "belirtilmemiş"}\n\n<notlar>\n${notes}\n</notlar>`,
  });
  return object;
}

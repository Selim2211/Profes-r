import { generateText } from "ai";
import { chatModel } from "@/lib/ai/models";
import { OCR_PROMPT } from "@/lib/ai/prompts";

const PAGE_MARKER = /<<<PAGE\s+(\d+)>>>/g;

// Parses "<<<PAGE n>>>"-delimited model output into a page -> text map.
export function parseOcrOutput(output: string): Map<number, string> {
  const result = new Map<number, string>();
  const markers = [...output.matchAll(PAGE_MARKER)];

  markers.forEach((marker, i) => {
    const start = (marker.index ?? 0) + marker[0].length;
    const end = markers[i + 1]?.index ?? output.length;
    result.set(Number(marker[1]), output.slice(start, end).trim());
  });
  return result;
}

// Sends the PDF to the multimodal model and asks it to transcribe only the given pages.
export async function ocrPages(
  pdf: Uint8Array,
  pages: number[],
): Promise<Map<number, string>> {
  if (pages.length === 0) return new Map();

  const { text } = await generateText({
    model: chatModel(),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `${OCR_PROMPT}\n\nİstenen sayfalar: ${pages.join(", ")}` },
          { type: "file", data: pdf, mediaType: "application/pdf" },
        ],
      },
    ],
  });

  const parsed = parseOcrOutput(text);
  const wanted = new Set(pages);
  return new Map([...parsed].filter(([page]) => wanted.has(page)));
}

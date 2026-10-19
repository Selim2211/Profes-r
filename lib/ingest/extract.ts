import { extractText, getDocumentProxy } from "unpdf";
import type { PageText } from "./clean";

export const MIN_TEXT_CHARS = 30;
const TEXT_PAGE_CHARS = 3000;

export function isPdfPath(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

// Page numbers are 1-based. Returns the total page count and text for the requested range.
export async function extractPdfPages(
  data: Uint8Array,
  from: number,
  to: number,
): Promise<{ totalPages: number; pages: PageText[] }> {
  const pdf = await getDocumentProxy(data);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });

  const pages: PageText[] = [];
  for (let page = from; page <= Math.min(to, totalPages); page++) {
    pages.push({ page, text: text[page - 1] ?? "" });
  }
  return { totalPages, pages };
}

// Plain text / markdown has no pages, so it is split into virtual pages on paragraph boundaries.
export function splitTextIntoPages(text: string): PageText[] {
  const pages: PageText[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) pages.push({ page: pages.length + 1, text: current.trim() });
    current = "";
  };

  for (const paragraph of text.split(/\n{2,}/)) {
    if (current && current.length + paragraph.length > TEXT_PAGE_CHARS) flush();
    current += (current ? "\n\n" : "") + paragraph;
  }
  flush();
  return pages;
}

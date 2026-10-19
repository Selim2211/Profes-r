export type PageText = { page: number; text: string };

const MAX_HEADER_LINE_LENGTH = 120;
const MIN_PAGES_FOR_HEADER_DETECTION = 4;
const REPEAT_RATIO = 0.5;

// Digits are masked so "Sayfa 3" and "Sayfa 4" count as the same repeated line.
function lineKey(line: string): string {
  return line.trim().toLowerCase().replace(/\d+/g, "#");
}

function findRepeatedLines(pages: PageText[]): Set<string> {
  if (pages.length < MIN_PAGES_FOR_HEADER_DETECTION) return new Set();

  const counts = new Map<string, number>();
  for (const { text } of pages) {
    const seen = new Set<string>();
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length > MAX_HEADER_LINE_LENGTH) continue;
      seen.add(lineKey(trimmed));
    }
    for (const key of seen) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const threshold = pages.length * REPEAT_RATIO;
  const repeated = new Set<string>();
  for (const [key, count] of counts) {
    if (count > threshold) repeated.add(key);
  }
  return repeated;
}

export function cleanText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/(\p{L})-\n(\p{L})/gu, "$1$2")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Removes headers/footers that repeat on most pages, then normalizes whitespace.
export function cleanPages(pages: PageText[]): PageText[] {
  const repeated = findRepeatedLines(pages);

  return pages.map(({ page, text }) => {
    const kept = text
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        return !trimmed || !repeated.has(lineKey(trimmed));
      })
      .join("\n");
    return { page, text: cleanText(kept) };
  });
}

export type CitationRef = { raw: string; week: number | null; page: number };

// Matches tags like "[H3 · s.12]", "[H1 · s.2-4]" and "[Not · s.7]".
export const CITATION_PATTERN = /\[(H(\d+)|Not) · s\.(\d+)(?:-\d+)?\]/g;

const SINGLE_TAG = "(?:H\\d+|Not) · s\\.\\d+(?:-\\d+)?";
// A bracket holding several tags, e.g. "[H1 · s.1, H1 · s.2]".
const MERGED_TAGS = new RegExp(`\\[(${SINGLE_TAG}(?:\\s*[,;]\\s*${SINGLE_TAG})+)\\]`, "g");

// Models sometimes merge tags into one bracket; split them so each renders as its own badge.
export function normalizeCitationTags(text: string): string {
  return text.replace(MERGED_TAGS, (_all, group: string) =>
    group
      .split(/\s*[,;]\s*/)
      .map((tag) => `[${tag}]`)
      .join(" "),
  );
}

export function extractCitationRefs(text: string): CitationRef[] {
  return [...text.matchAll(CITATION_PATTERN)].map((m) => ({
    raw: m[0],
    week: m[2] ? Number(m[2]) : null,
    page: Number(m[3]),
  }));
}

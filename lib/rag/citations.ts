export type CitationRef = { raw: string; week: number | null; page: number };

// Matches tags like "[H3 · s.12]", "[H1 · s.2-4]" and "[Not · s.7]".
export const CITATION_PATTERN = /\[(H(\d+)|Not) · s\.(\d+)(?:-\d+)?\]/g;

export function extractCitationRefs(text: string): CitationRef[] {
  return [...text.matchAll(CITATION_PATTERN)].map((m) => ({
    raw: m[0],
    week: m[2] ? Number(m[2]) : null,
    page: Number(m[3]),
  }));
}

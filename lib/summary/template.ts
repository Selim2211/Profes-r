export type SummaryLevel = "short" | "standard" | "detailed";

export const SUMMARY_LEVELS: SummaryLevel[] = ["short", "standard", "detailed"];

export const LEVEL_LABELS: Record<SummaryLevel, string> = {
  short: "Kısa",
  standard: "Standart",
  detailed: "Detaylı",
};

// The fixed structure every summary follows (CLAUDE.md Faz 4, madde 6).
export const SUMMARY_HEADINGS = [
  "Genel bakış",
  "Temel kavramlar ve tanımlar",
  "Konu konu anlatım",
  "Formüller ve kurallar",
  "Örnekler",
  "Sık yapılan hatalar / dikkat edilecekler",
  "Kendini kontrol et",
] as const;

export const TEMPLATE_TEXT = SUMMARY_HEADINGS.map((h, i) => `## ${i + 1}. ${h}`).join("\n");

export const LEVEL_INSTRUCTIONS: Record<SummaryLevel, string> = {
  short: `Seviye: KISA (sınav öncesi hızlı tekrar). Yaklaşık 1 sayfa (350-550 kelime).
- Her başlık yer alsın ama sıkı yaz: tanımlar tek cümle, anlatım maddeler halinde.
- Notlardaki HER konu en az bir maddeyle geçmeli; konu atlama.
- Tüm formüller yer alsın, anlamı yarım cümleyle.
- "Kendini kontrol et" bölümünde 3 soru.`,
  standard: `Seviye: STANDART. Yaklaşık 900-1500 kelime.
- Her başlık dolu olsun; tanımlar eksiksiz, anlatım konu konu ve gerekçeleriyle.
- Notlardaki tüm tanım, formül, örnek ve uyarılar yer alsın.
- "Kendini kontrol et" bölümünde 4 soru.`,
  detailed: `Seviye: DETAYLI (anlatım tadında). Yaklaşık 2000-3500 kelime.
- Konuları öğretir gibi anlat: önce fikir, sonra ayrıntı, notlardaki örneklerle; akıcı paragraflar ve gerektiğinde listeler/tablolar.
- Notlardaki her bilgi, tanım, formül (anlamı ve ne zaman kullanıldığıyla), örnek ve uyarı yer alsın.
- "Kendini kontrol et" bölümünde 5 soru.`,
};

const EMPTY_SECTION_TEXT: Record<number, string> = {
  4: "Notlarda formül yok.",
  5: "Notlarda örnek yok.",
  6: "Notlarda bu konuda özel bir uyarı yok.",
};

// A template section must never be left empty (the model may skip one, and removing unsupported
// statements can empty one): it gets a short "not in the notes" line instead.
export function fillEmptySections(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    if (!/^##\s/.test(lines[i])) continue;

    const number = SUMMARY_HEADINGS.findIndex((h) => lines[i].toLocaleLowerCase("tr-TR").includes(h.toLocaleLowerCase("tr-TR"))) + 1;
    if (number === 0) continue;

    let next = i + 1;
    while (next < lines.length && !lines[next].trim()) next++;
    const empty = next >= lines.length || /^##\s/.test(lines[next]);
    if (empty) out.push("", EMPTY_SECTION_TEXT[number] ?? "Notlarda bu bölüm için içerik yok.");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

// Headings of the template that a generated summary does not contain (matched case-insensitively
// against heading lines, so the model may number or format them slightly differently).
export function missingHeadings(markdown: string): string[] {
  const headingLines = markdown
    .split("\n")
    .filter((line) => /^#{1,6}\s/.test(line))
    .map((line) => line.toLocaleLowerCase("tr-TR")); // Turkish casing: "BAKIŞ" -> "bakış"
  return SUMMARY_HEADINGS.filter((h) => !headingLines.some((line) => line.includes(h.toLocaleLowerCase("tr-TR"))));
}

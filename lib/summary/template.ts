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

// Headings of the template that a generated summary does not contain (matched case-insensitively
// against heading lines, so the model may number or format them slightly differently).
export function missingHeadings(markdown: string): string[] {
  const headingLines = markdown
    .split("\n")
    .filter((line) => /^#{1,6}\s/.test(line))
    .map((line) => line.toLocaleLowerCase("tr-TR")); // Turkish casing: "BAKIŞ" -> "bakış"
  return SUMMARY_HEADINGS.filter((h) => !headingLines.some((line) => line.includes(h.toLocaleLowerCase("tr-TR"))));
}

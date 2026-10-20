// Turns a question or a claim into a Postgres tsquery for full-text-only search: significant words
// joined with " | ", each cut to a stem-like prefix and matched as a prefix ("diferansiyeli" -> "difera:*"),
// so Turkish suffixes and different word forms still match. Only letters and digits survive, so the
// result can never contain tsquery syntax.
const STOP_WORDS = new Set(
  [
    "ve", "ile", "bir", "bu", "su", "şu", "o", "da", "de", "ki", "mi", "mı", "mu", "mü", "ne", "nedir", "nasıl",
    "neden", "niçin", "hangi", "kaç", "kim", "için", "icin", "gibi", "olan", "olarak", "olur", "ama", "veya", "ya",
    "en", "çok", "daha", "her", "tüm", "bütün", "arasında", "göre", "kadar", "sonra", "önce", "anlat", "açıkla",
    "söyle", "hafta", "haftada", "haftayı", "notlarda", "notlara", "notlarım", "lütfen", "bana", "bunu", "şunu",
  ].map((w) => w.toLocaleLowerCase("tr-TR")),
);

const MAX_TERMS = 12;
const MIN_WORD_LENGTH = 3;
const STEM_LENGTH = 6;

export function buildOrQuery(text: string): string {
  const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const word of words) {
    if ([...word].length < MIN_WORD_LENGTH) continue;
    const key = word.toLocaleLowerCase("tr-TR");
    if (STOP_WORDS.has(key)) continue;
    const stem = [...word].slice(0, STEM_LENGTH).join("");
    const stemKey = stem.toLocaleLowerCase("tr-TR");
    if (seen.has(stemKey)) continue;
    seen.add(stemKey);
    terms.push(`${stem}:*`);
    if (terms.length >= MAX_TERMS) break;
  }
  return terms.join(" | ");
}

import { describe, expect, it } from "vitest";
import { lexicalSupport } from "@/lib/summary/lexical";

const notes = {
  content: [
    "# Laplace dönüşümü",
    "Bir f(t) fonksiyonunun Laplace dönüşümü, e üzeri eksi st ile çarpılıp sıfırdan sonsuza integre edilerek bulunur.",
    "Dönüşüm doğrusaldır; yani toplamın dönüşümü, dönüşümlerin toplamına eşittir.",
    "L{1} = 1/s ifadesi s > 0 için geçerlidir ve tabloda yer alır.",
  ].join("\n"),
};
const other = { content: "Bernoulli denklemi v = y üzeri 1 eksi n dönüşümüyle doğrusal hale gelir." };

describe("lexicalSupport", () => {
  it("accepts a claim whose words all occur in one chunk and quotes the closest line", () => {
    const hit = lexicalSupport("Dönüşüm doğrusaldır; toplamın dönüşümü dönüşümlerin toplamına eşittir.", [other, notes]);
    expect(hit?.chunkIndex).toBe(1);
    expect(hit?.quote).toContain("doğrusaldır");
  });

  it("tolerates one missing word in a long claim but not in a short one", () => {
    // The line has 11 content words. The claim adds "değişim" (in the notes) and "hesaplanır" (not in the notes).
    const line = "Bir f(t) fonksiyonunun Laplace dönüşümü, e üzeri eksi st ile çarpılıp sıfırdan sonsuza integre edilerek bulunur";
    const chunk = { content: `${line} değişim. Başka bir satır.` };
    // 13 content words, 1 missing: within the 8% allowance (floor(13 * 0.08) = 1).
    expect(lexicalSupport(`${line} değişim hesaplanır.`, [chunk])).not.toBeNull();
    // 14 content words, 2 missing: over the allowance (floor(14 * 0.08) = 1).
    expect(lexicalSupport(`${line} değişim hesaplanır ayrıca.`, [chunk])).toBeNull();
    // A 6-word claim with a foreign word: every word must be found.
    expect(lexicalSupport("Laplace dönüşümü kesinlikle integre edilerek bulunur", [notes])).toBeNull();
  });

  it("never accepts a changed number", () => {
    expect(lexicalSupport("L{1} = 1/s ifadesi s > 0 için geçerlidir ve tabloda yer alır.", [notes])).not.toBeNull();
    expect(lexicalSupport("L{1} = 1/s ifadesi s > 5 için geçerlidir ve tabloda yer alır.", [notes])).toBeNull();
  });

  it("does not accept a claim with a negation the notes do not contain", () => {
    expect(lexicalSupport("Dönüşüm doğrusal değildir; toplamın dönüşümü dönüşümlerin toplamına eşittir.", [notes])).toBeNull();
  });

  it("leaves short claims and unrelated chunks to the model", () => {
    expect(lexicalSupport("Dönüşüm doğrusaldır.", [notes])).toBeNull();
    expect(lexicalSupport("Riccati denklemi özel çözüm biliniyorsa doğrusal denkleme indirgenir.", [notes, other])).toBeNull();
    expect(lexicalSupport("Dönüşüm doğrusaldır; toplamın dönüşümü dönüşümlerin toplamına eşittir.", [])).toBeNull();
  });

  it("does not accept words that are merely scattered over a long chunk", () => {
    // All words of the claim occur in the chunk, but spread over unrelated lines far apart.
    const scattered = {
      content: [
        "Operasyonel düzey günlük işlemleri yürütür.",
        "Başka bir konu burada anlatılır ve alakasız cümleler gelir.",
        "Bir de ayrı satır daha var; konu değişir ve örnekler verilir.",
        "Taktik düzey orta yönetimin karar almasını destekler.",
        "Stratejik düzey üst yönetim içindir ve uzun vadeli planlama yapar.",
      ].join("\n"),
    };
    expect(
      lexicalSupport("Operasyonel düzey orta yönetimin karar almasını destekler ve uzun vadeli planlama yapar.", [scattered]),
    ).toBeNull();
    // A real copy of one line of that chunk is still accepted.
    expect(lexicalSupport("Taktik düzey orta yönetimin karar almasını destekler.", [scattered, notes])?.chunkIndex).toBe(0);
    expect(lexicalSupport("Taktik düzey orta yönetimin karar almasını destekler ve yönetim içindir.", [scattered])).toBeNull();
  });

  it("does not glue together two neighbouring statements", () => {
    const claim = "Dönüşüm doğrusaldır; yani toplamın dönüşümü dönüşümlerin toplamına eşittir. L{1} = 1/s ifadesi s > 0 için geçerlidir.";
    expect(lexicalSupport(claim, [notes])).toBeNull();
  });

  it("picks the chunk with the fewest missing words", () => {
    const worse = { content: "Dönüşüm doğrusaldır; toplamın dönüşümü ile ilgili başka bir not." };
    const hit = lexicalSupport("Dönüşüm doğrusaldır; toplamın dönüşümü dönüşümlerin toplamına eşittir.", [worse, notes]);
    expect(hit?.chunkIndex).toBe(1);
  });
});

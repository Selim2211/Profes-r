import { describe, expect, it } from "vitest";
import { applyVerdicts, parseClaims, plainText, rewriteKeepsShape, stripTags, tagsIn, withTag, type Verdict } from "@/lib/summary/claims";

const SUMMARY = `## 1. Genel bakış

Bu özet bilişim sistemlerini anlatır [H1 · s.2]. İkinci cümle başka bir bilgiyi verir [H1 · s.3].

## 2. Temel kavramlar ve tanımlar
Notlarda geçen temel kavramlar şunlardır:

- **Donanım (Hardware):** Bilişim sisteminin fiziksel bileşenleridir [H1 · s.7].
- Kısa.

## 4. Formüller ve kurallar
Notlarda formül yok.

## 5. Örnekler

| Dönem | Gelişme |
| :--- | :--- |
| **1950 - 1960** | Ana bilgisayarlar kullanıldı [H1 · s.10] |

## 7. Kendini kontrol et

1. Bilişim sistemini oluşturan üç boyut nedir?
[[CEVAP: İnsanlar, süreç ve teknoloji.]]
`;

describe("parseClaims", () => {
  const claims = parseClaims(SUMMARY);
  const texts = claims.map((c) => c.text);

  it("splits paragraphs into sentences, keeping trailing tags with their sentence", () => {
    expect(texts).toContain("Bu özet bilişim sistemlerini anlatır [H1 · s.2].");
    expect(texts).toContain("İkinci cümle başka bir bilgiyi verir [H1 · s.3].");
  });

  it("treats list items and table rows as claims, and skips table headers", () => {
    expect(claims.filter((c) => c.kind === "item").map((c) => c.text)).toEqual([
      "**Donanım (Hardware):** Bilişim sisteminin fiziksel bileşenleridir [H1 · s.7].",
    ]);
    const rows = claims.filter((c) => c.kind === "row");
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toContain("Ana bilgisayarlar");
  });

  it("takes quiz answers as claims but skips questions, headings, placeholders and lead-in lines", () => {
    expect(claims.filter((c) => c.kind === "answer").map((c) => c.text)).toEqual(["İnsanlar, süreç ve teknoloji."]);
    expect(texts.join("\n")).not.toContain("üç boyut nedir");
    expect(texts.join("\n")).not.toContain("Notlarda formül yok");
    expect(texts.join("\n")).not.toContain("şunlardır:");
    expect(texts.join("\n")).not.toContain("Genel bakış");
  });

  it("gives claims accurate offsets inside their lines", () => {
    const lines = SUMMARY.split("\n");
    for (const c of claims) expect(lines[c.line].slice(c.start, c.end)).toBe(c.text);
  });

  it("gives list items and rows the lead-in line (else the heading) as context", () => {
    const list = parseClaims("## 3. Konu\n\nFaydalar şunlardır:\n\n1. Artan verimlilik (increased productivity),\n2. Rekabet avantajı (competitive advantage).\n");
    expect(list.map((c) => c.context)).toEqual(["Faydalar şunlardır:", "Faydalar şunlardır:"]);

    const table = parseClaims("## 5. Örnekler\n\n| A | B |\n| --- | --- |\n| birinci satır | ikinci hücre metni |\n");
    expect(table[0].context).toBe("5. Örnekler");
  });

  it("skips very short fragments", () => {
    expect(texts).not.toContain("Kısa.");
  });
});

describe("tag helpers", () => {
  it("strips and finds tags", () => {
    expect(stripTags("Bilgi [H1 · s.2] [H1 · s.3].")).toBe("Bilgi.");
    expect(tagsIn("a [H1 · s.2] b [Not · s.7]")).toEqual(["[H1 · s.2]", "[Not · s.7]"]);
    expect(plainText("**Kalın** | hücre [H1 · s.2]")).toBe("Kalın hücre");
  });

  it("puts the new tag before closing punctuation, replacing old tags", () => {
    expect(withTag("Bir bilgi [H1 · s.2].", "[H1 · s.5]", "sentence")).toBe("Bir bilgi [H1 · s.5].");
    expect(withTag("Madde metni", "[H1 · s.5]", "item")).toBe("Madde metni [H1 · s.5]");
  });

  it("drops a dangling comma before the tag", () => {
    expect(withTag("Makalesini kapsar, [H1 · s.13].", "[H1 · s.13]", "sentence")).toBe("Makalesini kapsar [H1 · s.13].");
    expect(withTag("Rekabet avantajı,", "[H1 · s.9]", "item")).toBe("Rekabet avantajı [H1 · s.9]");
  });

  it("puts the tag inside the last cell of a table row", () => {
    expect(withTag("| **1950** | Ana bilgisayarlar [H1 · s.10] |", "[H1 · s.9]", "row")).toBe(
      "| **1950** | Ana bilgisayarlar [H1 · s.9] |",
    );
  });
});

describe("rewriteKeepsShape", () => {
  it("requires the same number of pipes for table rows and a single line otherwise", () => {
    expect(rewriteKeepsShape("| a | b |", "| a | c |", "row")).toBe(true);
    expect(rewriteKeepsShape("| a | b |", "a, c", "row")).toBe(false);
    expect(rewriteKeepsShape("x", "iki\nsatır", "item")).toBe(false);
    expect(rewriteKeepsShape("x", "  ", "item")).toBe(false);
  });

  it("rejects a rewrite that leaves a dollar sign unpaired (broken LaTeX)", () => {
    expect(rewriteKeepsShape("$a$ ve $b$", "$a$ ve $b$ doğru", "sentence")).toBe(true);
    expect(rewriteKeepsShape("$a$ ve $b$", "$a$ ve b$", "sentence")).toBe(false);
    expect(rewriteKeepsShape("x", "tutar 5\\$ eder", "sentence")).toBe(true); // escaped dollar is text
  });
});

describe("applyVerdicts", () => {
  const claims = parseClaims(SUMMARY);
  const find = (needle: string) => claims.find((c) => c.text.includes(needle))!;

  it("writes verified tags", () => {
    const c = find("Bu özet");
    const out = applyVerdicts(SUMMARY, claims, [{ claimId: c.id, status: "supported", tag: "[H1 · s.9]" }]);
    expect(out).toContain("Bu özet bilişim sistemlerini anlatır [H1 · s.9].");
    expect(out).toContain("İkinci cümle başka bir bilgiyi verir [H1 · s.3]."); // untouched
  });

  it("replaces a partly supported claim with its corrected version", () => {
    const c = find("Donanım");
    const out = applyVerdicts(SUMMARY, claims, [
      { claimId: c.id, status: "rewritten", tag: "[H1 · s.7]", rewrite: "**Donanım (Hardware):** Fiziksel bileşenlerdir." },
    ]);
    expect(out).toContain("- **Donanım (Hardware):** Fiziksel bileşenlerdir [H1 · s.7].");
    expect(out).not.toContain("Bilişim sisteminin fiziksel bileşenleridir");
  });

  it("removes one sentence of a paragraph and keeps the other", () => {
    const c = find("İkinci cümle");
    const out = applyVerdicts(SUMMARY, claims, [{ claimId: c.id, status: "removed", reason: "x" }]);
    expect(out).toContain("Bu özet bilişim sistemlerini anlatır [H1 · s.2].");
    expect(out).not.toContain("İkinci cümle");
  });

  it("deletes list items and table rows that are removed", () => {
    const item = find("Donanım");
    const row = find("Ana bilgisayarlar");
    const out = applyVerdicts(SUMMARY, claims, [
      { claimId: item.id, status: "removed", reason: "x" },
      { claimId: row.id, status: "removed", reason: "x" },
    ]);
    expect(out).not.toContain("Donanım");
    expect(out).not.toContain("Ana bilgisayarlar");
    expect(out).toContain("| Dönem | Gelişme |"); // header kept
  });

  it("removes a quiz question together with its removed answer", () => {
    const answer = find("İnsanlar, süreç");
    const out = applyVerdicts(SUMMARY, claims, [{ claimId: answer.id, status: "removed", reason: "x" }]);
    expect(out).not.toContain("CEVAP");
    expect(out).not.toContain("üç boyut nedir");
    expect(out).toContain("## 7. Kendini kontrol et");
  });

  it("keeps every heading and leaves the text alone without verdicts", () => {
    expect(applyVerdicts(SUMMARY, claims, [])).toBe(SUMMARY.replace(/\n{3,}/g, "\n\n"));
    const all: Verdict[] = claims.map((c) => ({ claimId: c.id, status: "removed", reason: "x" }));
    const out = applyVerdicts(SUMMARY, claims, all);
    expect(out.match(/^## /gm)).toHaveLength(5);
  });
});

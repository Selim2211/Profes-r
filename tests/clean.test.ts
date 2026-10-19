import { describe, expect, it } from "vitest";
import { cleanPages, cleanText } from "@/lib/ingest/clean";

describe("cleanText", () => {
  it("joins hyphenated line breaks and collapses whitespace", () => {
    expect(cleanText("dönü-\nşüm   var\r\n\r\n\r\n\r\nson")).toBe("dönüşüm var\n\nson");
  });

  it("normalizes to NFC without breaking Turkish characters", () => {
    const decomposed = "i̇ş ğüşıöç".normalize("NFD");
    expect(cleanText(decomposed)).toBe(decomposed.normalize("NFC"));
    expect(cleanText("İĞÜŞÖÇ ığüşöç")).toBe("İĞÜŞÖÇ ığüşöç");
  });
});

describe("cleanPages", () => {
  it("removes headers and footers repeated across pages", () => {
    const pages = Array.from({ length: 6 }, (_, i) => ({
      page: i + 1,
      text: `MAT201 Ders Notları\nİçerik ${"abcdef"[i]}\nSayfa ${i + 1}`,
    }));
    const cleaned = cleanPages(pages);
    cleaned.forEach((p, i) => expect(p.text).toBe(`İçerik ${"abcdef"[i]}`));
  });

  it("keeps everything when there are too few pages to detect repetition", () => {
    const pages = [
      { page: 1, text: "Başlık\nA" },
      { page: 2, text: "Başlık\nB" },
    ];
    expect(cleanPages(pages)[0].text).toContain("Başlık");
  });
});

import { describe, expect, it } from "vitest";
import { detectTranscribeNeed, needsAutoTranscribe, validateTranscription } from "@/lib/ingest/transcribe";

const TABLE_PAGE = `Information Systems in Organizations
The table below shows a small list of information systems you can find in a
variety of businesses:
Organization Purpose Description
American Apparel Point-of-Sale (POS) System POS data is integrated with an inventory database.`;

const DIAGRAM_PAGE = `Information System Components
Several components work together to add value to
an organization:
1. Hardware
2. Software Technology Related
3. Data
4. People
5. Process
Roles`;

const PLAIN_PAGE = `Bilişim sistemleri, organizasyonlarda karar vermeyi destekleyen sistemlerdir.
Bu sistemler veriyi toplar, işler, saklar ve kullanıcılara bilgi olarak sunar.
Yöneticiler bu bilgiyi planlama ve kontrol için kullanır.`;

describe("detectTranscribeNeed", () => {
  it("flags pages that mention a table", () => {
    expect(detectTranscribeNeed(TABLE_PAGE)).toEqual({ needed: true, reasons: ["table"] });
  });

  it("flags diagram-like pages made of short labels", () => {
    expect(detectTranscribeNeed(DIAGRAM_PAGE).reasons).toContain("diagram");
  });

  it("flags formulas by symbols and equations", () => {
    expect(detectTranscribeNeed("Toplam: ∑ x_i / n ve σ ≈ 2").reasons).toContain("math");
    expect(detectTranscribeNeed("y = a*x + b\nz = c*y - d").reasons).toContain("math");
  });

  it("flags garbled extraction", () => {
    expect(detectTranscribeNeed("a ��� b").reasons).toContain("garbled");
  });

  it("does not flag ordinary prose", () => {
    expect(detectTranscribeNeed(PLAIN_PAGE)).toEqual({ needed: false, reasons: [] });
  });

  it("flags rows of numbers as a table", () => {
    const rows = "Yıl 2019 2020 2021\nGelir 10 20 30\nGider 5 8 9\nKâr 5 12 21";
    expect(detectTranscribeNeed(rows).reasons).toContain("table");
  });
});

describe("validateTranscription", () => {
  const original = "Organization Purpose Description American Apparel inventory database merchandise ordered";

  it("accepts a faithful transcription", () => {
    const result = "| Organization | Purpose |\n|---|---|\n| American Apparel | POS merchandise inventory database ordered Description |";
    expect(validateTranscription(original, result)).toBe(result);
  });

  it("rejects empty output", () => {
    expect(validateTranscription(original, "  ")).toBeNull();
    expect(validateTranscription(original, undefined)).toBeNull();
  });

  it("rejects chatty or marker-polluted output", () => {
    expect(validateTranscription(original, "Tabii, işte sayfa:\n...")).toBeNull();
    expect(validateTranscription(original, "<<<PAGE 3>>> içerik")).toBeNull();
  });

  it("rejects output that drops most of the original words", () => {
    expect(validateTranscription(original, "Tamamen alakasız başka bir metin burada yer alıyor")).toBeNull();
  });

  it("rejects output far longer than the page could contain", () => {
    const longOriginal = "kelime ".repeat(60);
    expect(validateTranscription(longOriginal, "kelime ".repeat(500))).toBeNull();
  });
});

describe("needsAutoTranscribe", () => {
  const slide = "Value based management\nKey drivers\nCash flow\nGrowth\nMargins\nRisk\nCost of capital";
  const withEnv = (value: string | undefined, run: () => void) => {
    const previous = process.env.AI_AUTO_TRANSCRIBE;
    try {
      if (value === undefined) delete process.env.AI_AUTO_TRANSCRIBE;
      else process.env.AI_AUTO_TRANSCRIBE = value;
      run();
    } finally {
      if (previous === undefined) delete process.env.AI_AUTO_TRANSCRIBE;
      else process.env.AI_AUTO_TRANSCRIBE = previous;
    }
  };

  it("does not send a slide page to the vision model by default", () => {
    expect(detectTranscribeNeed(slide).needed).toBe(true); // the check itself still flags it
    withEnv(undefined, () => expect(needsAutoTranscribe(detectTranscribeNeed(slide))).toBe(false));
  });

  it("sends it when AI_AUTO_TRANSCRIBE=on", () => {
    withEnv("on", () => expect(needsAutoTranscribe(detectTranscribeNeed(slide))).toBe(true));
  });

  it("always sends a page whose text layer is garbled", () => {
    const garbled = "a b c d e f g h i j k l m n o p q r s t u v w x y z ".repeat(2);
    withEnv(undefined, () => expect(needsAutoTranscribe(detectTranscribeNeed(garbled))).toBe(true));
  });
});
import type { TextStreamPart, ToolSet } from "ai";

// Turns a provider/model error into a message the user can act on. The raw text is appended (shortened)
// so the cause is still visible when it is none of the known cases.
export function describeModelError(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : error == null ? "" : JSON.stringify(error);
  const text = raw.toLowerCase();

  if (/credit|prepayment|billing|quota|insufficient|payment required|\b402\b/.test(text)) {
    return "Yapay zekâ sağlayıcısının kredisi veya kotası bitmiş görünüyor. Sağlayıcı hesabından kredi ekle ya da başka bir sağlayıcıya geç.";
  }
  if (/zdr|data policy|guardrail/.test(text)) {
    return "Sağlayıcı hesabının gizlilik ayarı seçilen modeli engelliyor. OpenRouter'da Settings → Privacy bölümünden ayarı gevşet ya da ücretli bir model seç.";
  }
  if (/rate.?limit|too many requests|\b429\b|resource.?exhausted/.test(text)) {
    return "Yapay zekâ sağlayıcısı istek sınırına ulaştı. Biraz bekleyip tekrar dene.";
  }
  if (/api key|unauthorized|\b401\b|\b403\b|permission/.test(text)) {
    return "Yapay zekâ sağlayıcısı anahtarı kabul etmedi. .env.local içindeki anahtarı kontrol et.";
  }
  const short = raw.replace(/\s+/g, " ").slice(0, 140);
  return `Model cevap veremedi${short ? `: ${short}` : "."}`;
}

// Streams only the answer text. SDK errors never reach a plain text stream (the answer would just be
// empty), so they are caught here and shown as a readable message; `onFailure` lets the caller store it.
export function textStreamResponse<TOOLS extends ToolSet>(
  result: { fullStream: AsyncIterable<TextStreamPart<TOOLS>> },
  options: { headers?: HeadersInit; onFailure?: (message: string) => void | Promise<void> } = {},
): Response {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let failure: string | null = null;
      let wrote = false;
      try {
        for await (const part of result.fullStream) {
          if (part.type === "text-delta" && part.text) {
            wrote = true;
            controller.enqueue(encoder.encode(part.text));
          } else if (part.type === "error") {
            failure = describeModelError(part.error);
          }
        }
      } catch (error) {
        failure = describeModelError(error);
      }

      if (failure) {
        controller.enqueue(encoder.encode(`${wrote ? "\n\n" : ""}⚠️ ${failure}`));
        await options.onFailure?.(failure);
      }
      controller.close();
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", ...(options.headers ?? {}) },
  });
}

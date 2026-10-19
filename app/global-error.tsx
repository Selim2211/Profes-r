"use client";

// Last-resort boundary: replaces the whole page when the root layout itself fails.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="tr">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: "28rem", margin: "0 auto" }}>
        <h1>Beklenmeyen bir hata oluştu</h1>
        <p>Uygulama yüklenemedi. Tekrar deneyebilirsin.</p>
        <button onClick={reset} style={{ minHeight: 44, padding: "0 16px" }}>
          Tekrar dene
        </button>
      </body>
    </html>
  );
}

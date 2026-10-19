"use client";

import { Button } from "@/components/ui/button";

// Error boundary for every page of the app: a readable Turkish message and a retry button.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-4 rounded-lg border p-6" role="alert">
      <h1 className="text-xl font-semibold">Bir şeyler ters gitti</h1>
      <p className="text-sm text-muted-foreground">
        Bu sayfa yüklenirken bir hata oluştu. Tekrar deneyebilirsin; sorun sürerse sayfayı yenile.
      </p>
      {process.env.NODE_ENV !== "production" && error.message && (
        <p className="rounded-md bg-muted p-2 font-mono text-xs">{error.message}</p>
      )}
      <Button className="min-h-11" onClick={reset}>
        Tekrar dene
      </Button>
    </div>
  );
}

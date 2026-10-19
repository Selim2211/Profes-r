import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Sayfa bulunamadı</h1>
      <p className="text-sm text-muted-foreground">Aradığın sayfa yok ya da silinmiş olabilir.</p>
      <Link href="/" className="flex min-h-11 items-center rounded-lg border px-4 text-sm hover:bg-muted">
        Ana sayfaya dön
      </Link>
    </main>
  );
}

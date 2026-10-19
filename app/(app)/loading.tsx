// Shown instantly while a page of the app streams in: blocks in the rough shape of a page.
export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-label="Yükleniyor">
      <div className="h-9 w-48 animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-32 animate-pulse rounded-2xl bg-muted" />
        <div className="h-32 animate-pulse rounded-2xl bg-muted" />
        <div className="hidden h-32 animate-pulse rounded-2xl bg-muted lg:block" />
      </div>
    </div>
  );
}

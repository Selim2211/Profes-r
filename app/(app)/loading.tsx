// Shown while a page of the app streams in: grey blocks in the rough shape of a page.
export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="Yükleniyor">
      <div className="h-8 w-1/2 animate-pulse rounded-md bg-muted" />
      <div className="h-24 animate-pulse rounded-lg bg-muted" />
      <div className="h-24 animate-pulse rounded-lg bg-muted" />
      <div className="h-16 w-2/3 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}

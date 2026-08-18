export default function SegmentLoading() {
  return (
    <main role="status" className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-k-ink/15 border-t-k-ink" /><p className="mt-4 text-sm text-k-muted">Chargement…</p></div>
    </main>
  );
}

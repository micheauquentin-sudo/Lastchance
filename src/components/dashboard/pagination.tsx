import Link from "next/link";

export function Pagination({
  page,
  hasNext,
  params = {},
}: {
  page: number;
  hasNext: boolean;
  params?: Record<string, string | undefined>;
}) {
  if (page === 1 && !hasNext) return null;
  function href(nextPage: number) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
    if (nextPage > 1) search.set("page", String(nextPage));
    const query = search.toString();
    return query ? `?${query}` : "?";
  }
  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-4">
      {page > 1 ? <Link href={href(page - 1)} className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold hover:border-orange-300">← Précédent</Link> : <span />}
      <span className="text-sm text-zinc-500">Page {page}</span>
      {hasNext ? <Link href={href(page + 1)} className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold hover:border-orange-300">Suivant →</Link> : <span />}
    </nav>
  );
}

export default function PlayLoading() {
  return (
    <main role="status" className="fixed inset-0 flex items-center justify-center bg-zinc-950 text-white">
      <div className="text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" /><p className="mt-4 text-sm text-zinc-300">Préparation du jeu…</p></div>
    </main>
  );
}

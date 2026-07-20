import Link from "next/link";

/**
 * Pied de page des expériences joueur (/play) : boucle de croissance —
 * un client séduit par le jeu découvre qu'il peut créer le sien.
 * `utm_source` distingue les arrivées venues d'un jeu en cours.
 */
export function DiscoverFooter({ kermesse = false }: { kermesse?: boolean }) {
  return (
    <footer
      className={
        kermesse
          ? "mt-8 text-center text-xs text-k-body/70"
          : "mt-8 text-center text-xs text-zinc-500"
      }
    >
      Jeu propulsé par{" "}
      <Link
        href="/?utm_source=jeu&utm_medium=footer"
        className={
          kermesse
            ? "font-bold text-k-ink underline underline-offset-2 hover:text-k-orange"
            : "font-bold text-zinc-300 underline underline-offset-2 hover:text-white"
        }
      >
        Lastchance
      </Link>
      <br />
      Commerçant ? Créez le vôtre en 10 minutes.
    </footer>
  );
}

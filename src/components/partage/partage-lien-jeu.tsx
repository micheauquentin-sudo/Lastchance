"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * ORIGINE de la page, lue sans écart d'hydratation — même patron que
 * `useCanShare` dans quiz-experience.tsx. Le rendu serveur ne connaît pas
 * l'hôte réellement utilisé (domaine personnalisé, aperçu Vercel) : il rend
 * une chaîne vide, et le client complète après montage.
 */
const abonnementVide = () => () => {};
const useOrigine = () =>
  useSyncExternalStore(
    abonnementVide,
    () => (typeof window === "undefined" ? "" : window.location.origin),
    () => "",
  );

/**
 * PARTAGER LE LIEN D'UN JEU, côté JOUEUR — quiz comme événement live.
 *
 * ── Pourquoi ce composant existe ──
 *
 * Le QR code du comptoir suppose qu'on soit AU comptoir. Or le cas d'usage le
 * plus fréquent est l'inverse : on est chez soi un soir, on veut jouer à
 * plusieurs. Le lien EST le jeu — il n'y a rien d'autre à transmettre.
 *
 * ── Trois choses qu'il fait, et que le bouton précédent ne faisait pas ──
 *
 * 1. **Il montre l'adresse.** `navigator.share` n'existe pas sur un ordinateur
 *    de bureau, et le presse-papiers échoue en silence sous certaines
 *    permissions. Une adresse affichée et sélectionnable reste utilisable dans
 *    tous les cas — c'est le seul chemin qui ne dépend d'aucune API.
 * 2. **Il se situe.** Deux variantes, pour deux moments :
 *    · `carte` — avant de commencer et une fois la partie finie. Le partage EST
 *      le sujet de l'écran : bloc plein, adresse affichée d'emblée ;
 *    · `discret` — pendant la partie. Il reste accessible, mais en PIED DE
 *      PAGE : séparé par un filet, détaché de la carte de question, et sans
 *      champ d'adresse déployé. Le premier essai le collait sous la question,
 *      où il ressemblait à un bouton de cette question et concurrençait
 *      « Valider ma réponse ».
 * 3. **Il ne ment pas sur son état.** « Lien copié ! » n'apparaît qu'après une
 *    écriture réussie dans le presse-papiers.
 *
 * L'ORIGINE est lue après montage (`useOrigine`) : le rendu serveur ne connaît
 * pas l'hôte réellement utilisé. D'ici là on affiche le chemin seul — vrai,
 * juste incomplet — plutôt qu'une adresse devinée.
 */
export function PartageLienJeu({
  /** Chemin ABSOLU du jeu, origine exclue : `/quiz/mon-quiz`, `/event/AB12CD`. */
  chemin,
  /** Titre de la feuille de partage native (nom du jeu). */
  titre,
  /** Texte d'invitation, affiché au-dessus de l'adresse. */
  intro,
  /** Libellé du bouton principal. */
  libelle = "Partager le lien",
  /**
   * `carte` : le partage est le sujet de l'écran (avant / après la partie).
   * `discret` : pied de page pendant la partie — présent, jamais concurrent.
   */
  variante = "carte",
  className,
}: {
  chemin: string;
  titre: string;
  intro: string;
  libelle?: string;
  variante?: "carte" | "discret";
  className?: string;
}) {
  const origine = useOrigine();
  const [copie, setCopie] = useState(false);
  const [echec, setEchec] = useState(false);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (minuterie.current) clearTimeout(minuterie.current);
    },
    [],
  );

  const url = origine ? `${origine}${chemin}` : chemin;
  const affichage = origine ? url.replace(/^https?:\/\//, "") : chemin;

  const partager = async () => {
    setEchec(false);
    // Partage natif d'abord (téléphone) : il ouvre SMS, WhatsApp, mail…
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: titre, url });
        return;
      } catch {
        // Partage refusé ou annulé : on retombe sur le presse-papiers, qui
        // reste utile — l'utilisateur a bien cliqué sur « partager ».
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopie(true);
      if (minuterie.current) clearTimeout(minuterie.current);
      minuterie.current = setTimeout(() => setCopie(false), 2500);
    } catch {
      // Ni partage natif ni presse-papiers : l'adresse affichée en dessous
      // reste sélectionnable à la main, et on le dit.
      setEchec(true);
    }
  };

  /** Champ d'adresse : toujours visible en carte, seulement en secours ailleurs. */
  const champAdresse = (
    <span className="min-w-0 flex-1">
      {/* Champ en lecture seule et non un simple texte : un appui long le
          sélectionne entièrement sur mobile, et « tout sélectionner »
          fonctionne au clavier. */}
      <input
        type="text"
        readOnly
        value={affichage}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Adresse du jeu, à copier"
        className="w-full min-w-0 rounded-xl border-2 border-k-ink/20 bg-k-stripe px-3 py-2 font-mono text-xs text-k-ink"
      />
    </span>
  );

  // ── PIED DE PAGE pendant la partie ──
  //
  // Un filet et une marge franche : c'est ce qui le détache de la carte de
  // question, au-dessus. Aucune ombre portée, aucun fond plein, un bouton
  // secondaire — il doit rester lisible sans jamais attirer l'œil avant
  // « Valider ma réponse ». L'adresse n'apparaît qu'en secours (presse-papiers
  // refusé), pour ne jamais laisser d'impasse sans alourdir le pied de page.
  if (variante === "discret") {
    return (
      <section
        className={`mt-8 border-t-2 border-k-ink/10 pt-5 text-center ${className ?? ""}`}
        aria-label="Partager ce jeu"
      >
        <p className="text-xs font-bold text-k-body/80">{intro}</p>
        <button
          type="button"
          onClick={() => void partager()}
          className="mt-2 rounded-xl border-2 border-k-ink/40 bg-white/70 px-4 py-2 text-sm font-bold text-k-ink hover:border-k-ink hover:bg-white"
        >
          <span aria-hidden>📣 </span>
          {copie ? "Lien copié !" : libelle}
        </button>
        {echec && (
          <div className="mx-auto mt-3 flex max-w-sm">{champAdresse}</div>
        )}
        <p role="status" aria-live="polite" className="mt-2 text-xs text-k-body/70">
          {echec
            ? "Copie impossible depuis ce navigateur : sélectionnez l'adresse ci-dessus."
            : copie
              ? "Adresse copiée : collez-la dans un message."
              : ""}
        </p>
      </section>
    );
  }

  return (
    <section
      className={`k-border rounded-2xl bg-white p-4 shadow-[4px_4px_0_var(--color-k-ink)] ${className ?? ""}`}
      aria-label="Partager ce jeu"
    >
      <p className="text-sm font-black text-k-ink">
        <span aria-hidden>📣 </span>
        {intro}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void partager()}
          className="k-btn-sm rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-black text-k-ink"
        >
          {copie ? "Lien copié !" : libelle}
        </button>
        {champAdresse}
      </div>

      <p role="status" aria-live="polite" className="mt-2 text-xs text-k-body">
        {echec
          ? "Copie impossible depuis ce navigateur : sélectionnez l'adresse ci-dessus pour la copier à la main."
          : copie
            ? "Adresse copiée : collez-la dans un message."
            : "Pas besoin de QR code : ce lien suffit pour jouer, depuis n'importe quel téléphone."}
      </p>
    </section>
  );
}

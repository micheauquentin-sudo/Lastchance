"use client";

import { useId, useState } from "react";
import { enregistrerIdentitePasseport } from "@/actions/loyalty";
import { Avatar, coerceAvatarId, type AvatarId } from "@/lib/avatars";
import { AvatarPicker } from "@/components/ui/avatar-picker";

/**
 * LE CLIENT NOMME SA CARTE (FID-8b) — surnom et figure, sur le passeport.
 *
 * ── CE N'EST PAS UN FORMULAIRE D'INSCRIPTION ──
 *
 * Une carte sans surnom n'est pas une carte incomplète : c'est l'état de départ
 * de toutes, et de la plupart pour toujours. Le bloc est donc REPLIÉ par
 * défaut, ne porte aucune relance, aucun « profil à compléter », aucune
 * pastille d'alerte — et quand rien n'a été choisi il n'affiche NI figure par
 * défaut, ni « Sans nom » : seulement une invitation discrète, qu'on peut
 * ignorer pour toujours sans que l'écran change de ton.
 *
 * ── LE SURNOM DOIT SE VOIR ──
 *
 * Replié, le bloc n'est PAS un bouton muet : il montre la figure et le nom
 * choisis, en tête de la carte, juste au-dessus du solde. Un champ qu'on
 * remplit sans rien voir changer ne sert à rien.
 *
 * ── LA FIGURE PAR DÉFAUT EST UN PIÈGE, ET ON L'ÉVITE ICI ──
 *
 * `coerceAvatarId("")` rend le renard. C'est le bon comportement pour AFFICHER
 * une figure choisie dont la clé aurait disparu du catalogue ; c'en serait un
 * mauvais pour l'état vide, où il montrerait à chaque client un animal qu'il
 * n'a jamais choisi. L'affichage ne l'appelle donc que sur une valeur NON VIDE.
 * L'éditeur ouvert, lui, part bien du renard : il faut une sélection de départ
 * dans une grille.
 */
export function IdentitePasseport({
  programId,
  displayName,
  avatar,
}: {
  programId: string;
  /** Surnom déjà gravé (`null` : rien de choisi). */
  displayName: string | null;
  /** Figure déjà gravée (`''` : rien de choisi). */
  avatar: string;
}) {
  // ÉTAT SERVEUR RELU, jamais la saisie : après enregistrement l'affichage
  // prend la forme que la BASE a gravée (espaces repliés, blanc devenu `null`).
  const [grave, setGrave] = useState<{ nom: string | null; figure: string }>({
    nom: displayName,
    figure: avatar,
  });
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState(displayName ?? "");
  const [figure, setFigure] = useState<AvatarId>(() => coerceAvatarId(avatar));
  const [pending, setPending] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const champId = useId();

  const vide = grave.nom === null && grave.figure === "";

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setErreur(null);

    let resultat;
    try {
      resultat = await enregistrerIdentitePasseport({
        programId,
        displayName: saisie,
        avatar: figure,
      });
    } catch {
      // Server Action injoignable (réseau du commerce, onglet réveillé hors
      // ligne). Sans ce filet l'exception remonterait à la frontière d'erreur
      // et effacerait tout le passeport au lieu d'afficher un message.
      setPending(false);
      setErreur("Connexion perdue. Vérifiez votre réseau puis réessayez.");
      return;
    }

    setPending(false);
    if (!resultat.ok) {
      setErreur(resultat.error);
      return;
    }
    setGrave({ nom: resultat.data.displayName, figure: resultat.data.avatar });
    setSaisie(resultat.data.displayName ?? "");
    setOuvert(false);
  };

  return (
    <section
      aria-label="Ma carte"
      className="mb-4 rounded-2xl border-2 border-k-ink bg-white px-4 py-3 shadow-[4px_4px_0_var(--color-k-ink)]"
    >
      <div className="flex items-center gap-3">
        {!vide && (
          <span className="shrink-0">
            {grave.figure ? (
              <Avatar id={grave.figure} className="h-10 w-10" />
            ) : (
              /* Un surnom sans figure : le médaillon garde sa place plutôt que
                 de laisser le nom flotter contre le bord de la carte. */
              <span
                aria-hidden
                className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-k-ink bg-k-bg text-sm font-black text-k-ink"
              >
                {grave.nom?.slice(0, 1).toUpperCase()}
              </span>
            )}
          </span>
        )}

        <div className="min-w-0 flex-1">
          {/* Trois états, et le troisième est le piège : une FIGURE choisie
              sans surnom. Y afficher un titre de repli (« Ma carte ») ferait
              passer un choix délibéré pour une valeur manquante — on ne montre
              alors que la figure, qui se suffit. */}
          {vide ? (
            <p className="text-sm font-bold text-k-body">Cette carte est à vous.</p>
          ) : grave.nom ? (
            <>
              <p className="text-xs font-bold uppercase tracking-wide text-k-body">
                Ma carte
              </p>
              <p className="truncate text-base font-black leading-tight text-k-ink">
                {grave.nom}
              </p>
            </>
          ) : (
            <p className="text-sm font-bold text-k-body">Ma carte</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOuvert((v) => !v)}
          aria-expanded={ouvert}
          className="shrink-0 rounded-full border-2 border-k-ink bg-white px-3 py-1.5 text-xs font-black text-k-ink hover:bg-k-yellow"
        >
          {vide ? "Personnaliser" : "Modifier"}
        </button>
      </div>

      {ouvert && (
        <form
          onSubmit={enregistrer}
          className="mt-4 border-t-2 border-k-ink/10 pt-4"
        >
          <label
            htmlFor={champId}
            className="mb-1.5 block text-sm font-bold text-k-ink"
          >
            Mon surnom
          </label>
          <input
            id={champId}
            name="surnom"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value.slice(0, 24))}
            maxLength={24}
            autoComplete="off"
            autoCapitalize="words"
            placeholder="Ex : Marie"
            className="w-full rounded-xl border-2 border-k-ink bg-white px-4 py-3 text-base font-bold text-k-ink placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
          />
          {/* Le champ vide EFFACE — c'est une sortie, pas une impasse : sans
              cette phrase, un client qui veut retirer son surnom cherche un
              bouton « supprimer » qui n'a pas lieu d'exister. */}
          <p className="mt-1.5 text-xs font-medium text-k-body">
            Laissez vide pour retirer votre surnom. Il n&apos;apparaît que sur
            votre carte et sur l&apos;écran de la caisse.
          </p>

          <div className="mt-4">
            <AvatarPicker
              value={figure}
              onChange={setFigure}
              label="Ma figure"
              idPrefix="passeport"
            />
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="k-btn flex-1 rounded-2xl border-2 border-k-ink bg-k-yellow px-5 py-3 text-sm font-black uppercase tracking-wider text-k-ink disabled:pointer-events-none disabled:opacity-60"
            >
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOuvert(false);
                setErreur(null);
                setSaisie(grave.nom ?? "");
                setFigure(coerceAvatarId(grave.figure));
              }}
              className="rounded-2xl border-2 border-k-ink bg-white px-5 py-3 text-sm font-black text-k-ink"
            >
              Annuler
            </button>
          </div>

          {erreur && (
            <p
              role="alert"
              className="mt-3 text-center text-sm font-semibold text-red-600"
            >
              {erreur}
            </p>
          )}
        </form>
      )}
    </section>
  );
}

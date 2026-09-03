"use client";

import { updateOrganizationSocialLinks } from "@/actions/organizations";
import { FieldError, Input, Label } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";
import type { VitrineLiensView } from "@/lib/vitrine";

/**
 * LE MODE PILOTÉ, ET POURQUOI IL EXISTE (VIT-37).
 *
 * Dans le studio, ce formulaire vivait à côté d'un aperçu qui ne le lisait pas
 * et d'un enregistrement automatique qui ne le couvrait pas : on tapait son
 * Instagram, l'en-tête affichait « Modifications enregistrées » — celles des
 * AUTRES réglages — et le lien restait dans un formulaire jamais soumis.
 *
 * Piloté, le composant ne décide plus ni de sa valeur ni de son enregistrement
 * (le studio s'en charge) ; il garde ses trois champs, ses libellés et son
 * avertissement, qui suivent les liens où qu'ils aillent. Absent, tout se
 * comporte exactement comme avant — c'est le cas de `/dashboard/settings`.
 */
export interface ControleLiens {
  valeurs: VitrineLiensView;
  onChange: (valeurs: VitrineLiensView) => void;
  /** Le dernier refus du serveur ou du schéma, à afficher sous les champs. */
  erreur: string | null;
}

/**
 * Les trois liens publics de l'établissement — avis Google, Instagram, TikTok.
 *
 * ── LES TROIS CHAMPS SONT TOUJOURS RENDUS, ET C'EST UNE CONTRAINTE ──
 *
 * `updateOrganizationSocialLinks` a une sémantique de texte OPTIONNEL : un
 * champ absent du FormData vaut `''`, donc EFFACE le lien en base. Masquer un
 * champ (derrière un dépliant, un onglet, une condition de plan) supprimerait
 * silencieusement le lien correspondant au premier enregistrement. Le
 * formulaire poste donc toujours les trois, quoi qu'il arrive.
 *
 * Réservé au propriétaire : la garde n'est pas ici mais en tête de
 * `/dashboard/settings` (`if (role !== "owner") redirect(…)`), doublée par
 * `requireOrganizationOwner()` dans l'action.
 */
export function SocialLinksForm({
  googleReviewUrl,
  instagramUrl,
  tiktokUrl,
  controle,
}: {
  googleReviewUrl: string;
  instagramUrl: string;
  tiktokUrl: string;
  controle?: ControleLiens;
}) {
  const { state, pending, onSubmit } = useActionForm(
    updateOrganizationSocialLinks,
    { networkError: "Enregistrement impossible, réessayez." },
  );

  /**
   * PILOTÉ, LE `<form>` RESTE MAIS NE SOUMET PLUS. Le remplacer par un `<div>`
   * aurait changé le DOM du studio pour rien ; ce qui compte est qu'il n'ait
   * plus de bouton et qu'une touche Entrée dans un champ ne déclenche pas une
   * écriture concurrente de l'enregistrement automatique.
   */
  const soumettre = controle
    ? (event: React.FormEvent<HTMLFormElement>) => event.preventDefault()
    : onSubmit;

  const champ = (cle: keyof VitrineLiensView) =>
    controle
      ? {
          value: controle.valeurs[cle] ?? "",
          onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
            controle.onChange({ ...controle.valeurs, [cle]: e.target.value }),
        }
      : {
          defaultValue: {
            google_review_url: googleReviewUrl,
            instagram_url: instagramUrl,
            tiktok_url: tiktokUrl,
          }[cle],
        };

  return (
    <form onSubmit={soumettre} className="space-y-4">
      <div>
        <Label htmlFor="google_review_url">Avis Google</Label>
        <Input
          id="google_review_url"
          name="google_review_url"
          type="url"
          inputMode="url"
          {...champ("google_review_url")}
          placeholder="https://g.page/r/CxAbCdEf/review"
        />
      </div>
      <div>
        <Label htmlFor="instagram_url">Instagram</Label>
        <Input
          id="instagram_url"
          name="instagram_url"
          type="url"
          inputMode="url"
          {...champ("instagram_url")}
          placeholder="https://www.instagram.com/votre-compte"
        />
      </div>
      <div>
        <Label htmlFor="tiktok_url">TikTok</Label>
        <Input
          id="tiktok_url"
          name="tiktok_url"
          type="url"
          inputMode="url"
          {...champ("tiktok_url")}
          placeholder="https://www.tiktok.com/@votre-compte"
        />
      </div>
      <p className="text-xs text-zinc-500">
        Laissez un champ vide pour ne rien proposer sur ce réseau.
      </p>

      {/* L'AVERTISSEMENT N'EST PAS ENFOUI, ET IL EST AU-DESSUS DU BOUTON : le
          commerçant le lit AVANT d'enregistrer, pas après. Bordure ambre pour
          qu'il ne se lise pas comme une aide de champ. */}
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
        <p className="mb-1 font-semibold">
          Proposition facultative : le client peut toujours continuer sans rien
          faire, et son gain n&apos;est jamais conditionné.
        </p>
        <p>
          Sachez-le : Google interdit de solliciter des avis contre récompense
          et peut supprimer les avis ou sanctionner la fiche ; Instagram et
          TikTok interdisent l&apos;incitation à l&apos;abonnement contre
          avantage. En affichant ces invitations pendant un jeu, vous restez
          seul responsable de l&apos;usage de ces liens.
        </p>
      </div>

      {controle ? (
        // Le refus vient soit du schéma (adresse encore incomplète pendant la
        // frappe), soit du serveur. Il est MONTRÉ : sans bouton, un lien
        // silencieusement rejeté se lirait comme un lien enregistré.
        <FieldError message={controle.erreur ?? undefined} />
      ) : (
        <>
          <FieldError message={state && !state.ok ? state.error : undefined} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "…" : "Enregistrer"}
          </button>
          {state?.ok && (
            <p className="text-sm font-medium text-emerald-600">
              Liens enregistrés.
            </p>
          )}
        </>
      )}
    </form>
  );
}

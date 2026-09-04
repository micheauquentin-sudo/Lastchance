"use client";

import { CadreApercu } from "@/components/studio/cadre-apercu";
import { PlayerPageShell } from "@/components/ui/player-page-shell";
import { PlayerHub } from "@/components/pronos/player-hub";
import { ContestLeaderboardCard } from "@/components/pronos/leaderboard";
import { PredictionProgress } from "@/components/pronos/prediction-progress";
import { contestThemeTokens } from "@/components/pronos/contest-theme";
import { DEFAULT_AVATAR } from "@/lib/avatars";
import { fondChoisi, fondPourTheme } from "@/lib/fonds-ecran";
import type { EtatContest } from "@/components/pronos/studio/etat";

/**
 * L'APERÇU DU CHAMPIONNAT — le vrai espace joueur, avec des slots FIGÉS
 * (VIT-43).
 *
 * ── CE QUI EST RÉEL ──
 *
 * Le fond de page (`PlayerPageShell` + `fondChoisi`), les jetons du thème et
 * `PlayerHub` — l'espace joueur EXACT que sert `/pronos/[slug]`, avec ses
 * onglets, son en-tête de profil et sa jauge de progression. `PlayerHub` s'y
 * prête sans une ligne d'adaptation : il est purement À SLOTS, il n'importe
 * aucune action serveur, et ses deux propositions de bas de page
 * (`ProposerPasseport`, `ProposerJackpot`) restent MUETTES tant
 * qu'`organizationId` vaut `null`. Ce qui se voit ici est ce qui sera servi.
 *
 * La largeur du cadre est `max-w-lg` (512 px), la borne EXACTE du conteneur de
 * la page publique. Elle reste littérale : Tailwind ne compile pas une classe
 * construite à l'exécution. Un cadre plus large rendrait une mise en page que
 * personne ne verra — et ce défaut-là est INVISIBLE, c'est tout le problème.
 *
 * ── CE QUI EST FIGÉ, ET POURQUOI ON NE L'A PAS MONTÉ ──
 *
 * 1. LA GRILLE DE PRONOSTICS. `GrillePronostics` et `ContestExperience`
 *    importent les actions de soumission : les monter ferait entrer tout le
 *    parcours joueur — inscription, dépôt de pronostic, récupération de compte
 *    — dans un écran de réglages. Le slot rend donc une carte qui DIT que la
 *    grille n'est pas jouable ici, plutôt qu'une fausse grille cliquable.
 * 2. LE CLASSEMENT est rendu par sa VRAIE carte (`ContestLeaderboardCard`, qui
 *    est pure), mais VIDE : inventer des joueurs ferait valider au commerçant
 *    un écran qu'il ne verra jamais. Sa phrase d'attente est celle que liront
 *    ses premiers visiteurs.
 * 3. LE PROFIL. Il porte un `AvatarPicker`, qui existe en TROIS exemplaires
 *    divergents dans ce dépôt (`contest-experience.tsx`, `quiz-experience.tsx`,
 *    `components/ui/avatar-picker.tsx`). En choisir un ici reviendrait à
 *    trancher une unification qui n'est pas ce lot — signalée, pas faite.
 *
 * Ces trois manques sont ANNONCÉS dans la bannière. C'est toute la différence
 * entre un aperçu partiel et un faux aperçu : le premier dit ce qu'il ne montre
 * pas (ADR-152).
 *
 * ── L'EN-TÊTE EST UNE COPIE, ET ELLE EST GARDÉE ──
 *
 * Il est recopié de `src/app/(player)/pronos/[slug]/(hub)/page.tsx`, où il vit
 * en JSX nu dans la page (aucun composant à importer). Sans lui, les étapes
 * « Le nom du championnat » et « L'allure » — la première et la troisième —
 * n'auraient AUCUN effet visible dans l'aperçu : le nom ne s'affiche nulle part
 * ailleurs, et le thème ne se lirait que sur un fond.
 *
 * Une copie qui diverge est le défaut de cette famille (ADR-152), et un
 * commentaire ne l'empêche pas. `studio-charge.test.tsx` compare donc les
 * classes de ce titre à celles de la page publique, et rougit si l'une des deux
 * bouge sans l'autre.
 */

export function ApercuContest({
  etat,
  organisation,
  icone,
  sousTitre,
  nbMatchsOuverts,
  hrefSuivi,
}: {
  etat: EtatContest;
  organisation: { name: string; logoUrl: string | null };
  /** Emoji de la compétition ou du modèle d'événement, repli 🏆. */
  icone: string;
  /** « ⚽ Ligue 1 » pour le football, le libellé du modèle sinon. */
  sousTitre: string | null;
  /** Matchs à pronostiquer — alimente la jauge, comme sur la vraie page. */
  nbMatchsOuverts: number;
  /** Où vont le classement, les résultats et la clôture. */
  hrefSuivi: string;
}) {
  const tokens = contestThemeTokens(etat.theme);

  return (
    <CadreApercu
      /* 512 px = `max-w-lg`, la borne du conteneur de `/pronos/[slug]`. */
      classeCadre="w-full max-w-[512px]"
      legende="Aperçu — la page telle que la suivent vos clients. Vos modifications s'enregistrent toutes seules."
      banniere={
        <p
          role="status"
          className="w-full max-w-[512px] shrink-0 rounded-xl border-2 border-dashed border-k-ink/40 bg-k-yellow/40 px-3 py-2 text-xs font-black text-k-ink"
        >
          Aperçu : rien n&apos;y est jouable. La grille de pronostics, le
          classement rempli et l&apos;écran de profil n&apos;y sont pas — vos
          clients, eux, les verront.
        </p>
      }
    >
      <PlayerPageShell
        pageStyle={tokens.pageStyle}
        /* Le fond du THÈME n'est qu'un repli : `fondChoisi` distingue « suivre
           le thème » (chaîne vide, donc pas un choix) de « aucun fond » (choix
           explicite). Exactement le `Shell` de la page publique. */
        fond={fondChoisi(etat.fond_key || null, fondPourTheme(tokens.key))}
      >
        {/* `mx-auto max-w-lg px-4 py-8 sm:py-12` : le conteneur EXACT de la
            page publique. */}
        <div className="mx-auto max-w-lg px-4 py-8 sm:py-12">
          {/* ── En-tête : COPIE GARDÉE de la page publique (voir l'en-tête) ── */}
          <header className="text-center mb-8">
            {organisation.logoUrl ? (
              // URL Supabase déjà validée à l'upload ; une image HTML évite de
              // figer le domaine du projet dans next.config.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={organisation.logoUrl}
                alt={organisation.name}
                width={64}
                height={64}
                className="mx-auto mb-3 h-16 w-16 rounded-full border-2 border-k-ink object-cover bg-white"
              />
            ) : (
              <div className="mx-auto mb-3 text-5xl">{icone}</div>
            )}
            <p className="text-sm font-bold uppercase tracking-wide text-k-body">
              {organisation.name}
            </p>
            <h1 className="mt-1 text-3xl font-black text-k-ink leading-tight">
              {etat.name}
            </h1>
            {sousTitre && (
              <p className="mt-1 text-sm text-k-body">{sousTitre}</p>
            )}
          </header>

          <PlayerHub
            firstName="Camille"
            avatar={DEFAULT_AVATAR}
            points={0}
            rank={null}
            totalPlayers={0}
            toPredict={nbMatchsOuverts}
            /* `null` sur les trois : aucune récompense inventée, et surtout
               aucune proposition de Passeport ni de Jackpot — elles
               interrogeraient leur module depuis un écran de réglages. */
            award={null}
            organizationId={null}
            sortie={null}
            matchesSlot={
              <section className="space-y-6">
                <PredictionProgress done={0} total={nbMatchsOuverts} />
                <div className="k-border rounded-2xl bg-white p-5 text-center text-sm font-bold text-k-body shadow-[6px_6px_0_var(--color-k-ink)]">
                  {nbMatchsOuverts > 0 ? (
                    <>
                      {nbMatchsOuverts} match
                      {nbMatchsOuverts > 1 ? "es" : ""} à pronostiquer
                      s&apos;afficheront ici, avec un champ de score par
                      rencontre. La grille n&apos;est pas jouable dans
                      l&apos;aperçu.
                    </>
                  ) : (
                    <>
                      Ce championnat n&apos;a encore ni match ni question :
                      ajoutez-en à l&apos;étape « Les matchs » ou « Les questions
                      bonus » pour donner à vos clients de quoi jouer.
                    </>
                  )}
                </div>
              </section>
            }
            leaderboardSlot={
              <ContestLeaderboardCard
                title="Classement"
                entries={[]}
                totalPlayers={0}
                myPlayerId={null}
                finished={false}
                emptyText="Le classement apparaîtra dès les premiers pronostics — vous le suivrez depuis le tableau de bord."
              />
            }
            profileSlot={
              <div className="k-border rounded-2xl bg-white p-5 text-sm font-bold text-k-body shadow-[6px_6px_0_var(--color-k-ink)]">
                Vos clients changent ici leur pseudo et leur avatar. L&apos;écran
                n&apos;est pas reproduit dans l&apos;aperçu :{" "}
                <a
                  href={hrefSuivi}
                  className="underline underline-offset-2 hover:text-k-ink"
                >
                  le suivi du championnat
                </a>{" "}
                montre qui s&apos;est inscrit.
              </div>
            }
          />
        </div>
      </PlayerPageShell>
    </CadreApercu>
  );
}

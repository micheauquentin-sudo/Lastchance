"use client";

import { useMemo, useSyncExternalStore } from "react";
import { CadreApercu } from "@/components/studio/cadre-apercu";
import { CalendarTracker } from "@/components/calendar/calendar-tracker";
import { calendarThemeTokens } from "@/components/calendar/calendar-theme";
import { PlayerPageShell } from "@/components/ui/player-page-shell";
import { fondChoisi, fondPourTheme } from "@/lib/fonds-ecran";
import type { CalendarPublicDay, CalendarPublicState } from "@/lib/calendar";
import type { SortieApresJeu } from "@/lib/sortie-apres-jeu";
import type { CalendarDay } from "@/types/database";
import type { EtatCalendrier } from "@/components/calendar/studio/etat";

/**
 * L'APERÇU DU CALENDRIER — ET C'EST LA VRAIE PAGE, PAS UNE MAQUETTE (VIT-39).
 *
 * Il monte `CalendarTracker` dans `PlayerPageShell`, exactement les deux
 * composants que sert `/calendar/[slug]`, et il résout son fond avec
 * `fondChoisi` — la même fonction. Ce qui se voit ici est ce qui sera servi.
 *
 * Une maquette approximative aurait été une seconde page joueur à tenir
 * d'accord avec la première. C'est le seul défaut qu'un aperçu ne doit jamais
 * avoir parce qu'il est INVISIBLE : rien ne casse, tout a l'air de
 * fonctionner, et l'écart ne se découvre qu'en ouvrant la vraie page (ADR-152).
 *
 * ── CE QUI EST NEUTRALISÉ, ET SEULEMENT CELA ──
 *
 * `apercu` coupe les trois chemins qui PARLENT AU SERVEUR : le poll d'état,
 * l'ouverture d'une case (qui grave une ouverture et brûle un lot au nom du
 * commerçant) et l'inscription au rappel. Rien d'autre n'est touché — pas une
 * classe, pas un bloc.
 *
 * ── L'ÉTAT INITIAL EST FABRIQUÉ, JAMAIS DEMANDÉ ──
 *
 * Il se compose de l'état du studio (le nom, le thème, le message et le cadeau
 * en cours de saisie) et des cases DÉJÀ chargées par la page. Aucune n'est
 * `opened` : le commerçant n'a rien ouvert, et une case ouverte laisserait
 * fuir un contenu que la page publique ne montre jamais avant l'ouverture.
 *
 * ── LE STATUT DES CASES SE CALCULE APRÈS L'HYDRATATION ──
 *
 * « Cette case est-elle ouvrable ? » dépend de l'HEURE, qui n'est pas la même
 * au rendu serveur et au rendu navigateur : la calculer directement donnerait
 * un écart d'hydratation, c'est-à-dire un écran qui perd toute son
 * interactivité en silence. Le rendu serveur montre donc la grille au repos
 * (tout verrouillé), et le vrai statut arrive au montage — soit exactement ce
 * que fait déjà `useHydrated` dans le tracker pour le partage natif.
 */
/** Rien à écouter : le seul changement qui compte est l'hydratation elle-même. */
const abonnementVide = () => () => {};

/**
 * L'INSTANT DU NAVIGATEUR, LU UNE FOIS ET MÉMORISÉ.
 *
 * `useSyncExternalStore` exige un instantané STABLE : rendre `Date.now()` à
 * chaque appel ferait boucler React, qui compare l'ancien et le nouveau pour
 * décider s'il doit re-rendre. Et il doit rester hors du corps du composant —
 * lire l'heure pendant un rendu est impur, donc instable au moindre re-rendu.
 *
 * Pour un aperçu, un instant figé au chargement est même le bon comportement :
 * la grille ne doit pas se réorganiser sous les yeux du commerçant pendant
 * qu'il règle ses couleurs.
 */
let instantNavigateur: number | null = null;
const maintenantClient = () => (instantNavigateur ??= Date.now());
/** Au rendu SERVEUR, aucune heure : la grille se montre au repos. */
const maintenantServeur = () => null;

export function ApercuCalendrier({
  calendarId,
  etat,
  jours,
  organizationName,
  organizationId,
  logoUrl,
  sortie,
}: {
  calendarId: string;
  etat: EtatCalendrier;
  /** Les cases en base — leur `unlock_at` fait foi. */
  jours: CalendarDay[];
  organizationName: string;
  organizationId: string;
  logoUrl: string | null;
  sortie: SortieApresJeu | null;
}) {
  // Serveur → `null`, navigateur après hydratation → l'instant du chargement.
  // Exactement le motif `useHydrated` du tracker, appliqué à l'heure.
  const maintenant = useSyncExternalStore(
    abonnementVide,
    maintenantClient,
    maintenantServeur,
  );

  const nombre = useMemo(() => {
    const saisi = Number.parseInt(etat.day_count, 10);
    if (!Number.isFinite(saisi)) return jours.length;
    return Math.min(Math.max(saisi, 0), 60);
  }, [etat.day_count, jours.length]);

  const initialState = useMemo<CalendarPublicState>(() => {
    const parIndex = new Map(jours.map((j) => [j.day_index, j]));
    const days: CalendarPublicDay[] = [];
    for (let index = 1; index <= nombre; index += 1) {
      const jour = parIndex.get(index);
      const unlockAt = jour?.unlock_at ?? null;
      const ouvrable =
        maintenant !== null &&
        unlockAt !== null &&
        Date.parse(unlockAt) <= maintenant;
      days.push({
        dayIndex: index,
        unlockAt,
        status: ouvrable ? "available" : "locked",
        isSpecial: jour?.is_special ?? false,
        // AUCUN CONTENU : une case non ouverte n'en porte pas sur la page
        // publique, et l'aperçu ne doit pas montrer ce qu'un joueur ne verrait
        // qu'après avoir cliqué.
        contentType: null,
        contentText: null,
        rewardLabel: null,
        rewardDetails: null,
        code: null,
        spinGrantToken: null,
        targetWheelId: null,
        resultingSpinId: null,
        outOfStock: false,
      });
    }
    return {
      state: "ok",
      calendar: {
        id: calendarId,
        name: etat.name,
        theme: etat.theme,
        status: "active",
        dayCount: nombre,
        merchantContent: etat.merchant_content || null,
        completionRewardLabel: etat.completion_reward_label,
        completionRewardDetails: etat.completion_reward_details || null,
      },
      days,
      progression: { openedCount: 0, dayCount: nombre },
      completionReward: null,
    };
  }, [
    calendarId,
    etat.completion_reward_details,
    etat.completion_reward_label,
    etat.merchant_content,
    etat.name,
    etat.theme,
    jours,
    maintenant,
    nombre,
  ]);

  const tokens = calendarThemeTokens(etat.theme);

  return (
    <CadreApercu
      /* 448 px, ET CE N'EST PAS UN CHOIX D'ESTHÉTIQUE : c'est `max-w-md`, la
         borne que `CalendarTracker` pose sur son propre conteneur. Un cadre
         plus large rendrait une mise en page que personne ne verra. La valeur
         reste LITTÉRALE — Tailwind ne compile pas une classe construite à
         l'exécution. */
      classeCadre="w-full max-w-[448px]"
      legende="Aperçu — la vraie page de vos clients. Vos modifications s'enregistrent toutes seules."
      banniere={
        <p
          role="status"
          className="w-full max-w-[448px] shrink-0 rounded-xl border-2 border-dashed border-k-ink/40 bg-k-yellow/40 px-3 py-2 text-xs font-black text-k-ink"
        >
          Aperçu : ouvrir une case ou s&apos;inscrire au rappel ne fait rien
          ici. Vos clients, eux, ouvriront pour de vrai.
        </p>
      }
    >
      <PlayerPageShell
        pageStyle={tokens.pageStyle}
        /* Le fond du THÈME n'est qu'un repli : il ne s'applique que si le
           commerçant n'a rien choisi. `fondChoisi` distingue « suivre le
           thème » (chaîne vide → null) de « aucun fond » (choix explicite). */
        fond={fondChoisi(etat.fond_key || null, fondPourTheme(tokens.key))}
      >
        <CalendarTracker
          apercu
          calendarId={calendarId}
          publicSlug={etat.public_slug}
          organizationName={organizationName}
          organizationId={organizationId}
          logoUrl={logoUrl}
          theme={etat.theme}
          merchantContent={etat.merchant_content || null}
          initialState={initialState}
          // Vides, et c'est honnête : aucune case n'est ouvrable ici, aucun
          // tour de roue ne peut partir.
          dayIds={{}}
          spinBundles={{}}
          sortie={sortie}
        />
      </PlayerPageShell>
    </CadreApercu>
  );
}

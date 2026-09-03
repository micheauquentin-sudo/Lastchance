"use client";

import { useRef, useState } from "react";
import { updateCalendar } from "@/actions/calendar";
import { useActionForm } from "@/lib/use-action-form";
import { CoquilleStudio } from "@/components/studio/coquille";
import { useEnregistrementDepuisEtat } from "@/components/studio/use-enregistrement-etat";
import {
  CalendarDaysEditor,
  CalendarStatusControls,
  type CalendarWheelOption,
} from "@/components/dashboard/calendar-editor";
import { AtelierCalendrierVerification } from "@/components/dashboard/atelier-calendar-verification";
import { CALENDAR_DAY_LOSS_HINT } from "@/lib/validations/calendar";
import type { EntreeVerificationCalendrier } from "@/lib/activation/calendar";
import type { SortieApresJeu } from "@/lib/sortie-apres-jeu";
import type { Calendar, CalendarDay } from "@/types/database";
import { ApercuCalendrier } from "@/components/calendar/studio/apercu";
import { ChampsCachesCalendrier } from "@/components/calendar/studio/champs-caches";
import {
  etatInitialCalendrier,
  type EtatCalendrier,
} from "@/components/calendar/studio/etat";
import {
  ETAPES_STUDIO_CALENDRIER,
  parseEtapeStudioCalendrier,
  type EtapeStudioCalendrier,
} from "@/components/calendar/studio/etapes";
import {
  EtapeAllure,
  EtapeCadeau,
  EtapeCodes,
  EtapeDates,
  EtapeMessage,
  EtapeNom,
} from "@/components/calendar/studio/pages";

/**
 * LE STUDIO DU CALENDRIER (VIT-39) — l'écran de réglages, en voyant la page.
 *
 * ── CE QU'IL TIENT, ET RIEN D'AUTRE ──
 *
 * Trois choses : l'état des réglages, la charge utile du formulaire, et
 * l'étape affichée. La coquille, le fil d'étapes, le bandeau et
 * l'enregistrement automatique viennent du socle (`@/components/studio/`) ;
 * chaque étape vit dans `studio/pages.tsx`, l'aperçu dans `studio/apercu.tsx`.
 *
 * ── LE PIÈGE QUE CE FICHIER EXISTE POUR DÉSAMORCER ──
 *
 * `updateCalendar` lit TREIZE champs d'un seul `FormData` et réécrit la ligne
 * en bloc : un champ absent est ÉCRASÉ. C'est pour cela que l'atelier
 * historique n'a jamais eu qu'une étape « Les réglages », déclarée
 * INDIVISIBLE. La parade n'est pas une précaution mais la structure entière de
 * cet écran : aucun contrôle visible ne porte de `name`, et
 * `ChampsCachesCalendrier` rend la charge EN ENTIER à chaque rendu, depuis
 * l'état, quelle que soit l'étape ouverte.
 *
 * ── LE SEUL GESTE QUI SORT DE L'AUTOMATISME ──
 *
 * Réduire `day_count` DÉTRUIT : les dernières cases partent avec leur contenu
 * et les codes CADEAU- qu'elles ont distribués. L'action refuse une première
 * fois, et ce refus fait apparaître la confirmation. Un enregistrement
 * automatique rendrait la réduction IMPOSSIBLE — chaque frappe reposterait
 * sans la confirmation et ferait retomber `state`, donc disparaître la case
 * avant même qu'on puisse la cocher.
 *
 * L'automatisme est donc SUSPENDU tant que le nombre de cases diffère de la
 * valeur en base, et le bouton reprend la main. La règle est ÉTROITE, et
 * c'est son étroitesse qui compte : dès que le nombre revient à sa valeur
 * d'origine, tout le reste du studio s'enregistre de nouveau seul. C'est le
 * comportement exact de l'atelier (`calendar-editor.tsx`), reporté ici.
 */
const ID_FORMULAIRE = "studio-calendrier-reglages";

export function CalendrierStudio({
  calendar,
  jours,
  roues,
  entreeVerification,
  garnies,
  organizationName,
  organizationId,
  logoUrl,
  publicUrl,
  sortie,
  peutEditer,
}: {
  calendar: Calendar;
  jours: CalendarDay[];
  roues: CalendarWheelOption[];
  entreeVerification: EntreeVerificationCalendrier;
  /** Cases complètes ET donnant quelque chose — ce qu'une réduction perdrait. */
  garnies: number;
  organizationName: string;
  organizationId: string;
  logoUrl: string | null;
  /** Page publique, `null` tant que le calendrier n'est pas ouvert. */
  publicUrl: string | null;
  sortie: SortieApresJeu | null;
  peutEditer: boolean;
}) {
  const [etape, setEtape] = useState<EtapeStudioCalendrier>(() =>
    parseEtapeStudioCalendrier(null),
  );
  const [etat, setEtat] = useState<EtatCalendrier>(() =>
    etatInitialCalendrier(calendar),
  );
  const [confirmeSuppression, setConfirmeSuppression] = useState(false);

  const formulaire = useRef<HTMLFormElement | null>(null);

  const { state, pending, onSubmit } = useActionForm(updateCalendar, {
    networkError: "Enregistrement impossible, réessayez.",
    // La confirmation est un consentement à UN envoi : elle ne survit pas au
    // succès, sans quoi la réduction suivante partirait sans être demandée.
    onSuccess: () => setConfirmeSuppression(false),
  });

  /**
   * DÉRIVÉ DE LA PROP, JAMAIS COPIÉ DANS UN ÉTAT.
   *
   * `calendar.day_count` est la valeur EN BASE. Après un enregistrement
   * réussi, le rafraîchissement RSC la met à jour et l'automatisme reprend
   * tout seul. Le recopier dans un `useState` l'aurait figé à l'ouverture :
   * l'écran serait resté suspendu pour toujours après la première réduction,
   * et personne ne l'aurait relié à ce choix.
   */
  const dayCountInitial = String(calendar.day_count);
  const grilleModifiee = etat.day_count !== dayCountInitial;

  /**
   * L'ENREGISTREMENT AUTOMATIQUE VIENT DU SOCLE (VIT-38), avec ses deux gardes
   * — rien au montage, rien sans le droit d'écrire — et une troisième, propre
   * au calendrier : rien tant que le nombre de cases a bougé. Voir l'en-tête.
   */
  useEnregistrementDepuisEtat({
    valeur: etat,
    formulaire,
    actif: peutEditer && !grilleModifiee,
  });

  const majEtat = (patch: Partial<EtatCalendrier>) =>
    setEtat((e) => ({ ...e, ...patch }));

  // Le refus de l'action NOMME le nombre de cases supprimées et le nombre de
  // codes qui deviendraient introuvables. On ne demande la confirmation
  // qu'après lui : avant, elle serait du bruit sur un coût inconnu. Filtré sur
  // CE refus — ce formulaire échoue aussi pour un nom vide ou une URL prise.
  const refusSuppression =
    !!state && !state.ok && state.error.includes(CALENDAR_DAY_LOSS_HINT);

  const proprietes = { etat, majEtat, peutEditer };

  return (
    <CoquilleStudio
      titre="Mon studio — calendrier"
      hrefRetour={`/dashboard/calendar/${calendar.id}`}
      idFormulaire={ID_FORMULAIRE}
      formulaire={formulaire}
      onSubmit={onSubmit}
      champsCaches={
        <ChampsCachesCalendrier
          id={calendar.id}
          etat={etat}
          confirmeSuppression={confirmeSuppression}
        />
      }
      etapes={ETAPES_STUDIO_CALENDRIER}
      etape={etape}
      onEtape={setEtape}
      peutEditer={peutEditer}
      enregistrement={{
        enCours: pending,
        reussi: state?.ok === true,
        erreur: state && !state.ok ? state.error : undefined,
      }}
      apercu={
        <ApercuCalendrier
          calendarId={calendar.id}
          etat={etat}
          jours={jours}
          organizationName={organizationName}
          organizationId={organizationId}
          logoUrl={logoUrl}
          sortie={sortie}
        />
      }
    >
      {etape === "nom" ? <EtapeNom {...proprietes} /> : null}
      {etape === "allure" ? (
        <EtapeAllure {...proprietes} logoUrl={logoUrl} />
      ) : null}
      {etape === "dates" ? (
        <EtapeDates
          {...proprietes}
          dayCountInitial={dayCountInitial}
          garnies={garnies}
          confirmeSuppression={confirmeSuppression}
          onConfirmeSuppression={setConfirmeSuppression}
          refusSuppression={refusSuppression}
        />
      ) : null}
      {/* LA GRILLE EST L'ÉDITEUR DE L'ATELIER, TEL QUEL : `updateCalendarDay`
          est atomique par case, donc immunisé au piège de l'écrasement en
          bloc. Une seconde grille propre au studio aurait été une deuxième
          vérité sur ce qu'est une case garnie. */}
      {etape === "cases" ? (
        <CalendarDaysEditor days={jours} wheels={roues} />
      ) : null}
      {etape === "cadeau" ? <EtapeCadeau {...proprietes} /> : null}
      {etape === "codes" ? <EtapeCodes {...proprietes} /> : null}
      {etape === "message" ? <EtapeMessage {...proprietes} /> : null}
      {etape === "verification" ? (
        <div className="space-y-4">
          <AtelierCalendrierVerification
            calendarId={calendar.id}
            entree={entreeVerification}
          />
          <CalendarStatusControls calendar={calendar} hrefJeu={publicUrl} />
        </div>
      ) : null}
    </CoquilleStudio>
  );
}

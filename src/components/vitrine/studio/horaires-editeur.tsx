"use client";

import { useId, useState } from "react";
import {
  VITRINE_CRENEAUX_PAR_JOUR_MAX,
  VITRINE_HEURE_PATTERN,
  VITRINE_JOURS,
  libelleJour,
  type HorairesVitrine,
  type JourVitrine,
} from "@/lib/vitrine";

/**
 * L'ÉDITEUR D'HORAIRES, JOUR PAR JOUR (VIT-31c).
 *
 * ── LES SEPT JOURS SONT DÉJÀ ÉCRITS, ET C'EST LA DEMANDE ──
 *
 * « Quand j'ajoute les heures il faudrait déjà avoir écrit Lundi Mardi etc. et
 * que le client ait juste à rajouter. » Les sept lignes sont donc TOUJOURS
 * visibles, avec leurs champs vides — il n'y a pas de bouton « ajouter un
 * jour », parce qu'une semaine a sept jours et qu'aucun commerçant n'a besoin
 * de le déclarer.
 *
 * Un jour laissé vide n'est pas un oubli à corriger : c'est « fermé », et
 * l'écran le DIT (la pastille « Fermé » à droite du nom). Sans ce mot, sept
 * lignes vides se lisent comme un formulaire pas encore rempli.
 *
 * ── DEUX CRÉNEAUX D'EMBLÉE, UN TROISIÈME À LA DEMANDE ──
 *
 * Midi et soir couvrent le cas du commerce qui coupe ; c'est la forme la plus
 * fréquente et elle doit être saisissable sans cliquer. Le troisième existe
 * (`VITRINE_CRENEAUX_PAR_JOUR_MAX` vaut 3, miroir du `check` SQL) mais reste
 * derrière un bouton : affiché d'office, il aurait fait vingt et une paires de
 * champs à l'écran pour un besoin rare.
 *
 * ── LE TEXTE LIBRE RESTE, ET IL N'EST PAS REDONDANT ──
 *
 * Le champ « Horaires » juste au-dessus porte ce que sept lignes de créneaux
 * ne savent pas dire : les jours fériés, la fermeture annuelle, « service
 * continu le samedi ». `etatHoraires` ne connaît aucun de ces cas — c'est
 * précisément pour cela que le texte libre survit à ce lot.
 *
 * ── L'ÉTAT LOCAL EXISTE PARCE QU'UNE SAISIE EST INCOMPLÈTE EN COURS ──
 *
 * `EtatStudio.horairesStructures` ne porte que des créneaux COMPLETS et
 * valides — c'est ce qui part en base. Une ligne à moitié tapée (« 12:00 » et
 * rien en face) n'y a pas sa place, et l'y refléter la ferait DISPARAÎTRE de
 * l'écran entre deux frappes. L'état local garde donc la saisie telle qu'elle
 * est, et ne pousse vers l'état du studio que ce qui tient debout.
 *
 * ── TOUT BOUTON EST `type="button"`, SANS EXCEPTION ──
 *
 * Cet éditeur vit DANS le formulaire du studio. Un bouton sans type est un
 * bouton de soumission : « + créneau » aurait enregistré la vitrine.
 */

/** Une ligne de saisie — les champs peuvent être vides ou à moitié remplis. */
interface LigneCreneau {
  de: string;
  a: string;
}

type SemaineSaisie = Record<JourVitrine, LigneCreneau[]>;

/** Deux lignes visibles d'office : le midi et le soir. */
const LIGNES_MIN = 2;

const LIGNE_VIDE: LigneCreneau = { de: "", a: "" };

function semaineDepuis(horaires: HorairesVitrine | null): SemaineSaisie {
  const semaine = {} as SemaineSaisie;
  for (const jour of VITRINE_JOURS) {
    const existants = (horaires?.[jour] ?? []).map((c) => ({ de: c.de, a: c.a }));
    // On COMPLÈTE à deux lignes sans jamais tronquer : un jour qui porte déjà
    // trois créneaux garde ses trois lignes, sans quoi ouvrir cet écran
    // effacerait le troisième à la première frappe.
    while (existants.length < LIGNES_MIN) existants.push({ ...LIGNE_VIDE });
    semaine[jour] = existants;
  }
  return semaine;
}

/** Une ligne ne compte que si les DEUX heures sont valides et ordonnées. */
function ligneValide(ligne: LigneCreneau): boolean {
  return (
    VITRINE_HEURE_PATTERN.test(ligne.de) &&
    VITRINE_HEURE_PATTERN.test(ligne.a) &&
    ligne.de < ligne.a
  );
}

/** Une ligne commencée mais qui ne tient pas debout — à signaler, pas à jeter. */
function ligneFautive(ligne: LigneCreneau): boolean {
  const vide = ligne.de === "" && ligne.a === "";
  return !vide && !ligneValide(ligne);
}

/**
 * La semaine saisie → ce qui part en base.
 *
 * `null` quand RIEN n'est saisi, et c'est la compatibilité de toutes les
 * vitrines déjà publiées : sept tableaux vides diraient « ce commerce est
 * fermé toute la semaine », ce qui n'est pas « je n'ai rien saisi ».
 */
export function horairesDepuisSaisie(
  semaine: SemaineSaisie,
): HorairesVitrine | null {
  const sortie = {} as HorairesVitrine;
  let total = 0;
  for (const jour of VITRINE_JOURS) {
    const creneaux = semaine[jour]
      .filter(ligneValide)
      .slice(0, VITRINE_CRENEAUX_PAR_JOUR_MAX)
      .map((l) => ({ de: l.de, a: l.a }));
    sortie[jour] = creneaux;
    total += creneaux.length;
  }
  return total > 0 ? sortie : null;
}

export function HorairesEditeurStudio({
  horaires,
  onChange,
  disabled,
}: {
  horaires: HorairesVitrine | null;
  onChange: (horaires: HorairesVitrine | null) => void;
  disabled?: boolean;
}) {
  // Semé UNE FOIS depuis l'état du studio : les frappes suivantes viennent
  // d'ici, et resynchroniser à chaque rendu écraserait la ligne en cours de
  // saisie par sa version « complète ou rien ».
  const [semaine, setSemaine] = useState<SemaineSaisie>(() =>
    semaineDepuis(horaires),
  );
  const idBase = useId();

  const appliquer = (suivante: SemaineSaisie) => {
    setSemaine(suivante);
    onChange(horairesDepuisSaisie(suivante));
  };

  const modifier = (
    jour: JourVitrine,
    index: number,
    champ: keyof LigneCreneau,
    valeur: string,
  ) => {
    appliquer({
      ...semaine,
      [jour]: semaine[jour].map((l, i) =>
        i === index ? { ...l, [champ]: valeur } : l,
      ),
    });
  };

  const ajouter = (jour: JourVitrine) => {
    if (semaine[jour].length >= VITRINE_CRENEAUX_PAR_JOUR_MAX) return;
    appliquer({ ...semaine, [jour]: [...semaine[jour], { ...LIGNE_VIDE }] });
  };

  const retirer = (jour: JourVitrine, index: number) => {
    appliquer({
      ...semaine,
      [jour]: semaine[jour].filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-black text-k-ink">Vos heures d&apos;ouverture</p>
      <p className="text-xs text-zinc-500">
        Les sept jours sont déjà là : remplissez seulement ceux où vous ouvrez.
        Un jour laissé vide s&apos;affiche « fermé ». C&apos;est ce qui fait
        écrire « Ouvert · ferme à 23h » sur votre page.
      </p>

      <ul className="space-y-1.5">
        {VITRINE_JOURS.map((jour) => {
          const lignes = semaine[jour];
          const ouvert = lignes.some(ligneValide);
          const idJour = `${idBase}-${jour}`;
          return (
            <li
              key={jour}
              // `role="group"` + `aria-labelledby` : au lecteur d'écran, les
              // quatre champs d'une ligne s'annoncent SOUS le nom du jour. Sans
              // cela, « ouverture, fermeture, ouverture, fermeture » se répète
              // sept fois sans qu'on sache lequel on remplit.
              role="group"
              aria-labelledby={idJour}
              className="rounded-xl border-2 border-k-ink/15 bg-white px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span id={idJour} className="text-xs font-black text-k-ink">
                  {libelleJour(jour)}
                </span>
                {!ouvert ? (
                  <span className="text-[10px] font-black uppercase tracking-[0.1em] text-zinc-400">
                    Fermé
                  </span>
                ) : null}
              </div>

              <div className="mt-1.5 space-y-1.5">
                {lignes.map((ligne, index) => (
                  <div key={index} className="flex items-center gap-1.5">
                    <input
                      type="time"
                      value={ligne.de}
                      onChange={(e) => modifier(jour, index, "de", e.target.value)}
                      disabled={disabled}
                      aria-label={`${libelleJour(jour)} — créneau ${index + 1}, ouverture`}
                      aria-invalid={ligneFautive(ligne) || undefined}
                      className={CLASSE_HEURE}
                    />
                    <span aria-hidden className="text-xs text-zinc-400">
                      →
                    </span>
                    <input
                      type="time"
                      value={ligne.a}
                      onChange={(e) => modifier(jour, index, "a", e.target.value)}
                      disabled={disabled}
                      aria-label={`${libelleJour(jour)} — créneau ${index + 1}, fermeture`}
                      aria-invalid={ligneFautive(ligne) || undefined}
                      className={CLASSE_HEURE}
                    />
                    {index >= LIGNES_MIN ? (
                      <button
                        type="button"
                        onClick={() => retirer(jour, index)}
                        disabled={disabled}
                        aria-label={`Retirer le créneau ${index + 1} de ${libelleJour(jour)}`}
                        className="rounded-lg border-2 border-k-ink/20 px-2 py-1 text-xs font-black text-k-ink"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>

              {/* LE MESSAGE DIT QUOI FAIRE, PAS « CHAMP INVALIDE ».
                  Un créneau ne franchit pas minuit (`de < a`, gardé par le
                  `check` SQL) : le bar ouvert jusqu'à 2 h s'écrit en deux
                  jours, et c'est la seule phrase qui le lui apprend au moment
                  où il s'en rend compte. */}
              {lignes.some(ligneFautive) ? (
                <p role="status" className="mt-1 text-[11px] font-semibold text-k-ink">
                  Indiquez les deux heures, la fermeture après l&apos;ouverture.
                  Après minuit, écrivez la fin sur le jour suivant.
                </p>
              ) : null}

              {lignes.length < VITRINE_CRENEAUX_PAR_JOUR_MAX ? (
                <button
                  type="button"
                  onClick={() => ajouter(jour)}
                  disabled={disabled}
                  className="mt-1 text-[11px] font-black text-k-orange-text underline underline-offset-2 disabled:text-zinc-400"
                >
                  + créneau
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const CLASSE_HEURE =
  "min-w-0 flex-1 rounded-lg border-2 border-k-ink bg-white px-2 py-1.5 text-sm font-semibold text-k-ink disabled:bg-zinc-100";

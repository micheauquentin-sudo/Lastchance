"use client";

import { useRef, useState } from "react";
import { checkinReservation } from "@/actions/reserver";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/input";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import {
  formatCreneau,
  LIBELLE_FENETRE_CHECKIN,
  type CheckinReservationResult,
} from "@/lib/reserver";
import { useActionForm } from "@/lib/use-action-form";
import { formatDate } from "@/lib/utils";
import {
  messageArrivee,
  TON_ARRIVEE,
} from "@/components/reserver/arrivee-message";

/**
 * L'ÉCRAN D'ARRIVÉES — le client se présente, il dicte son code, on l'enregistre.
 *
 * ── PAS DE SCANNER, ET C'EST UNE DÉCISION PRODUIT (ADR-109) ──
 *
 * Les autres écrans de comptoir ouvrent sur `QrScanner`. Pas celui-ci : « le QR
 * public est une adresse, jamais une preuve de présence ». Le code de
 * réservation est un identifiant que le client lit à voix haute ou montre sur
 * son écran, et le valider reste un geste de staff authentifié. La saisie
 * manuelle n'est donc pas un repli ici — c'est le chemin principal, d'où
 * l'`autoFocus` et le champ en gros caractères.
 *
 * ── LE CHAMP MET EN MAJUSCULES PENDANT LA FRAPPE ──
 *
 * L'alphabet du code ne contient que des majuscules, sans I, O, 0 ni 1. La RPC
 * fait déjà `upper(btrim())` ; la mise en forme locale n'est donc pas une
 * validation mais un retour visuel — le caissier voit tout de suite que ce
 * qu'il tape a la bonne tête, au lieu de découvrir au retour du serveur qu'un
 * espace collé traînait au bout.
 *
 * ── LE DÉCOMPTE DE SESSION ──
 *
 * Miroir de `JackpotStaffCheckin` : seules les arrivées RÉELLEMENT enregistrées
 * comptent — verdict `checked_in`, et lui seul. Un code rejoué
 * (`already_checked_in`), une annulation, un code inconnu ne gonflent rien,
 * sans quoi le chiffre affiché serait celui des tentatives du caissier et non
 * de ses clients.
 */
export function ArriveesCheckin({ timeZone }: { timeZone: string }) {
  const [code, setCode] = useState("");
  const [enregistrees, setEnregistrees] = useState(0);
  const champRef = useRef<HTMLInputElement | null>(null);

  // useActionForm et non useActionState : l'état de chargement doit retomber
  // même quand le rendu ne rejoue pas la revalidation — docs/bugs.md. C'est le
  // poste où cela coûte le plus cher : un client attend devant le comptoir.
  const { state, pending, onSubmit } = useActionForm<CheckinReservationResult>(
    checkinReservation,
    {
      networkError:
        "Connexion perdue. Vérifiez votre réseau puis réessayez — rien n'a été enregistré.",
      onSuccess: (resultat) => {
        if (resultat.verdict === "checked_in") setEnregistrees((n) => n + 1);
        setCode("");
        // Le client suivant est déjà là : le champ doit être prêt sans un clic.
        champRef.current?.focus();
      },
    },
  );

  const resultat = state?.ok ? state.data : null;
  const message = resultat ? messageArrivee(resultat.verdict) : null;

  return (
    <Card>
      <h2>Arrivées</h2>
      <p className="mt-2 text-sm font-semibold text-k-body">
        Le client vous donne le code reçu à la réservation : saisissez-le pour
        enregistrer son arrivée.
      </p>

      <form onSubmit={onSubmit} className="mt-4">
        <label
          htmlFor="arrivee-code"
          className="mb-1.5 block text-sm font-bold text-k-ink"
        >
          Code de réservation
        </label>
        <div className="flex flex-wrap items-start gap-2">
          <input
            id="arrivee-code"
            ref={champRef}
            name="code"
            value={code}
            onChange={(e) =>
              // Majuscules, et l'alphabet du code : ni I, ni O, ni 0, ni 1.
              setCode(
                e.target.value
                  .toUpperCase()
                  .replace(/[^A-HJ-NP-Z2-9]/g, "")
                  .slice(0, 8),
              )
            }
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={8}
            required
            placeholder="ABCD2345"
            aria-describedby="arrivee-code-aide"
            className="min-w-0 flex-1 rounded-xl border-2 border-k-ink bg-white px-4 py-3 font-mono text-xl font-black uppercase tracking-[0.3em] text-k-ink placeholder:font-normal placeholder:tracking-normal placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
          />
          <Button type="submit" disabled={pending || code.length === 0}>
            {pending ? "Vérification…" : "Enregistrer l'arrivée"}
          </Button>
        </div>
        <p
          id="arrivee-code-aide"
          className="mt-1.5 text-xs font-semibold text-k-body"
        >
          Huit caractères. {LIBELLE_FENETRE_CHECKIN}
        </p>
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>

      {/* Région vivante montée EN PERMANENCE : un `aria-live` créé en même
          temps que son contenu n'annonce rien. Le résultat d'un code y est donc
          annoncé, et le suivant remplace le précédent. */}
      <div aria-live="polite" className="mt-4">
        {message && resultat ? (
          <div
            role="status"
            className={`rounded-xl border-2 px-4 py-3 ${TON_ARRIVEE[message.ton]}`}
          >
            <p className="text-sm font-black">{message.titre}</p>
            <p className="mt-0.5 text-sm font-bold">{message.corps}</p>
            {resultat.code ? (
              <p className="mt-2 font-mono text-sm font-black tracking-wider">
                {resultat.code}
              </p>
            ) : null}
            {message.montrerCreneau && resultat.startsAt ? (
              <p className="mt-1 text-sm font-bold">
                {resultat.activityName ? `${resultat.activityName} · ` : ""}
                {formatCreneau(resultat.startsAt, resultat.endsAt, timeZone)}
              </p>
            ) : null}
            {resultat.verdict === "already_checked_in" &&
            resultat.checkedInAt ? (
              <p className="mt-1 text-sm font-bold">
                Enregistrée le {formatDate(resultat.checkedInAt, timeZone)}.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {enregistrees > 0 ? (
        <p className="mt-4 border-t border-zinc-100 pt-3 text-xs font-semibold text-k-body">
          Depuis l&apos;ouverture de cet écran :{" "}
          <span className="font-black text-k-ink">{enregistrees}</span> arrivée
          {enregistrees > 1 ? "s" : ""} enregistrée{enregistrees > 1 ? "s" : ""}.
        </p>
      ) : null}

      <InfoBulle
        id="arrivee-fenetre"
        resume="Jusqu'à quand un code peut-il être enregistré ?"
        className="mt-4"
      >
        {LIBELLE_FENETRE_CHECKIN} Cette tolérance existe pour les gestes normaux
        du comptoir : un atelier qui déborde, un retardataire accueilli à la
        fin, les arrivées saisies en fermant la caisse. Hors de cette fenêtre,
        rien n&apos;est enregistré et la réservation reste telle qu&apos;elle
        était.
      </InfoBulle>
    </Card>
  );
}

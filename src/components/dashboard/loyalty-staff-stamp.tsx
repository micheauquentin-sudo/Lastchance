"use client";

import { useState } from "react";
import { stampLoyaltyVisitStaff } from "@/actions/loyalty";
import type { LoyaltyStampResult } from "@/lib/loyalty";
import { Card } from "@/components/ui/card";
import {
  loyaltyTierMeta,
  messageForStampState,
} from "@/components/loyalty/loyalty-passport-state";
import { QrScanner } from "./qr-scanner";

/** Programme de fidélité en mode staff, validable en caisse. */
export interface StaffLoyaltyProgram {
  id: string;
  name: string;
}

/** Décompte de la session de caisse : visites validées et passeports créés. */
interface StampTally {
  stamped: number;
  created: number;
}

const EMPTY_TALLY: StampTally = { stamped: 0, created: 0 };

/** « 1re visite », « 4e visite » — ordinal français court. */
function visitOrdinal(visitCount: number): string {
  return visitCount <= 1 ? "1re" : `${visitCount}e`;
}

/**
 * Validation d'une visite fidélité en caisse (mode staff) : le staff choisit
 * le programme puis scanne le QR affiché par le client. Le QR encode un JETON
 * DE CHECK-IN signé et éphémère (~3 min) — jamais le jeton d'identité du
 * passeport ; la Server Action authentifiée stampLoyaltyVisitStaff vérifie la
 * signature, enregistre la visite et renvoie l'état + les paliers atteints.
 * Une saisie manuelle du jeton reste possible en repli.
 *
 * Le mode caisse est le SEUL chemin où un compte authentifié fait naître un
 * passeport. Le résultat porte donc `isNewMember` (drapeau transactionnel de
 * record_loyalty_stamp) : chaque validation dit « nouveau client » ou
 * « client connu », et un décompte de session affiche le rapport entre les
 * deux. Une caisse normale sert surtout des habitués — une rafale de créations
 * saute alors aux yeux du commerçant, sans qu'aucun seau n'ait à refuser quoi
 * que ce soit.
 */
export function LoyaltyStaffStamp({ programs }: { programs: StaffLoyaltyProgram[] }) {
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [manualToken, setManualToken] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<LoyaltyStampResult | null>(null);
  const [error, setError] = useState("");
  const [tally, setTally] = useState<StampTally>(EMPTY_TALLY);

  async function submit(rawToken: string) {
    const checkinToken = rawToken.trim();
    if (!programId || !checkinToken) return;
    setPending(true);
    setError("");
    setResult(null);
    const res = await stampLoyaltyVisitStaff({ programId, checkinToken });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const data = res.data;
    setResult(data);
    // Seule une visite RÉELLEMENT enregistrée compte : un jeton rejoué
    // (`too_soon`) ou un programme fermé ne gonfle aucun des deux compteurs.
    if (data.state === "stamped") {
      setTally((t) => ({
        stamped: t.stamped + 1,
        created: t.created + (data.isNewMember ? 1 : 0),
      }));
    }
    setManualToken("");
  }

  if (programs.length === 0) return null;

  return (
    <Card className="mt-8">
      <h2 className="font-semibold mb-1">Valider une visite fidélité</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Le client présente le QR de son passeport : scannez-le pour lui compter
        une visite.
      </p>

      {programs.length > 1 && (
        <div className="mb-4">
          <label
            htmlFor="loyalty-staff-program"
            className="mb-1.5 block text-sm font-bold text-k-ink"
          >
            Programme
          </label>
          <select
            id="loyalty-staff-program"
            value={programId}
            onChange={(e) => {
              setProgramId(e.target.value);
              setResult(null);
              setError("");
              // Le décompte n'a de sens que pour un seul programme à la fois.
              setTally(EMPTY_TALLY);
            }}
            className="w-full max-w-sm rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
          >
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <QrScanner
        label="📷 Scanner le passeport du client"
        videoLabel="Aperçu caméra pour scanner le passeport de fidélité"
        onResult={submit}
      />

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-500 hover:text-k-ink">
          Saisir le code de validation à la main
        </summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            aria-label="Code de validation affiché par le client"
            placeholder="Coller le code de validation"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <button
            type="button"
            onClick={() => submit(manualToken)}
            disabled={pending || manualToken.trim() === ""}
            className="rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            Valider
          </button>
        </div>
      </details>

      {pending && (
        <p className="mt-4 text-sm text-zinc-500" role="status">
          Validation en cours…
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="mt-4 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3"
        >
          <p className="text-sm font-semibold text-red-700">{error}</p>
          <p className="mt-1 text-xs font-medium text-red-600">
            Le code du client ne reste valable que quelques minutes : demandez-lui
            de rouvrir son passeport à l&apos;écran (il se renouvelle tout seul),
            puis scannez à nouveau.
          </p>
        </div>
      )}
      {result && <StaffStampResult result={result} />}
      <SessionTally tally={tally} />
    </Card>
  );
}

/**
 * Décompte de la session de caisse : combien de visites validées, et combien
 * d'entre elles ont ouvert un passeport. Aucun `role="status"` — le résultat de
 * chaque scan est déjà annoncé juste au-dessus, une seconde région vivante
 * doublerait l'annonce à chaque tampon.
 */
function SessionTally({ tally }: { tally: StampTally }) {
  if (tally.stamped === 0) return null;
  const known = tally.stamped - tally.created;
  // Une caisse ordinaire sert surtout des habitués : au-delà de quelques
  // créations, une majorité de nouveaux mérite un coup d'œil du commerçant.
  const unusual = tally.created >= 5 && tally.created > known;

  const s = (n: number) => (n > 1 ? "s" : "");

  return (
    <div className="mt-4 border-t border-zinc-100 pt-3">
      <p className="text-xs font-semibold text-zinc-500">
        Depuis l&apos;ouverture de cet écran : {tally.stamped} visite
        {s(tally.stamped)} validée{s(tally.stamped)}, dont{" "}
        <span className="font-black text-k-ink">
          {tally.created} nouveau{tally.created > 1 ? "x" : ""} passeport
          {s(tally.created)}
        </span>{" "}
        et {known} client{s(known)} déjà connu{s(known)}.
      </p>
      {unusual && (
        <p className="mt-1.5 text-xs font-bold text-amber-700">
          Beaucoup de passeports neufs d&apos;affilée — vérifiez que les écrans
          scannés sont bien ceux de vos clients.
        </p>
      )}
    </div>
  );
}

function StaffStampResult({ result }: { result: LoyaltyStampResult }) {
  if (result.state !== "stamped") {
    const message = messageForStampState(result.state, {
      retryInSeconds: result.retryInSeconds,
    });
    return (
      <div
        role="status"
        className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3"
      >
        <p className="text-sm font-black text-amber-900">{message.title}</p>
        {message.body && (
          <p className="mt-0.5 text-sm font-bold text-amber-800">{message.body}</p>
        )}
      </div>
    );
  }

  const meta = loyaltyTierMeta(result.tier);
  return (
    <div
      role="status"
      className="mt-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3"
    >
      <p className="text-sm font-black text-emerald-900">
        ✓ Visite validée{result.program ? ` — ${result.program.name}` : ""}
      </p>
      {/* Le premier repère du commerçant : ce scan a-t-il ouvert une carte, ou
          servi un habitué ? Le drapeau vient de la base (is_new_member), pas
          d'une déduction sur le compteur. */}
      <p className="mt-1.5">
        {result.isNewMember ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-amber-400 bg-amber-100 px-3 py-1 text-xs font-black text-amber-900">
            ✨ Nouveau client — passeport créé
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-emerald-400 bg-white px-3 py-1 text-xs font-black text-emerald-900">
            👤 Client connu — {visitOrdinal(result.visitCount)} visite
          </span>
        )}
      </p>
      <p className="mt-1.5 text-sm font-bold text-emerald-800">
        {result.visitCount} visite{result.visitCount > 1 ? "s" : ""} au total ·
        niveau {meta.emoji} {meta.label}
      </p>

      {result.milestonesReached.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-black uppercase tracking-wide text-emerald-900">
            🎉 Palier débloqué
          </p>
          {result.milestonesReached.map((m) => (
            <div
              key={m.milestoneId}
              className="rounded-lg border border-emerald-200 bg-white px-3 py-2"
            >
              <p className="text-sm font-black text-k-ink">
                {m.rewardType === "spin"
                  ? m.rewardLabel || "Tour de roue offert"
                  : m.rewardLabel || "Lot fidélité"}
              </p>
              {m.rewardType === "spin" ? (
                <p className="text-xs font-bold text-zinc-500">
                  🎡 Le client peut lancer sa roue depuis son passeport.
                </p>
              ) : m.outOfStock || !m.code ? (
                <p className="text-xs font-bold text-amber-700">
                  Lot épuisé — aucun code émis.
                </p>
              ) : (
                <p className="font-mono text-sm font-black tracking-wider text-k-ink">
                  {m.code}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

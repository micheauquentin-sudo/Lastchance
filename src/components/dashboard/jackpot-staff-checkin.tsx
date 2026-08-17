"use client";

import { useState } from "react";
import { participateJackpotStaff } from "@/actions/jackpot";
import type { JackpotParticipationResult } from "@/lib/jackpot";
import { Card } from "@/components/ui/card";
import {
  jackpotProgress,
  messageForJackpotParticipation,
} from "@/components/jackpot/jackpot-state";
import { QrScanner } from "./qr-scanner";

/** Jackpot en mode staff, validable en caisse. */
export interface StaffJackpotCampaign {
  id: string;
  name: string;
}

/** Décompte de la session de caisse : participations validées et joueurs créés. */
interface CheckinTally {
  recorded: number;
  created: number;
}

const EMPTY_TALLY: CheckinTally = { recorded: 0, created: 0 };

/**
 * Validation d'une participation au Jackpot collectif en caisse (mode staff).
 *
 * ── CE QUE CET ÉCRAN RÉPARE ─────────────────────────────────────────
 *
 * Le mode `staff` était offert au commerçant dans l'éditeur, la page joueur
 * affichait bien son QR de check-in, la Server Action `participateJackpotStaff`
 * existait — complète, authentifiée, multi-tenant, sous rate-limit — et
 * PERSONNE ne pouvait l'appeler : aucune surface de caisse ne la câblait. Un
 * commerçant qui choisissait ce mode vendait à ses clients un geste au comptoir
 * qu'aucun écran de son espace ne savait accomplir. Le client montrait son QR,
 * la caisse n'avait rien à ouvrir.
 *
 * Le composant est le miroir de `LoyaltyStaffStamp` — même QrScanner, même
 * repli de saisie manuelle, même décompte de session — avec des libellés
 * DISTINCTS : les deux sections cohabitent sur la page caisse, et un libellé
 * partagé rendrait les deux scanners indiscernables pour le staff comme pour un
 * test de bout en bout.
 *
 * Le QR encode un JETON DE CHECK-IN signé et éphémère (~3 min), jamais le jeton
 * d'identité du joueur : c'est l'action qui vérifie signature et expiration.
 */
export function JackpotStaffCheckin({
  campaigns,
}: {
  campaigns: StaffJackpotCampaign[];
}) {
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [manualToken, setManualToken] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<JackpotParticipationResult | null>(null);
  const [error, setError] = useState("");
  const [tally, setTally] = useState<CheckinTally>(EMPTY_TALLY);

  async function submit(rawToken: string) {
    const checkinToken = rawToken.trim();
    if (!campaignId || !checkinToken) return;
    setPending(true);
    setError("");
    setResult(null);

    // ENVELOPPÉ DÈS LE PREMIER JOUR. Sans ce `try`, un réseau coupé pendant
    // l'aller-retour laisse `pending` à `true` pour toujours : « Validation en
    // cours… » à l'écran, bouton désactivé, et plus jamais de réponse. La
    // caisse est le poste où cela coûte le plus cher — un client attend devant.
    let res;
    try {
      res = await participateJackpotStaff({ campaignId, checkinToken });
    } catch {
      setPending(false);
      setError("Connexion perdue. Vérifiez votre réseau et réessayez.");
      return;
    }
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const data = res.data;
    setResult(data);
    // Seule une participation RÉELLEMENT enregistrée compte : un jeton rejoué
    // (`too_soon`), un code illisible ou un jackpot fermé ne gonfle rien.
    if (data.state === "recorded") {
      setTally((t) => ({
        recorded: t.recorded + 1,
        created: t.created + (data.isNewPlayer ? 1 : 0),
      }));
    }
    setManualToken("");
  }

  if (campaigns.length === 0) return null;

  return (
    <Card className="mt-8">
      <h2 className="font-semibold mb-1">Valider une participation au jackpot</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Le client présente le code de sa page jackpot : scannez-le pour compter
        sa participation à la cagnotte commune.
      </p>

      {campaigns.length > 1 && (
        <div className="mb-4">
          <label
            htmlFor="jackpot-staff-campaign"
            className="mb-1.5 block text-sm font-bold text-k-ink"
          >
            Jackpot
          </label>
          <select
            id="jackpot-staff-campaign"
            value={campaignId}
            onChange={(e) => {
              setCampaignId(e.target.value);
              setResult(null);
              setError("");
              // Le décompte n'a de sens que pour un seul jackpot à la fois.
              setTally(EMPTY_TALLY);
            }}
            className="w-full max-w-sm rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <QrScanner
        label="🎰 Scanner le code jackpot du client"
        videoLabel="Aperçu caméra pour scanner le code jackpot du client"
        onResult={submit}
      />

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-600 hover:text-k-ink">
          Saisir le code jackpot à la main
        </summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            aria-label="Code jackpot affiché par le client"
            placeholder="Coller le code jackpot"
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
            de rouvrir sa page jackpot à l&apos;écran (il se renouvelle tout
            seul), puis scannez à nouveau.
          </p>
        </div>
      )}
      {result && <StaffCheckinResult result={result} />}
      <SessionTally tally={tally} />
    </Card>
  );
}

/**
 * Décompte de la session de caisse : combien de participations validées, et
 * combien ont fait naître un joueur. Aucun `role="status"` — le résultat de
 * chaque scan est déjà annoncé juste au-dessus (miroir de la fidélité).
 */
function SessionTally({ tally }: { tally: CheckinTally }) {
  if (tally.recorded === 0) return null;
  const known = tally.recorded - tally.created;
  // Une caisse ordinaire sert surtout des habitués : au-delà de quelques
  // créations, une majorité de nouveaux mérite un coup d'œil du commerçant.
  const unusual = tally.created >= 5 && tally.created > known;

  const s = (n: number) => (n > 1 ? "s" : "");

  return (
    <div className="mt-4 border-t border-zinc-100 pt-3">
      <p className="text-xs font-semibold text-zinc-500">
        Depuis l&apos;ouverture de cet écran : {tally.recorded} participation
        {s(tally.recorded)} validée{s(tally.recorded)}, dont{" "}
        <span className="font-black text-k-ink">
          {tally.created} nouveau{s(tally.created)} joueur{s(tally.created)}
        </span>{" "}
        et {known} client{s(known)} déjà connu{s(known)}.
      </p>
      {unusual && (
        <p className="mt-1.5 text-xs font-bold text-amber-700">
          Beaucoup de joueurs neufs d&apos;affilée — vérifiez que les écrans
          scannés sont bien ceux de vos clients.
        </p>
      )}
    </div>
  );
}

/** Habillage par ton du message d'état (même vocabulaire que la fidélité). */
const TONE_CLASS: Record<string, string> = {
  success: "border-emerald-300 bg-emerald-50 text-emerald-900",
  info: "border-sky-300 bg-sky-50 text-sky-900",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  error: "border-red-300 bg-red-50 text-red-800",
};

function StaffCheckinResult({ result }: { result: JackpotParticipationResult }) {
  // Le formatteur est celui de la page joueur : la caisse et le client lisent la
  // même issue, dans les mêmes mots — un second vocabulaire ici les ferait se
  // contredire au comptoir.
  const message = messageForJackpotParticipation(result);
  const progress = jackpotProgress(result.currentCount, result.threshold);

  return (
    <div
      role="status"
      className={`mt-4 rounded-xl border-2 px-4 py-3 ${TONE_CLASS[message.tone] ?? TONE_CLASS.info}`}
    >
      <p className="text-sm font-black">{message.title}</p>
      {message.body && <p className="mt-0.5 text-sm font-bold">{message.body}</p>}

      {result.state === "recorded" && (
        <>
          {/* Le premier repère du commerçant : ce scan a-t-il ouvert un
              compte joueur, ou servi un habitué ? Le drapeau vient de la base
              (is_new_player), pas d'une déduction sur le compteur. */}
          <p className="mt-1.5">
            {result.isNewPlayer ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-amber-400 bg-amber-100 px-3 py-1 text-xs font-black text-amber-900">
                ✨ Nouveau client — premier passage
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-emerald-400 bg-white px-3 py-1 text-xs font-black text-emerald-900">
                👤 Client connu
              </span>
            )}
          </p>
          <p className="mt-1.5 text-sm font-bold">
            {result.currentCount} participation{result.currentCount > 1 ? "s" : ""}
            {result.threshold > 0
              ? ` sur ${result.threshold} · ${progress.percent} %`
              : ""}
          </p>
          {/* Le code de retrait n'existe QUE pour un gagnant : c'est lui que le
              caissier saisit ensuite dans la caisse pour remettre le lot. */}
          {result.code && (
            <p className="mt-2 font-mono text-sm font-black tracking-wider text-k-ink">
              {result.code}
            </p>
          )}
        </>
      )}
    </div>
  );
}

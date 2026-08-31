"use client";

import { useState } from "react";
import {
  stampLoyaltyVisitStaff,
  type LoyaltyStaffStampResult,
} from "@/actions/loyalty";
import { Avatar } from "@/lib/avatars";
import { Card } from "@/components/ui/card";
import {
  loyaltyPointsGoal,
  loyaltyTierMeta,
  messageForStampState,
} from "@/components/loyalty/loyalty-passport-state";
import { QrScanner } from "./qr-scanner";

/**
 * Un cadeau du rayon, tel que la caisse a besoin de le lire. Sous-ensemble
 * strict de `LoyaltyMilestoneView` : le comptoir n'a que faire de la roue
 * cible ni du compteur de visites d'avant la bascule en monnaie.
 */
export interface StaffLoyaltyMilestone {
  id: string;
  /** LE PRIX, en points — même autorité que côté joueur (`cost_points`). */
  costPoints: number;
  rewardLabel: string;
  rewardType: "spin" | "lot";
  /** Stock épuisé : le cadeau ne peut plus être servi, il n'est pas proposé. */
  soldOut: boolean;
}

/** Programme de fidélité en mode staff, validable en caisse. */
export interface StaffLoyaltyProgram {
  id: string;
  name: string;
  /**
   * LE RAYON, CHARGÉ AVEC LA PAGE ET NON APRÈS LE SCAN.
   *
   * La fiche client a besoin du catalogue des cadeaux pour dire lesquels sont
   * à portée du solde. Ce catalogue ne dépend PAS du client scanné : il ne
   * change qu'avec le programme. Le lire au rendu de la caisse, une fois pour
   * toute la session, plutôt qu'à chaque tampon, garde le geste principal à
   * exactement un aller-retour — celui qui enregistre la visite. La fiche
   * s'affiche donc dans la même peinture que la confirmation, sans jamais la
   * retenir, parce qu'il n'y a rien à attendre.
   */
  milestones: StaffLoyaltyMilestone[];
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
  const [result, setResult] = useState<LoyaltyStaffStampResult | null>(null);
  const [error, setError] = useState("");
  const [tally, setTally] = useState<StampTally>(EMPTY_TALLY);

  async function submit(rawToken: string) {
    const checkinToken = rawToken.trim();
    if (!programId || !checkinToken) return;
    setPending(true);
    setError("");
    setResult(null);
    // ENVELOPPÉ : sans ce `try`, un réseau coupé pendant l'aller-retour laisse
    // `pending` à `true` pour toujours — « Validation en cours… » à l'écran,
    // bouton désactivé, et plus jamais de réponse. Même défaut que les quatre
    // écrans « tour offert » ; la caisse est l'endroit où il coûte le plus cher,
    // un client attend devant.
    let res;
    try {
      res = await stampLoyaltyVisitStaff({ programId, checkinToken });
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
        <summary className="cursor-pointer text-sm font-semibold text-zinc-600 hover:text-k-ink">
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
      {result && (
        <FicheClient
          result={result}
          milestones={
            programs.find((p) => p.id === programId)?.milestones ?? []
          }
        />
      )}
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

function StaffStampResult({ result }: { result: LoyaltyStaffStampResult }) {
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
              {/* Rupture de stock TESTÉE EN PREMIER : depuis 20260725200000 un
                  palier `spin` porte lui aussi un stock, et `out_of_stock` peut
                  donc arriver sur un tour offert — annoncer « le client peut
                  lancer sa roue » serait faux, aucun tour n'a été accordé. */}
              {m.outOfStock || (m.rewardType === "lot" && !m.code) ? (
                <p className="text-xs font-bold text-amber-700">
                  {m.rewardType === "spin"
                    ? "Tours offerts épuisés — aucun tour accordé."
                    : "Lot épuisé — aucun code émis."}
                </p>
              ) : m.rewardType === "spin" ? (
                <p className="text-xs font-bold text-zinc-500">
                  🎡 Le client peut lancer sa roue depuis son passeport.
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

/**
 * ── LA FICHE DU CLIENT, LUE PAR LE COMMERÇANT APRÈS LE SCAN ──
 *
 * Le tampon seul disait « visite validée » et rien d'autre : le commerçant
 * savait qu'il avait compté un passage, pas ce que ce client pouvait EMPORTER.
 * C'est pourtant la seule information qui déclenche quelque chose en caisse —
 * « il vous reste deux cafés offerts, vous les prenez maintenant ? » ne peut
 * se dire que si l'écran le montre.
 *
 * TROIS CHOSES, DANS CET ORDRE : le solde et le niveau, les cadeaux à portée
 * MAINTENANT, puis ce qu'il manque pour le suivant.
 *
 * ── LE SEUL NOM AFFICHÉ EST CELUI QUE LE CLIENT S'EST DONNÉ ──
 *
 * Depuis FID-8b, `loyalty_members` porte un `display_name` — mais c'est le
 * CLIENT qui l'écrit, depuis son passeport, et `set_loyalty_member_identity`
 * n'est accordée qu'à `service_role` : la session marchande n'a qu'un `select`
 * sur cette colonne, et une garde SQL (20261120120000, 5c) le vérifie à chaque
 * migration. Un commerçant lit donc le surnom, il ne renomme pas ses clients —
 * un libellé choisi ne doit pas devenir une fiche client subie.
 *
 * Toujours aucun courriel, aucun téléphone, aucune adresse : là il n'y a
 * réellement rien à filtrer, le schéma ne les porte pas. La caisse identifie
 * une CARTE, et son porteur seulement s'il a bien voulu se nommer.
 *
 * LE SURNOM EST ABSENT LA PLUPART DU TEMPS. C'est l'état par défaut d'une
 * carte, pas une donnée manquante : la fiche retombe alors sur son titre
 * d'origine (« Ce client »), sans emplacement vide ni « Sans nom ».
 *
 * ── POURQUOI ELLE NE RALENTIT PAS LE TAMPON ──
 *
 * Zéro appel réseau ici. Le solde, le niveau et le compteur viennent du
 * résultat que `stampLoyaltyVisitStaff` renvoyait DÉJÀ (ils étaient
 * simplement jetés à l'affichage) ; le catalogue des cadeaux est arrivé avec
 * la page. La fiche se calcule donc en mémoire, dans la peinture qui suit la
 * confirmation, sans ajouter un seul aller-retour au geste de caisse.
 */
function FicheClient({
  result,
  milestones,
}: {
  result: LoyaltyStaffStampResult;
  milestones: StaffLoyaltyMilestone[];
}) {
  // Une fiche n'a de sens que sur une visite réellement enregistrée : sur
  // `too_soon` ou `unavailable`, les compteurs renvoyés ne décrivent aucun
  // état servable et afficher un solde y serait un mensonge.
  if (result.state !== "stamped") return null;

  const solde = result.pointsBalance;
  // Un cadeau épuisé n'est PAS un cadeau : il ne peut être ni servi maintenant
  // ni visé ensuite. Il sort donc du calcul avant tout le reste, sinon la
  // caisse promettrait un lot que la base refusera d'émettre.
  const servables = milestones.filter((m) => !m.soldOut);
  const aPortee = servables.filter((m) => m.costPoints <= solde);
  // Même helper que le passeport du client (loyaltyPointsGoal) : les deux
  // écrans doivent annoncer le MÊME « il manque N points », sinon le comptoir
  // et le téléphone se contredisent devant le client.
  const objectif = loyaltyPointsGoal(solde, servables.map((m) => m.costPoints));

  const libelle = (m: StaffLoyaltyMilestone) =>
    m.rewardLabel || (m.rewardType === "spin" ? "Tour de roue offert" : "Lot fidélité");

  return (
    <section
      aria-label="Ce que ce client peut prendre"
      className="mt-3 rounded-xl border-2 border-k-ink/15 bg-white px-4 py-3"
    >
      {result.displayName ? (
        <p className="flex items-center gap-2">
          {result.avatar && (
            <Avatar id={result.avatar} className="h-7 w-7 shrink-0" />
          )}
          <span className="truncate text-base font-black text-k-ink">
            {result.displayName}
          </span>
        </p>
      ) : (
        <p className="text-xs font-black uppercase tracking-wide text-zinc-500">
          Ce client
        </p>
      )}
      <p className="mt-1 text-sm font-bold text-k-ink">
        <span className="text-lg font-black">{solde}</span> point
        {solde > 1 ? "s" : ""} à dépenser · niveau{" "}
        {loyaltyTierMeta(result.tier).label}
      </p>

      {aPortee.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-black uppercase tracking-wide text-emerald-800">
            À prendre maintenant
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {aPortee.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5"
              >
                <span className="text-sm font-black text-k-ink">{libelle(m)}</span>
                <span className="text-xs font-bold text-emerald-800">
                  {m.costPoints} points
                </span>
              </li>
            ))}
          </ul>
          {/* L'ÉCHANGE RESTE AU CLIENT. `spendLoyaltyPoints` s'authentifie par
              le cookie du passeport : la caisse n'a aucun moyen — ni aucun
              droit — de dépenser les points à sa place. La fiche informe, elle
              ne débite pas, et le dire évite au commerçant de chercher un
              bouton qui ne peut pas exister. */}
          <p className="mt-2 text-xs font-medium text-zinc-500">
            Le client valide l&apos;échange depuis son passeport ; le code de
            retrait s&apos;affiche alors sur son téléphone.
          </p>
        </div>
      ) : (
        <p className="mt-2 text-xs font-medium text-zinc-500">
          Aucun cadeau à sa portée pour l&apos;instant.
        </p>
      )}

      {objectif.nextCost !== null && (
        <p className="mt-3 border-t border-zinc-100 pt-2 text-xs font-bold text-zinc-600">
          Prochain cadeau à {objectif.nextCost} points — il lui manque{" "}
          <span className="font-black text-k-ink">
            {objectif.missing} point{objectif.missing > 1 ? "s" : ""}
          </span>
          .
        </p>
      )}
    </section>
  );
}

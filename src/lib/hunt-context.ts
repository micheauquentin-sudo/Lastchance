import "server-only";

import { cookies, headers } from "next/headers";
import { hashPlayerToken } from "@/lib/pronostics";
import {
  RATE_LIMITS,
  observeSharedKey,
  rateLimit,
  rateLimitBucket,
} from "@/lib/rate-limit";
import { clientIpFromHeaders, pressionParIp } from "@/lib/request-ip";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasHuntsAccess } from "@/lib/subscription";
import type { Hunt, HuntStep, Organization } from "@/types/database";

type PublicHuntOrganization = Pick<
  Organization,
  | "id"
  | "name"
  | "logo_url"
  | "subscription_status"
  | "trial_ends_at"
  | "past_due_since"
  | "addon_hunts"
  | "comp_access"
  | "comp_access_until"
  | "timezone"
>;

const ORG_COLUMNS =
  "id, name, logo_url, subscription_status, trial_ends_at, past_due_since, addon_hunts, comp_access, comp_access_until, timezone";

/** Erreur générique unique : aucun oracle sur l'existence/l'état interne. */
const UNAVAILABLE = "Cette chasse au trésor n'est pas disponible.";

/**
 * Préfixe commun des cookies de chasse. Isolé pour que la garde à zéro requête
 * de `loadHuntRecallContext` et le nom construit ci-dessous ne puissent pas
 * diverger : deux littéraux séparés se seraient désynchronisés en silence, et
 * la garde aurait alors refusé des gagnants légitimes.
 */
const HUNT_COOKIE_PREFIX = "lc-hunt-";

/** Nom du cookie httpOnly portant le jeton joueur d'une chasse. */
export function huntTokenCookieName(huntId: string): string {
  return `${HUNT_COOKIE_PREFIX}${huntId}`;
}

interface HuntWithOrg {
  hunt: Hunt;
  organization: PublicHuntOrganization;
}

/**
 * Charge une chasse + son organisation via la service role et VÉRIFIE la
 * cohérence inter-tenant (la service role contourne la RLS : chaque
 * relation doit pointer le même tenant). null si introuvable/incohérent.
 */
async function fetchHuntWithOrg(
  admin: ReturnType<typeof createAdminClient>,
  huntId: string,
): Promise<HuntWithOrg | null> {
  const { data } = await admin
    .from("hunts")
    .select(`*, organizations(${ORG_COLUMNS})`)
    .eq("id", huntId)
    .maybeSingle();
  if (!data) return null;

  const row = data as unknown as Hunt & {
    organizations: PublicHuntOrganization | null;
  };
  const org = row.organizations;
  if (!org || org.id !== row.organization_id) {
    console.error("[hunt-context] organisation incohérente", { huntId });
    return null;
  }
  const { organizations: _org, ...hunt } = row;
  void _org;
  return { hunt, organization: org };
}

/** Étape publique résolue par son jeton d'URL (null si inconnu). */
async function fetchStepByToken(
  admin: ReturnType<typeof createAdminClient>,
  stepToken: string,
): Promise<HuntStep | null> {
  const { data } = await admin
    .from("hunt_steps")
    .select("id, hunt_id, organization_id, position, label, hint_text, token, created_at")
    .eq("token", stepToken)
    .maybeSingle();
  return (data as HuntStep | null) ?? null;
}

export interface HuntPlayerProgress {
  /** Un joueur (cookie) est-il déjà connu sur cette chasse ? */
  hasPlayer: boolean;
  total: number;
  done: number;
  /** Positions déjà tamponnées par le joueur courant, croissantes. */
  stamped: number[];
  /** Code de retrait si la chasse est déjà terminée (null sinon). */
  completedCode: string | null;
}

/**
 * Progression du joueur courant (cookie httpOnly) en LECTURE SEULE : rien
 * n'est écrit au rendu de la page (le tampon se fait au POST du bouton).
 * Aucun joueur/cookie → progression vide.
 */
export async function loadHuntPlayerProgress(
  admin: ReturnType<typeof createAdminClient>,
  huntId: string,
): Promise<HuntPlayerProgress> {
  const { data: stepRows } = await admin
    .from("hunt_steps")
    .select("id, position")
    .eq("hunt_id", huntId);
  const steps = (stepRows as Array<{ id: string; position: number }> | null) ?? [];
  const total = steps.length;
  const posById = new Map(steps.map((s) => [s.id, s.position]));

  const store = await cookies();
  const token = store.get(huntTokenCookieName(huntId))?.value;
  const empty: HuntPlayerProgress = {
    hasPlayer: false,
    total,
    done: 0,
    stamped: [],
    completedCode: null,
  };
  if (!token) return empty;

  const { data: player } = await admin
    .from("hunt_players")
    .select("id")
    .eq("hunt_id", huntId)
    .eq("token_hash", hashPlayerToken(token))
    .maybeSingle();
  if (!player) return empty;

  const [{ data: scanRows }, { data: completion }] = await Promise.all([
    admin.from("hunt_scans").select("step_id").eq("player_id", player.id),
    admin
      .from("hunt_completions")
      .select("code")
      .eq("hunt_id", huntId)
      .eq("player_id", player.id)
      .maybeSingle(),
  ]);

  const stamped = ((scanRows as Array<{ step_id: string }> | null) ?? [])
    .map((s) => posById.get(s.step_id))
    .filter((p): p is number => typeof p === "number")
    .sort((a, b) => a - b);

  return {
    hasPlayer: true,
    total,
    done: stamped.length,
    stamped,
    completedCode: (completion as { code: string } | null)?.code ?? null,
  };
}

export type HuntStepContext =
  | { ok: false; error: string }
  | {
      ok: true;
      admin: ReturnType<typeof createAdminClient>;
      hunt: Hunt;
      step: HuntStep;
      organization: PublicHuntOrganization;
      progress: HuntPlayerProgress;
    };

/**
 * Contexte public de la page /hunt/[token] : résout étape → chasse →
 * organisation (service role + gardes inter-tenant), vérifie addon +
 * abonnement + statut actif + fenêtre de dates, et charge la progression
 * du joueur courant en lecture seule. Réponse générique unique en cas
 * d'invalidité (404 côté page) — pas d'oracle sur le motif.
 *
 * ── POURQUOI CE CHARGEUR NE REFUSE RIEN, ET CE QU'IL COMPTE ─
 *
 * Il traîne depuis quatre chantiers dans docs/bugs.md sous la mention « reste
 * non borné », c'est-à-dire comme une DETTE. Le REFUS n'en est pas une, c'est
 * une décision — écrite ici pour qu'on cesse de la rouvrir, et pour que le
 * prochain qui passera n'y glisse pas la garde décorative décrite plus bas.
 * L'absence de toute MESURE, elle, en était une, et elle est fermée : voir le
 * dernier paragraphe.
 *
 * Le coût public, MESURÉ et non estimé (`hunt-context.test.ts` l'épingle table
 * par table) : TROIS lectures `service_role` pour un visiteur sans cookie
 * (`hunt_steps` → `hunts`+`organizations` → `hunt_steps`), QUATRE pour un
 * cookie `lc-hunt-<huntId>` posé à une valeur arbitraire — il ne désigne aucun
 * joueur, la résolution s'arrête sur `hunt_players` —, SIX pour un joueur réel
 * qui revient (+ `hunt_scans`, `hunt_completions`). C'est QUATRE et non trois
 * le coût minimal d'un abuseur : le cookie est un en-tête, il ne coûte rien à
 * fabriquer. Les documents qui annonçaient « ~4 lectures » tombaient juste par
 * accident, personne n'avait compté.
 *
 * Aucune des trois clés disponibles ici ne peut porter un REFUS :
 *
 *  · le JETON D'ÉTAPE est imprimé sur un QR affiché en vitrine. Un seau posé
 *    dessus est exactement l'INTERRUPTEUR qu'ADR-032 interdit : un passant qui
 *    photographie l'affiche fermerait la chasse à tous les clients du lieu ;
 *  · l'IP porterait le même interrupteur, aggravé par le Wi-Fi du commerce et
 *    le CGNAT mobile. ⚠️ C'est bien le REFUS sur l'IP qu'ADR-032 proscrit, et
 *    non la clé elle-même : une version antérieure de cet en-tête écrivait
 *    « l'IP est proscrite par ADR-032 » et concluait de là qu'il n'y avait
 *    rien à faire. L'ADR dit l'inverse en toutes lettres — une clé partagée
 *    porte un seau LARGE et fail-OPEN, à valeur d'observabilité, jamais un
 *    refus. Le terme moyen avait été sauté ;
 *  · le COOKIE de chasse n'existe pas encore au premier scan — et le premier
 *    scan EST le produit. C'est là que ce chargeur diffère de
 *    `loadHuntRecallContext` : celui-là RESTITUE un code déjà gagné, donc son
 *    porteur a forcément le cookie, ce qui rend la garde gratuite. Ici, exiger
 *    un cookie reviendrait à demander d'avoir déjà joué pour pouvoir jouer.
 *
 * ── LA TENTATION À NE PAS SUIVRE ────────────────────────────
 *
 * Recopier ici le seau du rappel — « on borne dès qu'un cookie est présent » —
 * serait décoratif, et PIRE que là-bas. Sur le rappel, le cookie est EXIGÉ :
 * le seau siège au moins sur le seul chemin ouvert. Ici l'amplification passe
 * par le chemin SANS cookie ; le seau siégerait sur la seule route que
 * l'abuseur ne prend jamais, et la supervision afficherait une borne là où il
 * n'y en a aucune. Une garde dont on sait d'avance qu'elle ne mordra pas est
 * pire que pas de garde : elle éteint la question.
 *
 * ── CE QUI EST POSÉ : UN COMPTEUR, PAS UNE PORTE ────────────
 *
 * `observeSharedKey` sur (chasse, IP), règle `huntStepIp`, calqué sur le
 * `huntScanIp` que `stampHuntStep` consomme deux fonctions plus loin — même
 * forme, même calibrage, seau distinct pour ne pas compter deux fois le même
 * geste. Il incrémente et alerte au dépassement ; son verdict est ignoré par
 * construction, `observeSharedKey` ne rendant rien.
 *
 * Il est consommé APRÈS la résolution de l'étape : un balayage de jetons au
 * hasard s'arrête une lecture plus tôt et n'a pas de chasse à nommer. Ce qu'il
 * change n'est pas le coût — il l'augmente d'un upsert — mais le fait qu'une
 * amplification cesse d'être invisible. On ne voit pas doubler un coût qu'on
 * ne compte pas.
 *
 * ── CE QUI RESTE COMME LEVIER, ET QUI N'EST PAS UN SEAU ─────
 *
 * Borner le TRAVAIL et non l'accès (même registre qu'ADR-031) : les deux
 * premières lectures tiendraient en une seule (`hunt_steps` avec
 * `hunts(*, organizations(…))` imbriqués), à condition de conserver les DEUX
 * comparaisons inter-tenant que la service role rend obligatoires. Et le
 * filtrage de volume appartient au bord (WAF de la plateforme), pas à
 * `rate-limit.ts`. Ni l'un ni l'autre n'est fait ici : ce sont des chantiers,
 * pas des lignes à glisser.
 */
export async function loadHuntStepContext(
  stepToken: string,
): Promise<HuntStepContext> {
  const admin = createAdminClient();

  const step = await fetchStepByToken(admin, stepToken);
  if (!step) return { ok: false, error: UNAVAILABLE };

  // Compteur d'OBSERVABILITÉ sur clé PARTAGÉE (chasse + IP) : il incrémente et
  // alerte, il ne refuse JAMAIS — la seule forme admise ici (ADR-032), et celle
  // que l'ADR prescrit là où un refus serait un interrupteur. Posé APRÈS la
  // résolution de l'étape : avant, il n'y aurait pas de chasse à nommer, et un
  // balayage de jetons au hasard s'arrête de toute façon une lecture plus tôt.
  //
  // `pressionParIp` plutôt que l'IP brute : hors proxy déclaré, elle vaut
  // `unknown` et tous les visiteurs tombaient dans UNE ligne agrégée, à un seuil
  // calibré pour un seul d'entre eux — indistinguable d'une vraie pression
  // mono-IP pour qui lit la supervision. La détection est conservée, seule
  // l'attribution est perdue, et l'étiquette le dit.
  const pression = pressionParIp(
    clientIpFromHeaders(await headers()),
    "hunt_step_ip_pressure",
  );
  await observeSharedKey(
    rateLimitBucket("hunt:step:ip", step.hunt_id, pression.cle),
    RATE_LIMITS.huntStepIp,
    pression.evenement,
    { hunt_id: step.hunt_id, ip_mesuree: pression.mesuree },
  );

  const resolved = await fetchHuntWithOrg(admin, step.hunt_id);
  if (!resolved || step.organization_id !== resolved.hunt.organization_id) {
    return { ok: false, error: UNAVAILABLE };
  }
  const { hunt, organization } = resolved;

  if (!hasHuntsAccess(organization)) return { ok: false, error: UNAVAILABLE };
  if (hunt.status !== "active") return { ok: false, error: UNAVAILABLE };

  const now = Date.now();
  if (
    (hunt.starts_at && new Date(hunt.starts_at).getTime() > now) ||
    (hunt.ends_at && new Date(hunt.ends_at).getTime() <= now)
  ) {
    return { ok: false, error: UNAVAILABLE };
  }

  const progress = await loadHuntPlayerProgress(admin, hunt.id);
  return { ok: true, admin, hunt, step, organization, progress };
}

export type HuntRecallContext =
  | { ok: false; error: string }
  | {
      ok: true;
      hunt: Hunt;
      step: HuntStep;
      organization: PublicHuntOrganization;
      progress: HuntPlayerProgress;
    };

/**
 * RESTITUTION du code déjà gagné, quand la page d'étape a fermé.
 *
 * ── LE DÉFAUT FERMÉ ─────────────────────────────────────────
 *
 * `loadHuntStepContext` refuse sur le statut ET sur la fenêtre de dates AVANT
 * de charger la progression, et la page rend `notFound()`. Or le code
 * `CHASSE-…` et son formulaire de rappel par e-mail n'existent QUE sur cette
 * page. Le joueur qui a terminé la chasse le dernier jour sans laisser son
 * e-mail — l'écran lui dit que le code reste affiché, et l'ADR-024 fonde le
 * caractère facultatif de l'e-mail là-dessus — perdait l'accès à son code dès
 * qu'`ends_at` passait ou que le commerçant archivait. Le lot, lui, restait
 * encaissable : `redeem_hunt_completion` (définition unique) ne teste ni le
 * statut ni la fenêtre. Un lot dû, un comptoir prêt à l'honorer, et plus aucun
 * moyen de relire le code.
 *
 * ── CE QUE CE CHARGEUR N'OUVRE PAS ──────────────────────────
 *
 * Il ne rouvre pas le JEU. `loadHuntStepContext` reste STRICT et INCHANGÉ :
 * c'est lui — et lui seul — que `stampHuntStep` appelle, donc aucun scan,
 * aucune progression, aucune complétion nouvelle ne devient possible hors
 * fenêtre. Ce chargeur ne rend d'ailleurs PAS le client admin : rien de ce
 * qu'il retourne ne permet d'écrire.
 *
 * Il exige une complétion DÉJÀ acquise par le cookie de l'appareil : sans
 * elle, il refuse exactement comme avant et la page reste en 404. La
 * permission d'entrer, c'est le gain lui-même.
 *
 * L'indulgence sur `hasHuntsAccess` est délibérée et alignée sur
 * `loadHuntClaimContext` : une chasse dont l'abonnement a expiré laisse
 * derrière elle des codes que la caisse honore toujours ; les refuser à
 * l'affichage ne les annulerait pas, ça les rendrait seulement illisibles.
 *
 * ── CE QUI BORNE CE CHARGEUR, ET DANS QUEL ORDRE ────────────
 *
 * Il s'ajoute au chargeur strict sur une page publique `force-dynamic`,
 * atteignable par quiconque photographie le QR d'une étape en boutique : sans
 * borne, chaque requête coûtait trois lectures `service_role`, y compris sur
 * une chasse archivée. Aucune donnée n'en sortait — c'est de l'amplification
 * pure — mais un travail non borné offert à Internet reste un travail offert.
 *
 * Les trois gardes sont ordonnées du moins cher au plus cher, et chacune ferme
 * un cas que la suivante ne verrait plus :
 *
 *  1. AUCUN cookie de chasse sur cet appareil → refus à ZÉRO requête. C'est le
 *     cas de l'amplification : le porteur du QR seul n'a jamais joué. Un
 *     gagnant, lui, porte forcément `lc-hunt-<id>` — c'est ce cookie qui lui a
 *     valu son code.
 *  2. Étape résolue, mais pas le cookie de CETTE chasse → refus à UNE requête.
 *     Il faut connaître l'identifiant interne de la chasse pour aller plus
 *     loin, ce que le jeton d'étape ne donne pas.
 *  3. Seau sur le HASH du cookie joueur — une clé propre à un porteur, jamais
 *     partagée : la saturer ne borne que lui. C'est la seule forme de REFUS
 *     admissible ici (ADR-032) ; un REFUS sur le jeton d'étape ou sur l'IP
 *     serait un interrupteur, la borne d'un attaquant fermant la carte de
 *     victoire de tous les joueurs d'un même lieu. Le plafond est calibré pour
 *     un geste humain — relire sa carte de victoire quelques fois — pas pour un
 *     débit, et il ne PEUT pas l'être : voir juste en dessous.
 *
 * ── CE QUE LA GARDE 3 NE BORNE PAS, ET CE QUI EST POSÉ POUR ─
 *
 * La garde 3 borne un porteur COOPÉRATIF, jamais un débit : sa clé contient le
 * sha256 de la VALEUR du cookie de chasse, que l'utilisateur peut faire tourner
 * à chaque requête (`httpOnly` cache le cookie à JavaScript, pas à lui). Les
 * gardes 1 et 2 ne regardent que le NOM, donc elles passent ; le hash est neuf
 * à chaque coup et aucun seau ne se remplit. C'est écrit depuis un chantier —
 * et rien n'avait été posé à la place, sur le raisonnement qu'ADR-073 démonte :
 * de « aucune clé ne peut porter un REFUS », on concluait « rien à faire », en
 * sautant le terme moyen qu'ADR-032 prescrit — un seau LARGE et fail-OPEN, à
 * valeur d'observabilité.
 *
 *  4. `observeSharedKey` sur (chasse, IP), règle `huntRecallIp`, posé entre la
 *     garde 2 et la garde 3 : c'est exactement la population que la garde 3
 *     était censée borner, et l'IP est la seule clé de ce chemin que l'appelant
 *     ne choisit pas. Il ne refuse rien — `observeSharedKey` ne rend rien —
 *     donc le `failClosed: false` de la garde 3 reste entier.
 *
 * Seau DISTINCT de `huntStepIp` bien qu'il s'agisse de la même page : ce
 * chargeur ne s'exécute qu'APRÈS le refus de `loadHuntStepContext`, qui a déjà
 * compté cette même requête. Sur la même clé, un passage compterait pour deux.
 * Séparés, leur RAPPORT est l'information : la part du trafic d'une chasse qui
 * retombe sur le repli, c'est-à-dire sur le chemin qui refait toutes les
 * lectures.
 *
 * ── POURQUOI CE SEAU-CI EST `failClosed: false` ─────────────
 *
 * C'est le SEUL seau du dépôt sur clé d'identité qui ne soit pas fail-closed,
 * et l'exception se justifie par ce que ce chargeur est : le dernier endroit
 * où un gagnant peut relire un code `CHASSE-…` déjà acquis.
 *
 * `rateLimit` rend `false` quand `check_rate_limit` échoue et que le seau est
 * fail-closed (`rate-limit.ts`). Une panne de la table de compteurs fermait
 * donc cette page à des gagnants légitimes — et elle la fermait de travers :
 * pendant le MÊME incident, une chasse ENCORE ACTIVE continuait de répondre,
 * puisque `loadHuntStepContext` ne REFUSE rien — son `huntStepIp` est un
 * compteur d'observabilité, qui ne ferme aucune porte. Une chasse close aurait
 * été moins accessible qu'une chasse ouverte, au moment précis où son seul
 * recours est cette page.
 *
 * Le calcul du fail-closed suppose qu'un rejeu non borné coûte quelque chose.
 * Ici il ne coûte rien qui puisse être exploité : ce chargeur n'écrit RIEN,
 * ne rend PAS le client admin, et exige une complétion déjà acquise par le
 * cookie de l'appareil. Le seul risque résiduel est l'amplification en
 * lecture, et elle est déjà bornée par les deux gardes de cookie au-dessus —
 * qui, elles, ne dépendent d'aucune table.
 *
 * En laissant passer un verdict INDÉTERMINÉ, on choisit de rendre son code à
 * un gagnant plutôt que de le lui refuser sur une panne d'infrastructure qui
 * ne le concerne pas. Ce raisonnement ne s'exporte PAS aux autres seaux
 * d'identité du dépôt (`huntScanPlayer`, `loyaltyStampMember`,
 * `cashier:lookup`…) : ceux-là gardent des ÉCRITURES, où un rejeu non borné
 * consomme du stock, tamponne un passeport ou remet un lot.
 */
export async function loadHuntRecallContext(
  stepToken: string,
): Promise<HuntRecallContext> {
  // Garde 1 — aucune requête. `getAll` plutôt que `get` : le nom du cookie
  // porte l'identifiant de la chasse, qu'on n'a pas encore résolu.
  const store = await cookies();
  const porteUnCookieDeChasse = store
    .getAll()
    .some((cookie) => cookie.name.startsWith(HUNT_COOKIE_PREFIX));
  if (!porteUnCookieDeChasse) return { ok: false, error: UNAVAILABLE };

  const admin = createAdminClient();

  const step = await fetchStepByToken(admin, stepToken);
  if (!step) return { ok: false, error: UNAVAILABLE };

  // Garde 2 — une requête. Le cookie doit être celui de la chasse à laquelle
  // ce jeton d'étape appartient, pas celui d'une chasse quelconque.
  const playerToken = store.get(huntTokenCookieName(step.hunt_id))?.value;
  if (!playerToken) return { ok: false, error: UNAVAILABLE };

  // Compteur d'OBSERVABILITÉ sur clé PARTAGÉE (chasse + IP), posé AVANT la
  // garde 3 et non après : c'est très exactement la population que la garde 3
  // prétendait borner et ne borne pas — un porteur qui fait tourner la VALEUR
  // de son cookie ouvre un seau `hunt:recall` neuf à chaque requête, mais il ne
  // change pas d'IP. Il ne refuse rien, donc il ne touche pas au
  // `failClosed: false` ci-dessous ; il rend seulement visible une
  // amplification qui ne l'était par rien (ADR-073, même geste que sur la page
  // d'étape). Seau distinct de `huntStepIp` : ce chargeur ne tourne qu'après le
  // refus du chargeur d'étape, qui a déjà compté cette même requête.
  const pression = pressionParIp(
    clientIpFromHeaders(await headers()),
    "hunt_recall_ip_pressure",
  );
  await observeSharedKey(
    rateLimitBucket("hunt:recall:ip", step.hunt_id, pression.cle),
    RATE_LIMITS.huntRecallIp,
    pression.evenement,
    { hunt_id: step.hunt_id, ip_mesuree: pression.mesuree },
  );

  // Garde 3 — seau d'identité. Le refus reprend le refus générique du module :
  // il ne dit pas au demandeur qu'il vient d'être limité, ce qui serait déjà
  // un oracle sur l'existence de la chasse.
  //
  // `failClosed: false` : un verdict INDÉTERMINÉ (table de compteurs
  // injoignable) laisse passer. Voir l'en-tête de cette fonction — ce chargeur
  // est le dernier recours d'un gagnant, il n'écrit rien, et le fermer sur une
  // panne rendrait une chasse close moins accessible qu'une chasse ouverte.
  const autorise = await rateLimit(
    rateLimitBucket("hunt:recall", step.hunt_id, hashPlayerToken(playerToken)),
    RATE_LIMITS.huntRecall,
    { failClosed: false },
  );
  if (!autorise) return { ok: false, error: UNAVAILABLE };

  const resolved = await fetchHuntWithOrg(admin, step.hunt_id);
  if (!resolved || step.organization_id !== resolved.hunt.organization_id) {
    return { ok: false, error: UNAVAILABLE };
  }

  const progress = await loadHuntPlayerProgress(admin, resolved.hunt.id);
  // Aucune complétion sur cet appareil → même refus générique qu'avant. C'est
  // ce qui empêche cette porte d'être un oracle : sans le cookie du gagnant,
  // elle ne dit rien de plus que la 404 d'origine.
  if (!progress.completedCode) return { ok: false, error: UNAVAILABLE };

  return {
    ok: true,
    hunt: resolved.hunt,
    step,
    organization: resolved.organization,
    progress,
  };
}

export type HuntClaimContext =
  | { ok: false; error: string }
  | {
      ok: true;
      admin: ReturnType<typeof createAdminClient>;
      hunt: Hunt;
      organization: PublicHuntOrganization;
    };

/**
 * Résolution de la chasse pour le claim du code de retrait. Ciblée par
 * jeton d'étape OU identifiant de chasse. Volontairement indulgente sur
 * le statut/l'accès : le code a déjà été gagné (mêmes gardes inter-tenant
 * que le reste, mais on ne re-bloque pas une chasse clôturée après coup).
 */
export async function loadHuntClaimContext(input: {
  stepToken?: string;
  huntId?: string;
}): Promise<HuntClaimContext> {
  const admin = createAdminClient();

  let huntId = input.huntId ?? null;
  if (!huntId && input.stepToken) {
    const step = await fetchStepByToken(admin, input.stepToken);
    if (!step) return { ok: false, error: UNAVAILABLE };
    huntId = step.hunt_id;
  }
  if (!huntId) return { ok: false, error: UNAVAILABLE };

  const resolved = await fetchHuntWithOrg(admin, huntId);
  if (!resolved) return { ok: false, error: UNAVAILABLE };

  return { ok: true, admin, hunt: resolved.hunt, organization: resolved.organization };
}

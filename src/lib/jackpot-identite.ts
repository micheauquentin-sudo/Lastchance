import "server-only";

import { z } from "zod";

import { recordCounter, reportError } from "@/lib/monitoring";
import { PLAYER_IDENTITY_HASH_PATTERN } from "@/lib/player-identity";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ════════════════════════════════════════════════════════════
 * LE JACKPOT ADOPTE L'IDENTITÉ JOUEUR PARTAGÉE — côté application (ID-8b)
 * ════════════════════════════════════════════════════════════
 *
 * La base sait depuis ID-8a (migration 20261130123000) réunir deux empreintes
 * qui désignent la même personne. Elle ne sait pas TOUTE SEULE qu'elles la
 * désignent : l'empreinte que le joueur porte dans son cookie
 * `lc-jackpot-<campagne>` n'appartient à personne tant qu'un navigateur n'a pas
 * dit à quel appareil elle est attachée. Le rattrapage de la migration le dit
 * lui-même — « tant que le lot applicatif ne l'a pas fait, la base ne peut pas
 * savoir qu'elle désigne la même personne, et Phase B n'a rien à réunir ».
 *
 * Ce module est ce chaînon-là, et il tient en deux gestes.
 *
 * ── LES TROIS FONCTIONS SONT RÉSERVÉES À `service_role` ──
 *
 * `link_jackpot_legacy_identity` et `dedupe_jackpot_player_identities` sont
 * `security definer` et n'ont de `grant execute` que pour `service_role`
 * (20261130123000 §5) : elles ne passent donc que par `createAdminClient`, qui
 * retire le filet de la RLS. L'AUTORISATION EST DONC ENTIÈREMENT CÔTÉ
 * APPLICATION, et c'est l'appelant qui la porte :
 *
 *   · chemin caisse — `participateJackpotStaff` a déjà exigé une session
 *     (`getUserAndOrg`), un rôle de comptoir (owner / editor / cashier), et
 *     VÉRIFIÉ que la campagne appartient à l'organisation active avec le client
 *     RLS de l'utilisateur, avant la moindre écriture ;
 *   · chemins publics — `participateJackpot` et `getJackpotCheckinToken`
 *     passent par `loadJackpotActionContext`, qui résout la campagne, contrôle
 *     la cohérence inter-tenant, l'ouverture du module et le statut actif.
 *
 * Aucune des deux fonctions ci-dessous ne prend un identifiant venu du client :
 * `campaignId` et `organizationId` sortent de la campagne déjà résolue, et
 * `playerId` du socle. Elles revalident quand même leur forme — un défaut
 * d'appelant se voit ici, pas dans un message d'erreur Postgres.
 *
 * ── QUAND LA DÉDUPLICATION SE DÉCLENCHE, ET POURQUOI PAS AILLEURS ──
 *
 * JAMAIS À LA LECTURE. Afficher `/jackpot/<slug>` ne doit rien écrire (même
 * règle que le repli d'identité, qui ne pose pas même un cookie), et une page
 * suivable est rafraîchie en boucle depuis un écran de salle : y accrocher une
 * réunion d'identités ferait tourner un balayage de campagne à chaque sondage.
 *
 * AU GESTE D'ÉCRITURE, et seulement quand un doublon est MESURÉ. La RPC balaie
 * toutes les empreintes de la campagne ; l'appeler à chaque participation la
 * ferait tourner pour rien dans l'immense majorité des cas. On oppose donc deux
 * lectures indexées d'abord — la personne porte-t-elle plus d'une empreinte, et
 * ces empreintes portent-elles plus d'une ligne joueur ? C'est exactement la
 * condition que le contrôle négatif (a) de la migration mesure, et elle
 * redevient fausse une fois la fusion faite.
 *
 * ── UN COÛT CONNU, ET ASSUMÉ ICI PLUTÔT QUE DISSIMULÉ ──
 *
 * Le survivant désigné par `jackpot_identity_for_player` est l'empreinte à la
 * LIGNE JOUEUR LA PLUS ANCIENNE. Un client dont le cookie de module n'est pas
 * cette empreinte-là voit donc sa ligne recréée à la participation suivante,
 * puis réabsorbée : une réunion par participation, pour lui seul. La corriger
 * demanderait que le chemin d'ÉCRITURE adopte l'empreinte canonique au lieu du
 * cookie — c'est précisément le renversement qu'ADR-041 interdit de faire en
 * silence, et il n'a rien à faire dans un lot qui promet de n'AJOUTER que des
 * chemins. Le compteur ci-dessous en donne la mesure avant qu'on en décide.
 *
 * ── RIEN DE TOUT CELA NE PEUT FAIRE ÉCHOUER UN GESTE ──
 *
 * Une caisse ne doit pas refuser un client pour un défaut de comptabilité
 * d'identité, et une participation déjà enregistrée ne doit pas rendre une
 * erreur parce que la réunion a échoué APRÈS elle. Ces fonctions ne lèvent
 * jamais et ne rendent rien : elles tracent et s'arrêtent.
 */

const porteeSchema = z.object({
  organizationId: z.uuid(),
  campaignId: z.uuid(),
});

const personneSchema = porteeSchema.extend({ playerId: z.uuid() });

const empreinteSchema = porteeSchema.extend({
  tokenHash: z.string().regex(PLAYER_IDENTITY_HASH_PATTERN),
});

/** Empreintes jackpot d'une personne sur une campagne (aucune → liste vide). */
async function empreintesDeLaPersonne(
  admin: ReturnType<typeof createAdminClient>,
  params: { organizationId: string; campaignId: string; playerId: string },
): Promise<string[]> {
  const { data, error } = await admin
    .from("player_legacy_identities")
    .select("legacy_identity_hash")
    .eq("player_id", params.playerId)
    .eq("organization_id", params.organizationId)
    .eq("experience_kind", "jackpot")
    .eq("experience_id", params.campaignId);
  if (error) {
    reportError("jackpot.identite.empreintes", error.message);
    return [];
  }
  const empreintes: string[] = [];
  for (const ligne of data ?? []) {
    const empreinte = (ligne as { legacy_identity_hash: string | null })
      .legacy_identity_hash;
    if (!empreinte || !PLAYER_IDENTITY_HASH_PATTERN.test(empreinte)) continue;
    empreintes.push(empreinte);
  }
  return empreintes;
}

/**
 * Réunit les lignes jackpot d'une personne sur une campagne — SI et seulement
 * si elle en porte réellement deux.
 *
 * Deux lectures indexées avant la RPC, et jamais l'inverse : c'est ce qui fait
 * qu'un client ordinaire (une empreinte, une ligne) ne paie qu'un `select` par
 * participation, là où la déduplication balaie toute la campagne.
 */
export async function reunirIdentitesJackpot(params: {
  organizationId: string;
  campaignId: string;
  playerId: string;
}): Promise<void> {
  const parsed = personneSchema.safeParse(params);
  if (!parsed.success) {
    // Le CHAMP fautif, jamais sa valeur : l'identifiant d'une personne n'a rien
    // à faire dans Sentry.
    reportError(
      "jackpot.identite.reunir-input",
      `champ invalide : ${parsed.error.issues[0]?.path.join(".") ?? "inconnu"}`,
    );
    return;
  }

  try {
    const admin = createAdminClient();
    const empreintes = await empreintesDeLaPersonne(admin, parsed.data);
    // UNE SEULE empreinte : il n'y a rien à réunir, et c'est le cas de presque
    // tout le monde. On sort avant la seconde lecture.
    if (empreintes.length < 2) return;

    const { data, error } = await admin
      .from("jackpot_players")
      .select("token_hash")
      .eq("campaign_id", parsed.data.campaignId)
      .in("token_hash", empreintes);
    if (error) {
      reportError("jackpot.identite.doublon", error.message);
      return;
    }
    // Le DOUBLON LUI-MÊME, mesuré : deux lignes joueur pour une personne sur
    // une campagne. C'est le contrôle négatif (a) de la migration, et il
    // redevient faux dès que la RPC a fait son travail.
    if ((data ?? []).length < 2) return;

    const { error: rpcError } = await admin.rpc(
      "dedupe_jackpot_player_identities",
      { p_campaign_id: parsed.data.campaignId },
    );
    if (rpcError) {
      reportError("jackpot.identite.dedupe", rpcError.message);
      return;
    }
    // ZÉRO EST LA VALEUR ATTENDUE en régime établi ; une population non nulle
    // dit combien de clients portaient encore deux jeux d'entrées au tirage.
    recordCounter("jackpot.identite.deduplication");
  } catch (err) {
    reportError("jackpot.identite.reunir", err);
  }
}

/**
 * CHEMIN CAISSE — pose le pont d'ancienneté d'une empreinte validée au comptoir,
 * puis réunit ce que ce pont vient de rendre visible.
 *
 * ── LA FUITE QUE CETTE FONCTION FERME ──
 *
 * `participateJackpotStaff` était le SEUL chemin d'écriture du module à ne
 * jamais poser de pont d'identité — les deux chemins publics appellent
 * `ensureProgressivePlayerIdentity`, lui non. Les gains d'une empreinte non
 * pontée sont invisibles : `sync_reward_issuance` résout leur bénéficiaire par
 * `reward_player_from_legacy(...)`, qui rend `null`, et le lot n'apparaît
 * JAMAIS sur `/portefeuille` — page qui promet pourtant « les lots gagnés
 * depuis ce téléphone ». Même défaut qu'ADR-066, autre module.
 *
 * ── POURQUOI PAS `ensureProgressivePlayerIdentity` ICI, ET C'EST CAPITAL ──
 *
 * Elle lit le cookie `lc-player` de la requête courante. Sur ce chemin, la
 * requête est celle du POSTE DE CAISSE : son appareil est celui du commerçant,
 * pas celui du client. L'appeler rattacherait l'empreinte du client à la
 * personne du caissier, et ferait converger vers un seul compte tous les
 * clients servis par ce comptoir. C'est pourquoi le module de fidélité ne
 * l'appelle pas non plus depuis sa caisse — l'absence était juste, le manque de
 * remplacement ne l'était pas.
 *
 * ── CE QUE LA CAISSE PEUT SAVOIR, ET RIEN DE PLUS ──
 *
 * Sans appareil du client, une seule chose rattache une empreinte à quelqu'un :
 * qu'elle soit DÉJÀ celle d'un membre du passeport relié à cette campagne — le
 * cas exact des empreintes recopiées par l'ancien trigger de fidélité. C'est la
 * règle de la Phase A de `dedupe_jackpot_player_identities`, appliquée ici à la
 * seule empreinte qu'on a sous la main plutôt qu'à toute la campagne. Une
 * empreinte de cookie jackpot ordinaire n'est rattachable par personne d'autre
 * que le navigateur du client, et elle l'est déjà (`getJackpotCheckinToken`).
 *
 * ── L'EMPREINTE DÉJÀ PORTÉE PAR QUELQU'UN D'AUTRE EST ÉCARTÉE ──
 *
 * `link_jackpot_legacy_identity` LÈVE dans ce cas (`23505`) plutôt que de
 * déplacer une empreinte en silence : réunir deux personnes est une décision,
 * elle a son outil (`merge_player_identities`), et le comptoir n'est pas
 * l'endroit où la prendre. On lit donc le propriétaire AVANT d'appeler.
 */
export async function ponterIdentiteJackpotCaisse(params: {
  organizationId: string;
  campaignId: string;
  tokenHash: string;
}): Promise<void> {
  const parsed = empreinteSchema.safeParse(params);
  if (!parsed.success) {
    reportError(
      "jackpot.identite.caisse-input",
      `champ invalide : ${parsed.error.issues[0]?.path.join(".") ?? "inconnu"}`,
    );
    return;
  }

  try {
    const admin = createAdminClient();

    // (1) L'empreinte a-t-elle déjà un propriétaire côté jackpot ?
    const { data: deja, error: dejaError } = await admin
      .from("player_legacy_identities")
      .select("player_id")
      .eq("organization_id", parsed.data.organizationId)
      .eq("experience_kind", "jackpot")
      .eq("experience_id", parsed.data.campaignId)
      .eq("legacy_identity_hash", parsed.data.tokenHash)
      .maybeSingle();
    if (dejaError) {
      reportError("jackpot.identite.caisse-proprietaire", dejaError.message);
      return;
    }

    const proprietaire =
      (deja as { player_id: string | null } | null)?.player_id ?? null;
    if (proprietaire) {
      // Pont déjà là (cas normal : le navigateur du client l'a posé en
      // demandant son QR). Reste à réunir, si un doublon existe.
      await reunirIdentitesJackpot({
        organizationId: parsed.data.organizationId,
        campaignId: parsed.data.campaignId,
        playerId: proprietaire,
      });
      return;
    }

    // (2) Le passeport relié est la seule ancienneté que le comptoir puisse
    // lire : `jackpot_campaign_id` porte le lien, et il est borné au locataire.
    const { data: programme, error: programmeError } = await admin
      .from("loyalty_programs")
      .select("id")
      .eq("organization_id", parsed.data.organizationId)
      .eq("jackpot_campaign_id", parsed.data.campaignId)
      .maybeSingle();
    if (programmeError) {
      reportError("jackpot.identite.caisse-programme", programmeError.message);
      return;
    }
    const programId = (programme as { id: string } | null)?.id ?? null;
    if (!programId) return;

    const { data: pontFidelite, error: pontError } = await admin
      .from("player_legacy_identities")
      .select("player_id")
      .eq("organization_id", parsed.data.organizationId)
      .eq("experience_kind", "loyalty")
      .eq("experience_id", programId)
      .eq("legacy_identity_hash", parsed.data.tokenHash)
      .maybeSingle();
    if (pontError) {
      reportError("jackpot.identite.caisse-pont-fidelite", pontError.message);
      return;
    }
    const playerId =
      (pontFidelite as { player_id: string | null } | null)?.player_id ?? null;
    // Personne connue de nulle part : il n'y a rien à ponter, et surtout rien à
    // inventer. Le client repartira avec son pont dès qu'il ouvrira la page.
    if (!playerId) return;

    const { error: linkError } = await admin.rpc("link_jackpot_legacy_identity", {
      p_player_id: playerId,
      p_organization_id: parsed.data.organizationId,
      p_campaign_id: parsed.data.campaignId,
      p_legacy_hash: parsed.data.tokenHash,
    });
    if (linkError) {
      reportError("jackpot.identite.caisse-pont", linkError.message);
      return;
    }
    recordCounter("jackpot.identite.pont_caisse");

    // Le pont VIENT d'apprendre à la base que deux empreintes désignent le même
    // client : c'est l'instant, et le seul, où la réunion a quelque chose à
    // faire sur ce chemin.
    await reunirIdentitesJackpot({
      organizationId: parsed.data.organizationId,
      campaignId: parsed.data.campaignId,
      playerId,
    });
  } catch (err) {
    reportError("jackpot.identite.caisse", err);
  }
}

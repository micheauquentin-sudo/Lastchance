#!/usr/bin/env node

// ============================================================
// Banc de capacité — mesurer une pile RÉELLE, pas une simulation
// ============================================================
//
// POURQUOI CE FICHIER EXISTE
//
// `docs/perf-report.md` annonce ~850 req/s sur `/play`. Ce chiffre a été obtenu
// contre un **Supabase simulé** : un mock local répondant avec 8 ms de latence
// injectée. Il ne prouve donc ni Vercel, ni Supabase réel, ni le réseau entre
// les deux — et le trou s'est vu : la production a tourné des semaines avec ses
// fonctions à Washington et sa base à Francfort, ~300 ms d'aller-retour par
// requête base, sans qu'aucune mesure ne le voie. Un banc qui simule le backend
// est aveugle exactement là où la production échoue.
//
// CE QUE CE BANC MESURE, ET CE QU'IL NE MESURE PAS
//
// Il mesure ce qui traverse HTTP : débit, p50/p95/p99, taux d'erreur, région
// d'exécution réelle, efficacité du cache ISR, et — c'est l'apport principal —
// la latence Supabase **vue depuis l'intérieur de la fonction**, sous charge,
// via `checks.database.latency_ms` de `/api/health`. C'est le chiffre que
// l'ancien banc remplaçait par une constante.
//
// Il ne mesure PAS la correction sous concurrence : deux caisses sur le même
// code, deux joueurs sur le dernier lot, un jeton à usage unique consommé deux
// fois. Cela existe déjà et se fait ailleurs — `scripts/concurrency-probe.mjs`,
// qui ouvre des sessions psql réelles avec rendez-vous daté et garde de
// recouvrement. Les deux outils sont complémentaires et volontairement
// disjoints : la sonde prouve des INVARIANTS à faible concurrence (8 sessions
// au plus), ce banc mesure un DÉBIT à forte concurrence sans rien affirmer sur
// les verrous. Ne pas fusionner : un outil qui mesure et juge à la fois finit
// par ne faire ni l'un ni l'autre proprement.
//
// ZÉRO DÉPENDANCE AJOUTÉE
//
// `fetch` et `performance` sont natifs depuis Node 18. Aucun autocannon, aucun
// k6 : même raison que la sonde de concurrence — un harnais de mesure n'a pas à
// alourdir la chaîne d'approvisionnement de l'application.
//
// SÉCURITÉ D'EMPLOI — LIRE AVANT DE VISER LA PRODUCTION
//
// Par défaut ce banc est en LECTURE SEULE (`page`, `health`). Le scénario
// `beacon` ÉCRIT : il incrémente le compteur d'ouvertures d'un vrai QR et
// pollue les statistiques du commerçant. Il est donc derrière `--ecrire`, et
// viser un hôte de production exige `--production` en plus. Deux verrous, parce
// qu'un banc lancé par erreur sur la prod d'un client est une panne, pas une
// mesure.
//
// USAGE
//
//   node scripts/capacity-bench.mjs --url https://…            (paliers)
//   node scripts/capacity-bench.mjs --url https://… --soak 600 (endurance)
//   node scripts/capacity-bench.mjs --url … --slug boutique --ecrire --production
//
// Options : --paliers 25,50,100  --duree 20  --warmup 3  --json rapport.json
// ============================================================

import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// ─────────────────────────────────────────────────────────────
// Arguments
// ─────────────────────────────────────────────────────────────

export function lireArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) {
      args._.push(item);
      continue;
    }
    const cle = item.slice(2);
    const suivant = argv[i + 1];
    if (suivant === undefined || suivant.startsWith("--")) {
      args[cle] = true;
    } else {
      args[cle] = suivant;
      i += 1;
    }
  }
  return args;
}

const args = lireArgs(process.argv.slice(2));

export function entierPositif(valeur, defaut, min, max) {
  const n = Number.parseInt(String(valeur ?? ""), 10);
  if (!Number.isFinite(n)) return defaut;
  return Math.min(Math.max(n, min), max);
}

const EST_POINT_ENTREE = Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(process.argv[1]).href;
const BASE_URL = String(args.url ?? process.env.BENCH_URL ?? "").replace(/\/+$/, "");
const SLUG = args.slug ? String(args.slug) : null;
const DUREE_S = entierPositif(args.duree, 20, 3, 900);
const WARMUP_S = entierPositif(args.warmup, 3, 0, 60);
const SOAK_S = args.soak ? entierPositif(args.soak, 300, 30, 7200) : null;
const ECRIRE = args.ecrire === true;
const PRODUCTION_OK = args.production === true;
const SORTIE_JSON = args.json ? String(args.json) : null;
const FICHIER_METRIQUES = args.metrics ? String(args.metrics) : null;
const TIMEOUT_MS = entierPositif(args.timeout, 15_000, 1000, 120_000);
const MAX_EN_VOL = entierPositif(args["max-en-vol"], 2_000, 1, 20_000);
const MODE = String(args.mode ?? "stress");
const INTERVALLE_JOUEUR_MS = entierPositif(
  args["intervalle-ms"],
  2_500,
  100,
  120_000,
);
const RUN_ID = String(
  args["run-id"]
    ?? process.env.BENCH_RUN_ID
    ?? `local-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}-${process.pid}`,
);

const PALIERS = String(args.paliers ?? "25,50,100")
  .split(",")
  .map((p) => entierPositif(p.trim(), 0, 1, 2000))
  .filter((p) => p > 0);

function listeNombres(value, min, max) {
  if (value === undefined || value === null || value === "") return [];
  return String(value)
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item >= min && item <= max);
}

/**
 * Construit les cibles OPEN-LOOP. Une population sans `--rps` est traduite par
 * sa cadence navigateur : joueurs / intervalle. Si les deux sont fournis, leur
 * cardinalité et leur cohérence sont vérifiées au lieu de choisir silencieusement.
 */
export function construireCiblesCadence({ joueurs, rps, intervalleMs = 2_500 }) {
  const populations = listeNombres(joueurs, 1, 100_000).map(Math.trunc);
  const debits = listeNombres(rps, 0.01, 10_000);

  if (populations.length === 0 && debits.length === 0) {
    throw new Error("Le mode cadence exige --joueurs ou --rps.");
  }
  if (populations.length > 0 && debits.length > 0 && populations.length !== debits.length) {
    throw new Error("--joueurs et --rps doivent porter le même nombre de valeurs.");
  }

  const taille = Math.max(populations.length, debits.length);
  return Array.from({ length: taille }, (_, index) => {
    const population = populations[index] ?? null;
    const derive = population === null ? null : (population * 1_000) / intervalleMs;
    const cible = debits[index] ?? derive;
    if (cible === null || !Number.isFinite(cible) || cible <= 0) {
      throw new Error("Débit cadencé invalide.");
    }
    if (derive !== null && debits[index] !== undefined) {
      const ecartRelatif = Math.abs(debits[index] - derive) / derive;
      if (ecartRelatif > 0.01) {
        throw new Error(
          `--rps ${debits[index]} contredit ${population} joueurs / ${intervalleMs} ms (${derive.toFixed(2)} req/s).`,
        );
      }
    }
    return {
      joueurs: population,
      cibleReqParS: Number(cible.toFixed(3)),
      intervalleMs: population === null ? null : intervalleMs,
    };
  });
}

const CIBLES_CADENCE = MODE === "cadence"
  ? construireCiblesCadence({
      joueurs: args.joueurs,
      rps: args.rps,
      intervalleMs: INTERVALLE_JOUEUR_MS,
    })
  : [];

if (EST_POINT_ENTREE && !BASE_URL) {
  console.error(
    "Usage : node scripts/capacity-bench.mjs --url https://exemple.vercel.app [options]\n" +
      "        [--mode stress --paliers 25,50,100]\n" +
      "        [--mode cadence --joueurs 100,500 --intervalle-ms 2500]\n" +
      "        (ou BENCH_URL=… dans l'environnement)",
  );
  process.exit(2);
}

if (EST_POINT_ENTREE && MODE !== "stress" && MODE !== "cadence") {
  console.error("Refus : --mode doit valoir `stress` ou `cadence`.");
  process.exit(2);
}

if (EST_POINT_ENTREE && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(RUN_ID)) {
  console.error("Refus : --run-id doit contenir 1 à 64 caractères sûrs [A-Za-z0-9._-].");
  process.exit(2);
}

// Un hôte de production ne se vise pas par accident. La liste est volontairement
// grossière : mieux vaut un faux positif qui demande un drapeau explicite qu'un
// banc de 100 connexions lâché sur les clients d'un commerçant.
export function sembleProduction(url) {
  try {
    const host = new URL(String(url)).hostname.toLowerCase();
    return host === "lastchance.app"
      || host === "www.lastchance.app"
      || host === "app.lastchance.app"
      || host === "lastchance-mu.vercel.app"
      || host === "lastchance-micheau.vercel.app";
  } catch {
    return false;
  }
}

const SEMBLE_PRODUCTION = sembleProduction(BASE_URL) || args.production === true;

if (EST_POINT_ENTREE && SEMBLE_PRODUCTION && !PRODUCTION_OK) {
  console.error(
    `\nRefus : « ${BASE_URL} » ressemble à un hôte de PRODUCTION.\n` +
      "Ce banc génère de la charge réelle sur Vercel et Supabase.\n" +
      "Relancez avec --production si c'est bien l'intention.\n",
  );
  process.exit(2);
}

// ─────────────────────────────────────────────────────────────
// Statistiques
// ─────────────────────────────────────────────────────────────

/** Percentile par rang le plus proche, sur un tableau DÉJÀ trié croissant. */
function percentile(triees, p) {
  if (triees.length === 0) return null;
  const rang = Math.ceil((p / 100) * triees.length) - 1;
  return triees[Math.min(Math.max(rang, 0), triees.length - 1)];
}

function resumer(echantillons) {
  if (echantillons.length === 0) return null;
  const triees = [...echantillons].sort((a, b) => a - b);
  const somme = triees.reduce((acc, v) => acc + v, 0);
  return {
    n: triees.length,
    min: Math.round(triees[0]),
    moy: Math.round(somme / triees.length),
    p50: Math.round(percentile(triees, 50)),
    p95: Math.round(percentile(triees, 95)),
    p99: Math.round(percentile(triees, 99)),
    max: Math.round(triees[triees.length - 1]),
  };
}

// ─────────────────────────────────────────────────────────────
// Scénarios
// ─────────────────────────────────────────────────────────────

/**
 * Chaque scénario dit ce qu'il appelle, s'il ÉCRIT, et comment lire sa réponse.
 * `sonde` permet à un scénario d'extraire une mesure propre au corps de la
 * réponse — c'est par là que `/api/health` rend la latence Supabase vue de
 * l'intérieur de la fonction, la seule que l'ancien banc ne pouvait pas voir.
 */
/**
 * Rotation des slugs synthétiques du scénario `beacon` (voir son commentaire).
 * 40 seaux × 60 requêtes/minute = 2400 req/min avant qu'un refus n'apparaisse,
 * soit 40 req/s en continu — au-delà de tout ce que ce banc vise.
 */
const POOL_SLUGS = 40;
let beaconCompteur = 0;

/** UUID v4 — format exigé par le cookie `lc-anonymous-player`. */
function uuidV4() {
  const h = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += "-";
    else if (i === 14) s += "4";
    else if (i === 19) s += h[8 + Math.floor(pseudoAlea() * 4)];
    else s += h[Math.floor(pseudoAlea() * 16)];
  }
  return s;
}

/**
 * Générateur DÉTERMINISTE (xorshift) : deux campagnes successives tirent la
 * même suite d'identités, donc leurs chiffres se comparent. `Math.random()`
 * rendrait chaque run incomparable au précédent sans rien apporter — ces
 * identités ne protègent rien, elles ne font que se distinguer entre elles.
 */
let graine = 0x2f6e2b1;
function pseudoAlea() {
  graine ^= graine << 13;
  graine ^= graine >>> 17;
  graine ^= graine << 5;
  return ((graine >>> 0) % 100000) / 100000;
}

/**
 * Une Server Action peut répondre HTTP 200 tout en rendant un état métier
 * indisponible. Le banc événement ne compte donc un succès que si le flux RSC
 * contient l'état `ok`, la bonne session et, lorsqu'elle est annoncée par le
 * préflight, la phase attendue.
 */
export function validerReponseEvenement({
  status,
  body,
  sessionId,
  phaseAttendue = null,
}) {
  if (!Number.isInteger(status) || status < 200 || status >= 300) {
    return { ok: false, raison: `http_${status}` };
  }
  const texte = String(body ?? "").replaceAll('\\"', '"');
  if (!texte.includes('"state":"ok"')) {
    return { ok: false, raison: "etat_non_ok" };
  }
  if (!sessionId || !texte.includes(`"id":"${sessionId}"`)) {
    return { ok: false, raison: "mauvaise_session" };
  }
  if (phaseAttendue && !texte.includes(`"phase":"${phaseAttendue}"`)) {
    return { ok: false, raison: "mauvaise_phase" };
  }
  return { ok: true, raison: null };
}

const SCENARIOS = {
  health: {
    ecrit: false,
    description: "GET /api/health — latence Supabase vue depuis la fonction",
    // Depuis SEC-3, `checks` (et donc `latency_ms`) n'est rendu qu'à un
    // appelant porteur de `CRON_SECRET` : sans lui, ce scénario tourne mais ne
    // relève AUCUNE mesure Supabase, et la section correspondante du rapport
    // reste vide. Ce n'est pas un échec silencieux — `mesures.db` vide se voit
    // dans le rapport, qui n'imprime alors pas la section.
    requete: () => ({
      url: `${BASE_URL}/api/health`,
      init: {
        cache: "no-store",
        headers: process.env.CRON_SECRET
          ? { authorization: `Bearer ${process.env.CRON_SECRET}` }
          : {},
      },
    }),
    async sonde(res, mesures) {
      try {
        const corps = await res.json();
        const db = corps?.checks?.database?.latency_ms;
        const workers = corps?.checks?.workers?.latency_ms;
        if (typeof db === "number") mesures.db.push(db);
        if (typeof workers === "number") mesures.workers.push(workers);
      } catch {
        // Un corps illisible est déjà compté comme erreur par le statut ; on ne
        // le compte pas deux fois.
      }
    },
  },
  racine: {
    ecrit: false,
    // TÉMOIN, et c'est là tout son intérêt : cette page est servie par le CDN
    // sans toucher ni fonction ni base. Comparée à `health` (dynamique, deux
    // appels Supabase), elle sépare « la plateforme sature » de « le chemin
    // DYNAMIQUE sature ». Sans témoin, un p99 élevé ne s'attribue à rien : on
    // ne sait pas s'il faut regarder Vercel, la base, ou le code applicatif.
    description: "GET / — page statique servie par le CDN (témoin)",
    requete: () => ({ url: `${BASE_URL}/`, init: {} }),
  },
  page: {
    ecrit: false,
    description: "GET /play/<slug> — chemin joueur, cache ISR",
    besoinSlug: true,
    requete: () => ({ url: `${BASE_URL}/play/${SLUG}`, init: {} }),
  },
  beacon: {
    ecrit: true,
    // LE SUBSTITUT LE PLUS PROCHE D'UNE SERVER ACTION qu'on puisse mesurer en
    // production. `spinWheel` ne s'y mesure pas : `verifyTurnstile` est
    // fail-closed et exige un jeton Cloudflare qu'aucun script ne forge — c'est
    // voulu, et c'est bien. Cette route-ci n'a pas de challenge et fait pourtant
    // le même genre de travail que la section de gardes d'un spin : un seau de
    // débit (upsert dans `public.rate_limits`) PUIS une RPC. Deux allers-retours
    // base en écriture, sur un chemin `force-dynamic`.
    //
    // SLUGS SYNTHÉTIQUES, ET C'EST DOUBLEMENT VOLONTAIRE :
    //  · aucune statistique de commerçant n'est touchée — `increment_qr_scan`
    //    ne trouve aucune ligne pour ces slugs et n'incrémente rien ;
    //  · le seau `scanIp` est clé sur (slug, IP) et vaut 60/60 s. Avec un slug
    //    unique, la mesure s'auto-limiterait au bout de 60 requêtes et la suite
    //    ne mesurerait plus que le refus — en croyant mesurer le chemin
    //    complet. Une rotation sur POOL_SLUGS buckets donne 60 × POOL requêtes
    //    par minute avant tout refus.
    // Le pool est PETIT et FIXE : chaque slug crée une ligne de seau, un slug
    // par requête en créerait des milliers.
    description: "POST /api/page-opens — ÉCRIT, 2 allers-retours base (proxy de server action)",
    requete: () => {
      const n = beaconCompteur++ % POOL_SLUGS;
      return {
        url: `${BASE_URL}/api/page-opens?slug=banc-capacite-${n}`,
        init: { method: "POST" },
      };
    },
  },
  event: {
    ecrit: true,
    // LA JAUGE DE « LA TOTALE », ÉPROUVÉE PAR SON VRAI COÛT.
    //
    // L'offre vend 1 000 participants simultanés. Ce que 1 000 joueurs
    // produisent réellement n'est pas 1 000 requêtes : c'est un
    // RAFRAÎCHISSEMENT CONTINU. Quand Realtime est connecté, le repli sonde
    // toutes les 30 s ; s'il tombe, `eventPollDelay` revient à 2 500 ms pendant
    // une question. Le mode cadencé doit donc mesurer les DEUX régimes : charge
    // nominale et pire cas sans Realtime, sans prétendre que l'un remplace la
    // mesure des messages Realtime eux-mêmes.
    //
    // C'est ce chiffre-là qu'il faut confronter à la capacité mesurée, et
    // non le nombre de joueurs. Ce scénario appelle la même server action
    // que le navigateur, avec la même charge utile.
    //
    // SANS COOKIE, délibérément : `getEventState` lit le cookie de session
    // pour personnaliser la réponse (score du joueur). Un spectateur qui
    // n'a pas rejoint fait la même requête sans cookie et déclenche le même
    // travail serveur — c'est le pire cas honnête, et il évite d'avoir à
    // fabriquer 1 000 jetons valides pour mesurer un débit.
    description:
      "POST /event/<code> (Next-Action) — getEventState, le rafraîchissement d'une salle",
    disponible: () =>
      (Boolean(process.env.BENCH_EVENT_ACTION_ID)
        && Boolean(process.env.BENCH_EVENT_SESSION_ID))
      || "BENCH_EVENT_ACTION_ID / BENCH_EVENT_SESSION_ID absentes",
    // La route publique est `/event/[code]` — le CODE DE JONCTION, pas l'UUID
    // de session. Les deux traversent le segment dynamique, mais viser la vraie
    // page garde la mesure représentative de ce que fait un navigateur.
    requete: () => ({
      url: `${BASE_URL}/event/${
        process.env.BENCH_EVENT_CODE ?? process.env.BENCH_EVENT_SESSION_ID
      }`,
      init: {
        method: "POST",
        headers: {
          "Next-Action": process.env.BENCH_EVENT_ACTION_ID ?? "",
          "content-type": "text/plain;charset=UTF-8",
        },
        body: JSON.stringify([
          { sessionId: process.env.BENCH_EVENT_SESSION_ID },
        ]),
      },
    }),
    valider: ({ status, body }) =>
      validerReponseEvenement({
        status,
        body,
        sessionId: process.env.BENCH_EVENT_SESSION_ID,
        phaseAttendue: process.env.BENCH_EVENT_EXPECTED_PHASE ?? null,
      }),
  },
  spin: {
    ecrit: true,
    besoinSlug: true,
    // LE VRAI TOUR DE ROUE — la dernière pièce du P1, et la seule qui ne se
    // mesure PAS en production : `verifyTurnstile` est fail-closed et exige un
    // jeton Cloudflare qu'aucun script ne forge. Ce scénario vise donc un
    // environnement où `TURNSTILE_REQUIRED=false` (voir
    // `scripts/bench-spin-local.sh`), jamais la production — d'où le refus
    // explicite plus bas si les deux se rencontrent.
    //
    // Le protocole est celui des server actions Next : POST sur la page qui
    // porte l'action, en-tête `Next-Action` avec l'identifiant lu dans
    // `.next/server/server-reference-manifest.json`, corps = tableau JSON des
    // arguments (`spinWheel(slug)` n'en prend qu'un).
    //
    // UN COOKIE NEUF PAR REQUÊTE, et c'est le point délicat : les seaux
    // `spinBurst` (1/4 s) et `spin` (8/60 s) sont clés sur l'empreinte JOUEUR.
    // Avec une identité partagée, on mesurerait le refus du deuxième tour au
    // lieu du débit — exactement le piège évité côté `beacon`. Un cookie
    // distinct = un joueur distinct, ce qui est aussi la forme réelle du
    // trafic qu'on cherche à dimensionner : une salle pleine de gens
    // différents, pas une personne qui insiste.
    description:
      "POST /play/<slug> (Next-Action) — spinWheel réel, un joueur neuf par tour",
    disponible: () =>
      Boolean(process.env.BENCH_SPIN_ACTION_ID)
      || "BENCH_SPIN_ACTION_ID absente (identifiant de la server action)",
    requete: () => ({
      url: `${BASE_URL}/play/${SLUG}`,
      init: {
        method: "POST",
        headers: {
          "Next-Action": process.env.BENCH_SPIN_ACTION_ID ?? "",
          "content-type": "text/plain;charset=UTF-8",
          cookie: `lc-anonymous-player=${uuidV4()}`,
        },
        body: JSON.stringify([SLUG]),
      },
    }),
  },
};

function scenariosRetenus() {
  const demandes = args.scenarios
    ? String(args.scenarios).split(",").map((s) => s.trim())
    : Object.keys(SCENARIOS);

  const retenus = [];
  for (const nom of demandes) {
    const scenario = SCENARIOS[nom];
    if (!scenario) {
      console.error(`Scénario inconnu : ${nom}`);
      process.exit(2);
    }
    if (scenario.besoinSlug && !SLUG) {
      console.log(`· ${nom} — ignoré (aucun --slug fourni)`);
      continue;
    }
    // REFUS DUR, et AVANT tout autre contrôle : `spin` émet de vrais tours,
    // consomme du stock et écrit des participations. En production ce serait de
    // la fausse donnée dans les statistiques d'un commerçant, et Turnstile le
    // refuserait de toute façon — autant le dire ici plutôt que de laisser
    // interpréter une rafale de refus comme une mesure de capacité.
    //
    // Cet ordre est délibéré : placé APRÈS le contrôle de disponibilité, ce
    // refus restait muet quand l'identifiant d'action manquait — viser la
    // production rendait alors un « ignoré » rassurant au lieu d'un refus.
    // La garde la plus grave passe la première.
    if ((nom === "spin" || nom === "event") && SEMBLE_PRODUCTION) {
      console.error(
        `\nRefus : le scénario \`${nom}\` ne se joue JAMAIS contre la production.\n`
          + "Il écrit de vraies données (tours, joueurs, participations).\n"
          + "Utilisez un environnement local (scripts/bench-spin-local.sh).\n",
      );
      process.exit(2);
    }
    // Un scénario peut exiger davantage que des drapeaux : `spin` a besoin de
    // l'identifiant de la server action, qui n'existe qu'après un build.
    const dispo = scenario.disponible ? scenario.disponible() : true;
    if (dispo !== true) {
      console.log(`· ${nom} — ignoré (${dispo})`);
      continue;
    }
    if (scenario.ecrit && !ECRIRE) {
      console.log(`· ${nom} — ignoré (écrit en base ; --ecrire pour l'autoriser)`);
      continue;
    }
    retenus.push([nom, scenario]);
  }
  return retenus;
}

// ─────────────────────────────────────────────────────────────
// Moteur de charge
// ─────────────────────────────────────────────────────────────

function incrementer(carte, cle) {
  carte.set(cle, (carte.get(cle) ?? 0) + 1);
}

function creerCollecteur() {
  return {
    latences: [],
    retardsEmission: [],
    statuts: new Map(),
    regions: new Map(),
    cache: new Map(),
    raisonsSemantiques: new Map(),
    erreursReseau: 0,
    erreursSemantiques: 0,
    succes: 0,
    octets: 0,
    abandonnees: 0,
    maxEnVolObserve: 0,
  };
}

async function executerRequete(scenario, mesures, collecte) {
  const { url, init } = scenario.requete();
  const debut = performance.now();
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        ...(init.headers ?? {}),
        "user-agent": `lastchance-capacity-bench/${RUN_ID}`,
        "x-lastchance-bench-run": RUN_ID,
      },
    });
    const classe = `${Math.floor(res.status / 100)}xx`;
    incrementer(collecte.statuts, classe);

    // `x-vercel-id` porte « edge::region::id » : la région d'EXÉCUTION est
    // l'avant-dernier segment. C'est la preuve directe de l'épinglage fra1.
    const vid = res.headers.get("x-vercel-id");
    if (vid) {
      const segments = vid.split("::");
      const region = segments.length >= 2 ? segments.at(-2) : segments[0];
      incrementer(collecte.regions, region);
    }
    const etatCache = res.headers.get("x-vercel-cache");
    if (etatCache) incrementer(collecte.cache, etatCache);

    let semantiqueOk = res.ok;
    if (scenario.sonde) {
      await scenario.sonde(res, mesures);
    } else if (scenario.valider) {
      const corps = await res.text();
      collecte.octets += Buffer.byteLength(corps);
      const verdict = scenario.valider({ status: res.status, body: corps });
      semantiqueOk = verdict.ok;
      if (!verdict.ok) {
        collecte.erreursSemantiques += 1;
        incrementer(collecte.raisonsSemantiques, verdict.raison ?? "inconnue");
      }
    } else {
      const corps = await res.arrayBuffer();
      collecte.octets += corps.byteLength;
    }
    if (res.ok && semantiqueOk) collecte.succes += 1;
    collecte.latences.push(performance.now() - debut);
  } catch {
    collecte.erreursReseau += 1;
    collecte.latences.push(performance.now() - debut);
  }
}

function finaliserPalier(collecte, dureeReelleS, complement) {
  const terminees = collecte.latences.length;
  const total = terminees + collecte.abandonnees;
  return {
    ...complement,
    total,
    terminees,
    dureeS: Number(dureeReelleS.toFixed(1)),
    reqParS: Number((terminees / dureeReelleS).toFixed(1)),
    tauxErreur: total === 0
      ? 1
      : Number((1 - collecte.succes / total).toFixed(4)),
    erreursReseau: collecte.erreursReseau,
    erreursSemantiques: collecte.erreursSemantiques,
    raisonsSemantiques: Object.fromEntries(collecte.raisonsSemantiques),
    abandonnees: collecte.abandonnees,
    maxEnVolObserve: collecte.maxEnVolObserve,
    statuts: Object.fromEntries(collecte.statuts),
    regions: Object.fromEntries(collecte.regions),
    cache: Object.fromEntries(collecte.cache),
    kojets: Math.round(collecte.octets / 1024),
    latence: resumer(collecte.latences),
    retardEmission: resumer(collecte.retardsEmission),
  };
}

/**
 * N ouvriers tirent des requêtes en boucle pendant `dureeMs`. Ce mode fermé
 * cherche le plafond de la pile ; il ne représente PAS une population réelle.
 */
async function jouerPalierStress(scenario, concurrence, dureeMs, mesures) {
  const collecte = creerCollecteur();
  const finAt = performance.now() + dureeMs;

  async function ouvrier() {
    while (performance.now() < finAt) {
      await executerRequete(scenario, mesures, collecte);
    }
  }

  const debutReel = performance.now();
  collecte.maxEnVolObserve = concurrence;
  await Promise.all(Array.from({ length: concurrence }, () => ouvrier()));
  const dureeReelleS = (performance.now() - debutReel) / 1000;
  return finaliserPalier(collecte, dureeReelleS, {
    mode: "stress",
    concurrence,
    joueurs: null,
    cibleReqParS: null,
  });
}

function attendre(ms) {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mode OPEN-LOOP : les émissions suivent une horloge indépendante des réponses.
 * Une pile lente accumule donc des requêtes en vol, puis des abandons explicites
 * à `--max-en-vol`, au lieu de réduire silencieusement le débit généré.
 */
async function jouerPalierCadence(scenario, cible, dureeMs, mesures) {
  const collecte = creerCollecteur();
  const enVol = new Set();
  const debutReel = performance.now();
  const finEmission = debutReel + dureeMs;
  const periodeMs = 1_000 / cible.cibleReqParS;
  let prochaineEmission = debutReel;

  while (prochaineEmission < finEmission) {
    await attendre(prochaineEmission - performance.now());
    collecte.retardsEmission.push(Math.max(0, performance.now() - prochaineEmission));
    if (enVol.size >= MAX_EN_VOL) {
      collecte.abandonnees += 1;
    } else {
      const requete = executerRequete(scenario, mesures, collecte)
        .finally(() => enVol.delete(requete));
      enVol.add(requete);
      collecte.maxEnVolObserve = Math.max(collecte.maxEnVolObserve, enVol.size);
    }
    prochaineEmission += periodeMs;
  }

  await Promise.allSettled(enVol);
  const dureeReelleS = (performance.now() - debutReel) / 1000;
  return finaliserPalier(collecte, dureeReelleS, {
    mode: "cadence",
    concurrence: null,
    joueurs: cible.joueurs,
    cibleReqParS: cible.cibleReqParS,
    intervalleMs: cible.intervalleMs,
  });
}

const METRIQUES_OBLIGATOIRES = ["realtime", "cpu", "ram", "database"];

/**
 * Les mesures HTTP ne voient ni les sockets Realtime ni les ressources des
 * fournisseurs. Un dossier de preuve exige donc un fichier externe corrélé au
 * même run. Ce fichier reste déclaratif : même complet, il ne prononce jamais
 * à lui seul un GO de production.
 */
export function evaluerMetriquesObligatoires(metriques, runId) {
  if (!metriques || typeof metriques !== "object") {
    return {
      verdict: "NON_QUALIFIABLE",
      manquantes: [...METRIQUES_OBLIGATOIRES],
      raison: "fichier_de_metriques_absent_ou_invalide",
      details: {},
    };
  }
  if (metriques.run_id !== runId) {
    return {
      verdict: "NON_QUALIFIABLE",
      manquantes: [...METRIQUES_OBLIGATOIRES],
      raison: "run_id_des_metriques_incompatible",
      details: {},
    };
  }

  const manquantes = METRIQUES_OBLIGATOIRES.filter((nom) => {
    const valeur = metriques[nom];
    return !valeur
      || typeof valeur !== "object"
      || (valeur.status !== "go" && valeur.status !== "no_go")
      || typeof valeur.source !== "string"
      || valeur.source.trim().length === 0;
  });
  const details = Object.fromEntries(
    METRIQUES_OBLIGATOIRES.filter((nom) => metriques[nom])
      .map((nom) => {
        const valeur = metriques[nom];
        return [nom, {
          status: valeur.status ?? null,
          source: typeof valeur.source === "string" ? valeur.source : null,
          observed: typeof valeur.observed === "number" ? valeur.observed : null,
          limit: typeof valeur.limit === "number" ? valeur.limit : null,
          unit: typeof valeur.unit === "string" ? valeur.unit : null,
        }];
      }),
  );
  if (manquantes.length > 0) {
    return {
      verdict: "NON_QUALIFIABLE",
      manquantes,
      raison: "metriques_obligatoires_incompletes",
      details,
    };
  }

  const enEchec = METRIQUES_OBLIGATOIRES.filter(
    (nom) => metriques[nom].status === "no_go",
  );
  return {
    verdict: enEchec.length > 0 ? "NO_GO" : "EVIDENCE_COMPLETE",
    manquantes: [],
    enEchec,
    raison: enEchec.length > 0 ? "metriques_hors_seuil" : null,
    details,
  };
}

async function chargerMetriques() {
  if (!FICHIER_METRIQUES) return null;
  try {
    return JSON.parse(await readFile(FICHIER_METRIQUES, "utf8"));
  } catch (error) {
    console.error(`Métriques illisibles (${FICHIER_METRIQUES}) : ${error.message}`);
    return null;
  }
}

export function qualifierRapport(rapport, metriques, runId = RUN_ID) {
  const qualificationMetriques = evaluerMetriquesObligatoires(metriques, runId);
  const erreursHttp = Object.values(rapport.scenarios)
    .flat()
    .some((palier) => palier.tauxErreur > 0 || palier.abandonnees > 0);

  if (erreursHttp) {
    return {
      verdict: "NO_GO",
      raison: "erreurs_http_reseau_semantiques_ou_emissions_abandonnees",
      metriques: qualificationMetriques,
    };
  }
  const paliersEvent = rapport.scenarios.event ?? [];
  if (paliersEvent.length === 0) {
    return {
      verdict: "NON_QUALIFIABLE",
      raison: "scenario_event_absent",
      metriques: qualificationMetriques,
    };
  }
  const horsSeuil = paliersEvent.some((palier) =>
    palier.mode !== "cadence"
      || typeof palier.cibleReqParS !== "number"
      || palier.reqParS < palier.cibleReqParS * 0.98
      || palier.latence?.p95 > 1_000
      || palier.latence?.p99 > 2_500
      || palier.retardEmission?.p95 > 100
  );
  if (horsSeuil) {
    return {
      verdict: "NO_GO",
      raison: "debit_latence_ou_ponctualite_hors_seuil",
      metriques: qualificationMetriques,
    };
  }
  if (qualificationMetriques.verdict === "NO_GO") {
    return {
      verdict: "NO_GO",
      raison: qualificationMetriques.raison,
      metriques: qualificationMetriques,
    };
  }
  return {
    verdict: "NON_QUALIFIABLE",
    raison: qualificationMetriques.verdict === "EVIDENCE_COMPLETE"
      ? "revue_humaine_soak_multicampagne_requise"
      : qualificationMetriques.raison,
    metriques: qualificationMetriques,
  };
}

// ─────────────────────────────────────────────────────────────
// Restitution
// ─────────────────────────────────────────────────────────────

function ligneTableau(r) {
  const l = r.latence ?? {};
  const regionDominante =
    Object.entries(r.regions).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  const cacheHit = r.cache.HIT ?? 0;
  const cacheTotal = Object.values(r.cache).reduce((a, b) => a + b, 0);
  const partCache = cacheTotal > 0 ? `${Math.round((cacheHit / cacheTotal) * 100)}%` : "—";
  return {
    mode: r.mode ?? "stress",
    charge: r.mode === "cadence"
      ? `${r.joueurs ?? "—"} joueurs`
      : `${r.concurrence} conn`,
    cible: r.cibleReqParS ?? "max",
    "req/s": r.reqParS,
    p50: l.p50 ?? "—",
    p95: l.p95 ?? "—",
    p99: l.p99 ?? "—",
    max: l.max ?? "—",
    err: `${(r.tauxErreur * 100).toFixed(1)}%`,
    abandons: r.abandonnees ?? 0,
    région: regionDominante,
    "cache HIT": partCache,
  };
}

function rendreMarkdown(rapport) {
  const lignes = [
    `# Banc de capacité — ${rapport.cible}`,
    "",
    `Mesuré le ${rapport.date}. Paliers de ${rapport.dureeS} s`
      + `${rapport.warmupS ? `, après ${rapport.warmupS} s de chauffe` : ""}.`,
    "",
  ];

  for (const [nom, paliers] of Object.entries(rapport.scenarios)) {
    lignes.push(`## ${nom} — ${SCENARIOS[nom]?.description ?? ""}`, "");
    lignes.push("| mode | charge | cible req/s | req/s | p50 | p95 | p99 | max | erreurs | abandons | région | cache HIT |");
    lignes.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const r of paliers) {
      const t = ligneTableau(r);
      lignes.push(
        `| ${t.mode} | ${t.charge} | ${t.cible} | ${t["req/s"]} | ${t.p50} | ${t.p95} `
          + `| ${t.p99} | ${t.max} | ${t.err} | ${t.abandons} | ${t.région} `
          + `| ${t["cache HIT"]} |`,
      );
    }
    lignes.push("");
  }

  if (rapport.supabase?.db) {
    const db = rapport.supabase.db;
    lignes.push(
      "## Latence Supabase vue depuis la fonction",
      "",
      "Mesure rendue par `/api/health` — la seule qui traverse le vrai réseau",
      "entre Vercel et Supabase. Un chiffre à trois chiffres signale une base",
      "hors région ; en région on attend quelques dizaines de millisecondes.",
      "",
      `- base : p50 **${db.p50} ms**, p95 ${db.p95} ms, p99 ${db.p99} ms (n=${db.n})`,
    );
    if (rapport.supabase.workers) {
      const w = rapport.supabase.workers;
      lignes.push(`- workers : p50 ${w.p50} ms, p95 ${w.p95} ms (n=${w.n})`);
    }
    lignes.push("");
  }

  lignes.push(
    "## Qualification",
    "",
    `Verdict : **${rapport.qualification?.verdict ?? "NON_QUALIFIABLE"}**.`,
    "",
  );
  const metriques = rapport.qualification?.metriques;
  if (metriques?.manquantes?.length > 0) {
    lignes.push(
      `Métriques obligatoires absentes ou invalides : ${metriques.manquantes.join(", ")}.`,
      "Le banc HTTP ne mesure pas à lui seul Realtime, CPU, RAM ni les connexions DB.",
      "",
    );
  }
  lignes.push("| métrique | statut | observé | limite | unité | source |", "|---|---|---|---|---|---|");
  for (const nom of METRIQUES_OBLIGATOIRES) {
    const detail = metriques?.details?.[nom] ?? {};
    lignes.push(
      `| ${nom} | ${detail.status ?? "absent"} | ${detail.observed ?? "—"} `
        + `| ${detail.limit ?? "—"} | ${detail.unit ?? "—"} | ${detail.source ?? "—"} |`,
    );
  }
  lignes.push("");

  return lignes.join("\n");
}

// ─────────────────────────────────────────────────────────────
// Principal
// ─────────────────────────────────────────────────────────────

async function main() {
  const retenus = scenariosRetenus();
  if (retenus.length === 0) {
    console.error("Aucun scénario à jouer.");
    process.exit(2);
  }

  console.log(`\nCible   : ${BASE_URL}`);
  console.log(`Run     : ${RUN_ID}`);
  console.log(`Scénarios : ${retenus.map(([n]) => n).join(", ")}`);
  if (MODE === "cadence") {
    const cibles = CIBLES_CADENCE.map(
      (cible) => `${cible.joueurs ?? "—"} joueurs / ${cible.cibleReqParS} req/s`,
    );
    console.log(`Mode    : cadence OPEN-LOOP ${cibles.join(" · ")}`);
  } else {
    console.log(
      SOAK_S
        ? `Mode    : stress fermé, endurance ${SOAK_S} s à ${PALIERS[0]} connexions`
        : `Mode    : stress fermé ${PALIERS.join("/")} connexions × ${DUREE_S} s`,
    );
  }
  console.log("");

  const mesures = { db: [], workers: [] };
  const rapport = {
    cible: BASE_URL,
    runId: RUN_ID,
    date: new Date().toISOString(),
    dureeS: SOAK_S ?? DUREE_S,
    warmupS: WARMUP_S,
    execution: SOAK_S ? "soak" : "paliers",
    mode: MODE,
    scenarios: {},
  };

  for (const [nom, scenario] of retenus) {
    console.log(`── ${nom} : ${scenario.description}`);

    if (WARMUP_S > 0) {
      // La chauffe est JETÉE : sans elle, le démarrage à froid d'une fonction
      // serverless (mesuré à ~1,9 s sur ce projet) écrase le p99 d'un palier
      // entier et rend deux campagnes incomparables.
      const mesuresChauffe = { db: [], workers: [] };
      if (MODE === "cadence") {
        await jouerPalierCadence(
          scenario,
          CIBLES_CADENCE[0],
          WARMUP_S * 1000,
          mesuresChauffe,
        );
      } else {
        await jouerPalierStress(
          scenario,
          Math.min(PALIERS[0], 10),
          WARMUP_S * 1000,
          mesuresChauffe,
        );
      }
    }

    const paliers = MODE === "cadence"
      ? (SOAK_S ? [CIBLES_CADENCE[0]] : CIBLES_CADENCE)
      : (SOAK_S ? [PALIERS[0]] : PALIERS);
    const resultats = [];
    for (const palier of paliers) {
      const dureeMs = (SOAK_S ?? DUREE_S) * 1000;
      const r = MODE === "cadence"
        ? await jouerPalierCadence(scenario, palier, dureeMs, mesures)
        : await jouerPalierStress(scenario, palier, dureeMs, mesures);
      resultats.push(r);
      console.table([ligneTableau(r)]);
    }
    rapport.scenarios[nom] = resultats;
  }

  if (mesures.db.length > 0) {
    rapport.supabase = {
      db: resumer(mesures.db),
      workers: mesures.workers.length > 0 ? resumer(mesures.workers) : null,
    };
    const db = rapport.supabase.db;
    console.log(
      `\nLatence Supabase (vue fonction) : p50 ${db.p50} ms · p95 ${db.p95} ms `
        + `· p99 ${db.p99} ms (n=${db.n})`,
    );
    if (db.p50 > 150) {
      console.log(
        "  ⚠ p50 > 150 ms : la base semble HORS RÉGION des fonctions. "
          + "Vérifier `regions` dans vercel.json et la région du projet Supabase.",
      );
    }
  }

  // Les régions observées valent preuve de l'épinglage : une région inattendue
  // rend toutes les latences ci-dessus ininterprétables.
  const regionsVues = new Set();
  for (const paliers of Object.values(rapport.scenarios)) {
    for (const r of paliers) Object.keys(r.regions).forEach((x) => regionsVues.add(x));
  }
  if (regionsVues.size > 0) {
    console.log(`Régions d'exécution observées : ${[...regionsVues].join(", ")}`);
  }

  const metriques = await chargerMetriques();
  rapport.qualification = qualifierRapport(rapport, metriques);
  console.log(`Qualification : ${rapport.qualification.verdict}`);
  if (rapport.qualification.metriques.manquantes.length > 0) {
    console.log(
      "  Métriques obligatoires absentes : "
        + rapport.qualification.metriques.manquantes.join(", "),
    );
    console.log("  Aucun GO possible avec le seul banc HTTP.");
  }

  if (SORTIE_JSON) {
    await writeFile(SORTIE_JSON, JSON.stringify(rapport, null, 2), "utf8");
    console.log(`\nRapport JSON écrit : ${SORTIE_JSON}`);
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${rendreMarkdown(rapport)}\n`);
  }

  if (args.markdown) {
    await writeFile(String(args.markdown), rendreMarkdown(rapport), "utf8");
    console.log(`Rapport Markdown écrit : ${args.markdown}`);
  }

  console.log("");
}

if (EST_POINT_ENTREE) {
  main().catch((err) => {
    console.error("Banc interrompu :", err);
    process.exit(1);
  });
}

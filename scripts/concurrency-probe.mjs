#!/usr/bin/env node

// ============================================================
// Sonde de concurrence — prouver les verrous, au lieu de les simuler
// ============================================================
//
// POURQUOI CE FICHIER EXISTE
//
// Le dépôt compte 105 `for update` et 14 verrous consultatifs dans
// `supabase/migrations`, et AUCUN test ne les exerce. Ce n'est pas un oubli :
// pgTAP en est structurellement INCAPABLE. Une suite pgTAP tourne dans UNE
// transaction (`begin` … `rollback`), donc dans UNE session — elle ne peut pas
// mettre deux sessions en concurrence. `supabase/tests/universal_rewards.test.sql`
// l'écrit noir sur blanc à sa ligne 206 : « Le second appel SIMULE le concurrent
// perdant ». Simuler, ce n'est pas prouver : ce second appel décrit l'idempotence
// d'un RÉ-appel séquentiel, pas ce qui se passe quand deux caisses tapent le même
// code à la même seconde. Or c'est exactement là que le commerçant perd de
// l'argent — deux fois le même lot remis, un stock devenu négatif, un jeton à
// usage unique consommé deux fois.
//
// Cette sonde ouvre donc N sessions psql RÉELLES, les fait converger sur un
// rendez-vous daté à l'horloge du SERVEUR, et vérifie ensuite l'invariant côté
// base. Elle échoue (code de sortie non nul) si l'invariant est violé, ET si le
// harnais n'a rien exercé.
//
// POURQUOI `psql` ET PAS UN CLIENT NODE
//
// Aucun client Postgres n'est installé (`pg`, `postgres`, `@vercel/postgres`,
// `pg-promise` : tous absents de package.json) et en ajouter un pour un harnais
// de test alourdirait la chaîne d'approvisionnement de l'application entière.
// `psql` est déjà présent partout où cette sonde doit tourner — le workflow CI
// s'en sert déjà pour semer la base. Zéro dépendance ajoutée : c'est un choix,
// pas une contrainte subie.
//
// LA GARDE DU HARNAIS, ET POURQUOI ELLE EST OBLIGATOIRE
//
// Un harnais qui sérialise sans le dire rapporterait « invariant tenu » sans
// avoir rien exercé — un vert qui ne prouve rien. Ce projet connaît le piège
// dans les deux sens : un job de mesure a rendu 19 faux rouges, puis 6, avant
// qu'on ne comprenne qu'il mesurait autre chose que ce qu'il croyait mesurer.
// La garde retenue ici est la seule qui discrimine vraiment :
//
//   · chaque appel horodate son DÉBUT et sa FIN (`clock_timestamp()`) ;
//   · un tour n'est COMPTÉ que si l'intervalle du gagnant RECOUVRE celui d'au
//     moins un perdant. Recouvrement = les deux sessions étaient à l'intérieur
//     de la RPC au même instant = la course a bien eu lieu.
//
// « Au moins un appel a renvoyé le verdict perdant » ne suffit PAS comme garde :
// une exécution parfaitement séquentielle produit exactement le même verdict.
// C'est même précisément ce que fait le pgTAP existant. Seul le recouvrement
// distingue une course d'un ré-appel.
//
// La garde est CONSERVATRICE dans le bon sens : si un perdant démarre après que
// le gagnant a rendu la main mais avant qu'il n'ait COMMIT, il bloque bel et
// bien sans que les intervalles se recouvrent. Le tour n'est alors pas compté —
// on perd une preuve, on n'en invente pas.
//
// Un tour non compté reste néanmoins CONTRÔLÉ : une violation d'invariant est
// une violation, qu'on ait su prouver la concurrence ou non. Les deux notions
// sont séparées de bout en bout.
//
// CE QU'IL FAUDRAIT CASSER POUR FAIRE ROUGIR CETTE SONDE
//
//   1. `redeem_by_code` (20260722150000) : retirer `and p.redeemed_at is null`
//      de l'UPDATE conditionnel → les deux caissiers obtiennent `redeemed`, le
//      commerçant remet deux fois le même lot.
//   2. `perform_atomic_spin` (20260731120000) : retirer `and stock > 0` du
//      décrément, ou sortir le décrément de sa boucle de reprise → deux joueurs
//      gagnent le dernier lot, et `prizes_stock_check` finit par lever.
//   3. `consume_referral_spin_grant` (20260809120000) : retirer `for update of r`
//      → deux sessions lisent `grant_consumed_at is null`, un jeton à usage
//      unique rend deux tours de roue.
//   4. `perform_atomic_spin` (20260731120000:143) : retirer
//      `pg_advisory_xact_lock` → N onglets d'un MÊME joueur passent tous la
//      garde de fenêtre de jeu et se percutent sur l'index unique, en `23505`
//      au lieu d'un « vous avez déjà joué ».
//      Les deux familles nommées du trou sont ainsi couvertes : `for update`
//      (scénarios 1 et 3) ET verrou consultatif (scénario 4).
//   5. Le harnais lui-même : `SANS_RENDEZ_VOUS=1` supprime le rendez-vous et
//      sérialise les sessions → 0 paire recouvrante → la sonde DOIT échouer en
//      disant qu'elle n'a rien exercé, au lieu de rendre un vert mensonger.
//      C'est le seul contrôle négatif jouable sans toucher aux migrations : il
//      prouve la garde, pas le produit. Les trois premiers se jouent en
//      remplaçant la fonction dans une base JETABLE (voir le workflow CI).
//
// USAGE
//   PGURL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
//   TOURS=12 CONCURRENTS=4 node scripts/concurrency-probe.mjs
// ============================================================

import { spawn } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const PGURL =
  process.env.PGURL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Répéter est non négociable : une course qui ne se produit pas au premier
// essai ne prouve rien, et un verrou retiré peut très bien laisser passer un
// tour sur trois selon l'ordonnancement. Douze tours par scénario.
const TOURS = entierPositif(process.env.TOURS, 12, 1, 200);

// Le récit produit parle de DEUX caissiers ; quatre sessions en est un
// sur-ensemble strict, et rend le recouvrement plus probable sans changer
// l'invariant (exactement un gagnant, quel que soit N).
const CONCURRENTS = entierPositif(process.env.CONCURRENTS, 4, 2, 8);

// Délai entre le dernier arrivant au rendez-vous et le départ commun. Il n'a
// pas besoin d'être long : il doit seulement couvrir le temps qu'un traînard
// mette à voir la barrière franchie (sondage à 2 ms).
const DEPART_MS = entierPositif(process.env.DEPART_MS, 150, 20, 5000);

// Un tour où la moitié des sessions se sont sérialisées reste un tour ; un
// SCÉNARIO où plus de la moitié des tours n'ont rien exercé n'est pas une
// preuve, c'est une illusion. On préfère échouer bruyamment.
const PART_MINIMALE_COMPTEE = 0.5;

// CONTRÔLE NÉGATIF DU HARNAIS — à n'utiliser que pour prouver que la garde
// peut rougir. Supprime le rendez-vous ET lance les sessions en série : les
// invariants tiendront (une exécution séquentielle est trivialement correcte),
// mais AUCUN recouvrement ne sera mesuré et la sonde DOIT échouer sur
// « preuve insuffisante ». Si elle rendait vert dans ce mode, sa garde serait
// décorative — et c'est très exactement le défaut qui a produit 19 puis 6 faux
// rouges sur le harnais de mesure de ce projet.
const SANS_RENDEZ_VOUS = process.env.SANS_RENDEZ_VOUS === "1";

const ORG = "cc000000-0000-4000-8000-000000000001";

class ErreurHarnais extends Error {}

function entierPositif(brut, defaut, mini, maxi) {
  const valeur = Number.parseInt(brut ?? "", 10);
  if (!Number.isFinite(valeur)) return defaut;
  return Math.min(Math.max(valeur, mini), maxi);
}

function lit(valeur) {
  if (valeur === null || valeur === undefined) return "null";
  if (typeof valeur === "number") return String(valeur);
  return `'${String(valeur).replace(/'/g, "''")}'`;
}

// UUID déterministes : `cc` + chiffre de scénario + chiffre d'entité + le
// numéro de tour. Déterministe et non aléatoire pour qu'un run interrompu
// laisse des résidus que le run suivant écrase, au lieu d'en accumuler.
function uid(scenario, entite, tour) {
  return `cc${scenario}${entite}0000-0000-4000-8000-${tour
    .toString(16)
    .padStart(12, "0")}`;
}

// Le segment « a0 » sépare les caissiers de l'organisation : sans lui, le
// caissier 1 recevrait l'UUID de l'organisation elle-même. Rien ne casserait
// (tables distinctes), mais tout journal d'échec deviendrait illisible.
function acteur(worker) {
  return `cc000000-0000-4000-8000-00000000a0${worker
    .toString(16)
    .padStart(2, "0")}`;
}

// Clés de device : 64 hexadécimaux, contrainte du schéma. Le remplissage en
// « c » les rend impossibles à confondre avec les fixtures existantes — deux
// assertions pgTAP de ce projet sont déjà tombées sur une collision fortuite
// avec `repeat('9', 64)` du seed.
function cleDevice(marqueur, tour, worker) {
  return `cc${marqueur}${tour.toString(16).padStart(6, "0")}${worker
    .toString(16)
    .padStart(2, "0")}`.padEnd(64, "c");
}

function jetonGrant(tour) {
  return `ccf${tour.toString(16).padStart(6, "0")}`.padEnd(48, "d");
}

const ALPHABET_PARRAIN = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function codeParrain(tour) {
  let reste = tour;
  let suffixe = "";
  for (let index = 0; index < 6; index += 1) {
    suffixe = ALPHABET_PARRAIN[reste % 32] + suffixe;
    reste = Math.floor(reste / 32);
  }
  return `PR-ZZ${suffixe}`;
}

function codeRetrait(tour) {
  return `GAIN-SONDECC${tour.toString().padStart(4, "0")}`;
}

// ── Exécution psql ───────────────────────────────────────────

/**
 * Commande `psql`, surchargeable. En CI, `psql` est dans le PATH — le workflow
 * s'en sert déjà pour semer. Sur une machine de développement, il ne l'est
 * souvent PAS : Postgres n'y vit que dans le conteneur Supabase.
 *
 * Sans cette surcharge, la sonde ne serait exécutable qu'en CI — c'est-à-dire
 * jamais avant d'y pousser, et jamais pendant qu'on écrit le verrou qu'elle
 * garde. Un harnais qu'on ne peut pas lancer là où l'on travaille est un
 * harnais qu'on ne lance pas.
 *
 *   PSQL_CMD="docker exec -i supabase_db_lastchance psql" \
 *     node scripts/concurrency-probe.mjs
 *
 * Note : passé par `docker exec`, l'URL de connexion est celle vue DEPUIS le
 * conteneur (`PGURL=postgresql://postgres:postgres@127.0.0.1:5432/postgres`).
 */
const PSQL_CMD = (process.env.PSQL_CMD ?? "psql").trim().split(/\s+/);

function lancerPsql(sql) {
  return new Promise((resolve) => {
    const enfant = spawn(
      PSQL_CMD[0],
      [
        ...PSQL_CMD.slice(1),
        PGURL,
        "-X",
        "-q",
        "-v",
        "ON_ERROR_STOP=1",
        "-t",
        "-A",
        "-f",
        "-",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let sortie = "";
    let erreur = "";
    let termine = false;
    const finir = (code) => {
      if (termine) return;
      termine = true;
      resolve({ code, sortie, erreur });
    };
    enfant.stdout.on("data", (bloc) => {
      sortie += bloc;
    });
    enfant.stderr.on("data", (bloc) => {
      erreur += bloc;
    });
    enfant.on("error", (cause) => {
      erreur += `psql injoignable : ${cause.message}`;
      finir(127);
    });
    enfant.on("close", (code) => finir(code ?? 1));
    enfant.stdin.end(sql);
  });
}

async function psql(sql, etiquette) {
  const resultat = await lancerPsql(sql);
  if (resultat.code !== 0) {
    throw new ErreurHarnais(
      `${etiquette} : psql a rendu ${resultat.code}\n${resultat.erreur.trim()}`,
    );
  }
  return resultat.sortie;
}

async function psqlJson(sql, etiquette) {
  const brut = (await psql(sql, etiquette)).trim();
  if (brut.length === 0) {
    throw new ErreurHarnais(`${etiquette} : la requête de contrôle n'a rien rendu`);
  }
  try {
    return JSON.parse(brut);
  } catch {
    throw new ErreurHarnais(
      `${etiquette} : JSON illisible — ${brut.slice(0, 300)}`,
    );
  }
}

// ── Le harnais : rendez-vous puis mesure ─────────────────────

// Le rendez-vous est daté sur l'HORLOGE DU SERVEUR, pas sur celle de Node :
// c'est la seule horloge que toutes les sessions partagent. Chaque session
// s'annonce, attend que toutes soient annoncées, lit la date du dernier
// arrivant, puis dort jusqu'à cette date + DEPART_MS. Elles repartent donc
// ensemble à la microseconde près, quel que soit le coût de démarrage de psql —
// qui, lui, varie de plusieurs dizaines de millisecondes d'un processus à
// l'autre et suffirait à sérialiser toute la sonde.
function sqlSession({ scenario, tour, worker, attendus, corps }) {
  const attendusEffectifs = SANS_RENDEZ_VOUS ? 1 : attendus;
  const delai = SANS_RENDEZ_VOUS ? 0 : DEPART_MS;
  return `
set statement_timeout = '120s';
-- Le perdant DOIT pouvoir attendre le verrou : un lock_timeout le ferait
-- échouer sur une erreur, et la sonde conclurait à un défaut inexistant.
set lock_timeout = 0;
set idle_in_transaction_session_timeout = 0;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);

insert into concurrency_probe.barrier (scenario, round, worker)
values (${lit(scenario)}, ${tour}, ${worker});

do $barriere$
declare
  v_go timestamptz;
  v_arrives integer;
  v_limite timestamptz := clock_timestamp() + interval '90 seconds';
begin
  loop
    select count(*),
           case when count(*) >= ${attendusEffectifs} then max(b.arrived_at) end
      into v_arrives, v_go
      from concurrency_probe.barrier b
     where b.scenario = ${lit(scenario)} and b.round = ${tour};
    exit when v_go is not null;
    if clock_timestamp() > v_limite then
      raise exception 'rendez-vous non atteint : % arrivants sur %',
        v_arrives, ${attendusEffectifs};
    end if;
    perform pg_catalog.pg_sleep(0.002);
  end loop;
  perform pg_catalog.pg_sleep_until(v_go + interval '${delai} milliseconds');
end
$barriere$;

do $mesure$
declare
  v_r record;
  v_json jsonb;
  v_t0 timestamptz;
  v_t1 timestamptz;
  v_verdict text;
  v_detail jsonb := '{}'::jsonb;
begin
  v_t0 := clock_timestamp();
  begin
${corps}
  exception when others then
    -- Une exception levée par un appel concurrent EST une trouvaille (violation
    -- de contrainte, interblocage…) : on la journalise au lieu de la laisser
    -- tuer la session, pour que le tour reste analysable dans son ensemble.
    v_verdict := 'exception';
    v_detail := pg_catalog.jsonb_build_object(
      'sqlstate', sqlstate, 'message', sqlerrm);
  end;
  v_t1 := clock_timestamp();
  -- Journalisé DANS la transaction de l'appel : le verrou du gagnant reste donc
  -- tenu jusqu'au commit, ce qui est exactement la fenêtre pendant laquelle le
  -- perdant doit attendre.
  insert into concurrency_probe.result
    (scenario, round, worker, verdict, detail, started_at, ended_at)
  values (${lit(scenario)}, ${tour}, ${worker}, coalesce(v_verdict, 'indetermine'),
          v_detail, v_t0, v_t1);
end
$mesure$;
`;
}

function sqlControleCommun(scenario, tour, verdictGagnant) {
  const paires = (extra) => `
    select count(*)
      from concurrency_probe.result a
      join concurrency_probe.result b
        on b.scenario = a.scenario and b.round = a.round and b.worker > a.worker
     where a.scenario = ${lit(scenario)} and a.round = ${tour}
       and a.started_at < b.ended_at and b.started_at < a.ended_at${extra}`;
  return `
  'resultats', (
    select coalesce(json_agg(json_build_object(
        'worker', r.worker,
        'verdict', r.verdict,
        'detail', r.detail,
        'ms', round(extract(epoch from (r.ended_at - r.started_at)) * 1000)
      ) order by r.worker), '[]'::json)
      from concurrency_probe.result r
     where r.scenario = ${lit(scenario)} and r.round = ${tour}),
  'paires_recouvrantes', (${paires("")}),
  'paires_avec_gagnant', (${paires(
    `
       and ${lit(verdictGagnant)} in (a.verdict, b.verdict)`,
  )})`;
}

// ── Mise en place et démontage ───────────────────────────────

function sqlInstallation() {
  const utilisateurs = Array.from({ length: CONCURRENTS }, (_, index) => {
    const worker = index + 1;
    return `(${lit(acteur(worker))}, 'authenticated', 'authenticated', ${lit(
      `caissier-${worker}@concurrency.probe`,
    )}, '', now(), now())`;
  }).join(",\n  ");
  const membres = Array.from({ length: CONCURRENTS }, (_, index) => {
    return `(${lit(ORG)}, ${lit(acteur(index + 1))}, 'cashier')`;
  }).join(",\n  ");

  return `
set client_min_messages = warning;

-- Le schéma du harnais est recréé à neuf : des horodatages d'un run précédent
-- rendraient tous les tours « recouvrants » sans qu'aucune course n'ait lieu.
drop schema if exists concurrency_probe cascade;
create schema concurrency_probe;

create unlogged table concurrency_probe.barrier (
  scenario text not null,
  round integer not null,
  worker integer not null,
  arrived_at timestamptz not null default clock_timestamp(),
  primary key (scenario, round, worker)
);

create unlogged table concurrency_probe.result (
  scenario text not null,
  round integer not null,
  worker integer not null,
  verdict text not null,
  detail jsonb not null default '{}'::jsonb,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  primary key (scenario, round, worker)
);

-- Résidus d'un run interrompu : un code déjà remis ferait rendre
-- « already_redeemed » aux QUATRE sessions, donc zéro gagnant, donc un faux
-- rouge attribué au produit. On repart d'une organisation vierge.
delete from public.organizations where id = ${lit(ORG)};
delete from auth.users where id in (
  ${Array.from({ length: CONCURRENTS }, (_, i) => lit(acteur(i + 1))).join(", ")}
);

insert into auth.users
  (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ${utilisateurs};

insert into public.organizations (id, name, slug)
values (${lit(ORG)}, 'Sonde de concurrence', 'concurrency-probe');

-- Rôle « cashier » : le plus faible que la caisse accepte. Prouver l'exclusion
-- mutuelle avec un « owner » laisserait ouverte la question du profil réellement
-- utilisé en boutique.
insert into public.organization_members (organization_id, user_id, role)
values
  ${membres};
`;
}

function sqlDemontage() {
  return `
set client_min_messages = warning;
delete from public.organizations where id = ${lit(ORG)};
delete from auth.users where id in (
  ${Array.from({ length: CONCURRENTS }, (_, i) => lit(acteur(i + 1))).join(", ")}
);
-- Le schéma « concurrency_probe » survit VOLONTAIREMENT : il ne contient aucune
-- donnée produit, et c'est la seule trace exploitable après un échec. Il est
-- rasé au démarrage du run suivant.
`;
}

// ============================================================
// Scénario 1 — deux caisses, un seul code
// ============================================================
//
// CE QUE CELA COÛTE SI L'INVARIANT TOMBE : le commerçant remet deux fois le
// même lot. C'est la perte la plus directe du produit, et le chemin le plus
// exposé (un code circule sur un écran de téléphone, deux postes de caisse
// peuvent le saisir à la même seconde).
//
// POUR LE FAIRE ROUGIR : retirer `and p.redeemed_at is null` de l'UPDATE de
// `redeem_by_code` (20260722150000_prize_lifecycle.sql:113).

const scenarioCaisse = {
  nom: "redeem",
  titre: "redeem_reward_by_code — deux caisses, un seul code",
  verdictGagnant: "redeemed",
  verdictPerdant: "already_redeemed",

  contexte(tour) {
    return {
      campagne: uid(1, 1, tour),
      roue: uid(1, 2, tour),
      lot: uid(1, 3, tour),
      participation: uid(1, 4, tour),
      code: codeRetrait(tour),
      panier: (worker) => 1000 + worker * 111,
    };
  },

  fixture(tour) {
    const c = this.contexte(tour);
    return `
set client_min_messages = warning;
insert into public.campaigns (id, organization_id, name, status)
values (${lit(c.campagne)}, ${lit(ORG)}, ${lit(`Sonde caisse ${tour}`)}, 'active');

insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values (${lit(c.roue)}, ${lit(ORG)}, ${lit(c.campagne)}, 'Roue sonde caisse', 'unlimited');

insert into public.prizes
  (id, organization_id, wheel_id, label, description, weight, stock, position)
values
  (${lit(c.lot)}, ${lit(ORG)}, ${lit(c.roue)}, 'Café offert', 'Sur place', 100, 10, 0);

insert into public.participations
  (id, organization_id, campaign_id, wheel_id, prize_id,
   first_name, email, accepted_terms, redeem_code, player_key)
values
  (${lit(c.participation)}, ${lit(ORG)}, ${lit(c.campagne)}, ${lit(c.roue)},
   ${lit(c.lot)}, 'Sonde', ${lit(`sonde-caisse-${tour}@concurrency.probe`)},
   true, ${lit(c.code)}, ${lit(cleDevice("a", tour, 0))});

do $armement$
begin
  -- ARMEMENT : sans ligne de registre non remise, la RPC rendrait zéro ligne
  -- aux quatre sessions et la sonde conclurait « aucun gagnant » — un faux
  -- rouge imputé au produit alors que c'est la fixture qui manque.
  if not exists (
    select 1 from public.reward_issuances ri
     where ri.organization_id = ${lit(ORG)}
       and ri.code = ${lit(c.code)}
       and ri.redeemed_at is null
       and ri.cancelled_at is null
  ) then
    raise exception 'armement rompu : le registre ne porte pas % comme lot remisable',
      ${lit(c.code)};
  end if;
end
$armement$;
`;
  },

  session(tour, worker) {
    const c = this.contexte(tour);
    return sqlSession({
      scenario: this.nom,
      tour,
      worker,
      attendus: CONCURRENTS,
      corps: `
    select * into v_r
      from public.redeem_reward_by_code(
        ${lit(ORG)}, ${lit(c.code)}, ${lit(acteur(worker))}, ${c.panier(worker)})
     limit 1;
    if not found then
      v_verdict := 'aucune_ligne';
    else
      v_verdict := v_r.state;
      v_detail := pg_catalog.jsonb_build_object(
        'redeemed_now', v_r.redeemed_now,
        'basket_cents', v_r.basket_cents,
        'redeemed_by', v_r.redeemed_by);
    end if;`,
    });
  },

  controle(tour) {
    const c = this.contexte(tour);
    return `
select json_build_object(
${sqlControleCommun(this.nom, tour, this.verdictGagnant)},
  'participations_remises', (
    select count(*) from public.participations p
     where p.id = ${lit(c.participation)} and p.redeemed_at is not null),
  'registre', (
    select json_build_object(
        'remis', ri.redeemed_at is not null,
        'redeemed_by', ri.redeemed_by,
        'basket_cents', ri.basket_cents)
      from public.reward_issuances ri
     where ri.organization_id = ${lit(ORG)} and ri.code = ${lit(c.code)}),
  'audits_registre', (
    select count(*) from public.audit_logs al
     where al.organization_id = ${lit(ORG)}
       and al.action = 'reward.redeem'
       and al.metadata->>'reward_issuance_id' = (
         select ri.id::text from public.reward_issuances ri
          where ri.organization_id = ${lit(ORG)} and ri.code = ${lit(c.code)})),
  'audits_participation', (
    select count(*) from public.audit_logs al
     where al.organization_id = ${lit(ORG)}
       and al.action = 'participation.redeem'
       and al.metadata->>'participation_id' = ${lit(c.participation)})
);
`;
  },

  invariants(tour, donnees) {
    const c = this.contexte(tour);
    const violations = [];
    const gagnants = donnees.resultats.filter((r) => r.verdict === "redeemed");
    const autres = donnees.resultats.filter((r) => r.verdict !== "redeemed");

    if (gagnants.length !== 1) {
      violations.push({
        regle:
          "un code ne peut être remis qu'UNE fois — sinon le commerçant donne deux fois le lot",
        attendu: "exactement 1 session en `redeemed`",
        observe: `${gagnants.length} — ${resume(donnees.resultats)}`,
      });
    }
    const inattendus = autres.filter((r) => r.verdict !== this.verdictPerdant);
    if (inattendus.length > 0) {
      violations.push({
        regle: "les perdants doivent être refusés explicitement, pas en erreur",
        attendu: `tous en \`${this.verdictPerdant}\``,
        observe: resume(inattendus),
      });
    }
    if (donnees.participations_remises !== 1) {
      violations.push({
        regle: "la table legacy reste la source de vérité de l'état remis",
        attendu: "participations.redeemed_at posé (1)",
        observe: String(donnees.participations_remises),
      });
    }
    if (!donnees.registre || donnees.registre.remis !== true) {
      violations.push({
        regle: "le registre universel doit refléter la remise",
        attendu: "reward_issuances.redeemed_at non nul",
        observe: JSON.stringify(donnees.registre),
      });
    }
    if (gagnants.length === 1 && donnees.registre) {
      const attenduActeur = acteur(gagnants[0].worker);
      const attenduPanier = c.panier(gagnants[0].worker);
      // Le perdant ne doit RIEN écrire : s'il écrasait l'acteur ou le panier, le
      // ticket serait attribué à la mauvaise caisse et le chiffre d'affaires
      // attribué au mauvais montant. C'est la forme silencieuse du défaut.
      if (donnees.registre.redeemed_by !== attenduActeur) {
        violations.push({
          regle: "la remise est attribuée à la caisse qui l'a réellement faite",
          attendu: attenduActeur,
          observe: String(donnees.registre.redeemed_by),
        });
      }
      if (donnees.registre.basket_cents !== attenduPanier) {
        violations.push({
          regle: "le panier enregistré est celui du gagnant, pas du perdant",
          attendu: String(attenduPanier),
          observe: String(donnees.registre.basket_cents),
        });
      }
    }
    if (donnees.audits_registre !== 1) {
      violations.push({
        regle: "une remise = une trace d'audit, jamais deux",
        attendu: "1 audit `reward.redeem`",
        observe: String(donnees.audits_registre),
      });
    }
    if (donnees.audits_participation !== 1) {
      violations.push({
        regle: "une remise = une trace d'audit legacy, jamais deux",
        attendu: "1 audit `participation.redeem`",
        observe: String(donnees.audits_participation),
      });
    }
    return violations;
  },
};

// ============================================================
// Scénario 2 — N joueurs, un seul lot en stock
// ============================================================
//
// CE QUE CELA COÛTE SI L'INVARIANT TOMBE : le commerçant promet un lot qu'il
// n'a plus. Le stock est la seule borne économique de la roue publique.
//
// POUR LE FAIRE ROUGIR : retirer `and stock > 0` du décrément de
// `perform_atomic_spin` (20260731120000_quick_games_skill.sql:206), ou sortir ce
// décrément de sa boucle de reprise.
//
// Le verrou consultatif de cette RPC porte sur (roue, player_key) : avec des
// joueurs DISTINCTS il ne sérialise rien, et c'est voulu — la contention qu'on
// veut exercer est celle du décrément de stock, pas celle de l'anti-rejeu.

const scenarioRoue = {
  nom: "spin",
  titre: "perform_atomic_spin — N joueurs, un seul lot en stock",
  verdictGagnant: "gagne",

  contexte(tour) {
    return {
      campagne: uid(2, 1, tour),
      roue: uid(2, 2, tour),
      lotGagnant: uid(2, 3, tour),
      lotPerdant: uid(2, 4, tour),
    };
  },

  fixture(tour) {
    const c = this.contexte(tour);
    return `
set client_min_messages = warning;
insert into public.campaigns (id, organization_id, name, status)
values (${lit(c.campagne)}, ${lit(ORG)}, ${lit(`Sonde roue ${tour}`)}, 'active');

-- 'unlimited' : la fenêtre de jeu n'a rien à voir avec ce qu'on mesure, et une
-- limite quotidienne masquerait la contention derrière un « limit_reached ».
insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values (${lit(c.roue)}, ${lit(ORG)}, ${lit(c.campagne)}, 'Roue sonde stock', 'unlimited');

-- Poids 1000 contre 1 : le tirage pondéré désigne le lot à stock fini dans
-- 99,9 % des cas, donc la contention a réellement lieu. Le perdant existe pour
-- que les sessions battues obtiennent un tour PERDANT plutôt qu'un « no_prize »,
-- ce qui distinguerait mal « stock épuisé » de « roue vide ».
insert into public.prizes
  (id, organization_id, wheel_id, label, weight, is_losing, stock, position)
values
  (${lit(c.lotGagnant)}, ${lit(ORG)}, ${lit(c.roue)}, 'Dernier lot en stock',
   1000, false, 1, 0),
  (${lit(c.lotPerdant)}, ${lit(ORG)}, ${lit(c.roue)}, 'Perdu', 1, true, null, 1);

do $armement$
declare
  v_stock integer;
begin
  select p.stock into v_stock from public.prizes p where p.id = ${lit(c.lotGagnant)};
  if v_stock is distinct from 1 then
    raise exception 'armement rompu : stock initial = % au lieu de 1', v_stock;
  end if;
end
$armement$;
`;
  },

  session(tour, worker) {
    const c = this.contexte(tour);
    return sqlSession({
      scenario: this.nom,
      tour,
      worker,
      attendus: CONCURRENTS,
      corps: `
    select * into v_r
      from public.perform_atomic_spin(
        ${lit(ORG)}, ${lit(c.campagne)}, ${lit(c.roue)},
        ${lit(cleDevice("b", tour, worker))}, null::text, 'direct', false)
     limit 1;
    if not found then
      v_verdict := 'aucune_ligne';
    else
      if v_r.denial_reason is not null then
        v_verdict := 'refus:' || v_r.denial_reason;
      elsif v_r.prize_id = ${lit(c.lotGagnant)}::uuid then
        v_verdict := 'gagne';
      elsif v_r.is_losing then
        v_verdict := 'perdu';
      else
        v_verdict := 'autre_lot';
      end if;
      v_detail := pg_catalog.jsonb_build_object(
        'spin_id', v_r.spin_id, 'prize_id', v_r.prize_id, 'is_losing', v_r.is_losing);
    end if;`,
    });
  },

  controle(tour) {
    const c = this.contexte(tour);
    return `
select json_build_object(
${sqlControleCommun(this.nom, tour, this.verdictGagnant)},
  'stock_final', (
    select p.stock from public.prizes p where p.id = ${lit(c.lotGagnant)}),
  'spins_gagnants', (
    select count(*) from public.spins s
     where s.wheel_id = ${lit(c.roue)} and s.prize_id = ${lit(c.lotGagnant)}),
  'spins_total', (
    select count(*) from public.spins s where s.wheel_id = ${lit(c.roue)})
);
`;
  },

  invariants(tour, donnees) {
    const violations = [];
    const gagnants = donnees.resultats.filter((r) => r.verdict === "gagne");
    const exceptions = donnees.resultats.filter((r) => r.verdict === "exception");

    // Volontairement `<= 1` et non `= 1` : si toutes les sessions tiraient le
    // lot perdant (probabilité ~1e-12 avec ces poids), exiger un gagnant
    // produirait un rouge que le produit n'a pas mérité. Le couple
    // « au plus un gagnant » + « stock = 1 - gagnants » est exact et ne peut
    // pas faussement rougir. La couverture réelle est vérifiée au niveau du
    // scénario : au moins un tour DOIT avoir décrémenté le stock.
    if (gagnants.length > 1) {
      violations.push({
        regle:
          "un lot à stock 1 ne peut être gagné qu'une fois — sinon le commerçant doit un lot qu'il n'a plus",
        attendu: "au plus 1 session en `gagne`",
        observe: `${gagnants.length} — ${resume(donnees.resultats)}`,
      });
    }
    if (exceptions.length > 0) {
      violations.push({
        regle: "aucun tirage concurrent ne doit lever d'exception",
        attendu: "0 exception",
        observe: resume(exceptions),
      });
    }
    if (typeof donnees.stock_final !== "number" || donnees.stock_final < 0) {
      violations.push({
        regle: "le stock ne devient JAMAIS négatif",
        attendu: ">= 0",
        observe: String(donnees.stock_final),
      });
    } else if (donnees.stock_final !== 1 - gagnants.length) {
      violations.push({
        regle: "le stock décrémenté correspond exactement au nombre de gagnants",
        attendu: String(1 - gagnants.length),
        observe: String(donnees.stock_final),
      });
    }
    if (donnees.spins_gagnants !== gagnants.length) {
      violations.push({
        regle: "un lot gagné = un spin gagnant en base",
        attendu: String(gagnants.length),
        observe: String(donnees.spins_gagnants),
      });
    }
    if (donnees.spins_total !== CONCURRENTS) {
      violations.push({
        regle: "chaque joueur repart avec un tour joué, gagnant ou perdant",
        attendu: String(CONCURRENTS),
        observe: String(donnees.spins_total),
      });
    }
    return violations;
  },

  // Couverture du scénario : si AUCUN tour n'a décrémenté le stock, le
  // décrément n'a jamais été exercé et le vert ne prouve rien.
  couverture(tours) {
    const gagnants = tours.reduce(
      (total, tour) =>
        total + tour.donnees.resultats.filter((r) => r.verdict === "gagne").length,
      0,
    );
    return gagnants > 0
      ? null
      : "aucun tour n'a attribué le lot : le décrément de stock n'a jamais été exercé";
  },
};

// ============================================================
// Scénario 3 — un jeton à usage unique, consommé en parallèle
// ============================================================
//
// CE QUE CELA COÛTE SI L'INVARIANT TOMBE : un tour offert de parrainage rendu
// deux fois pour un seul jeton. C'est la faille d'abus la plus rentable du
// produit : le tour offert n'a AUCUNE des bornes de la roue publique (pas de
// play_limit, pas de Turnstile, pas de fenêtre de campagne côté joueur).
//
// POUR LE FAIRE ROUGIR : retirer `for update of r` du SELECT de
// `consume_referral_spin_grant` (20260809120000_referral_spin_grant_fixes.sql:109).
// C'est le seul point de sérialisation de cette RPC.

const scenarioParrainage = {
  nom: "referral",
  titre: "consume_referral_spin_grant — un jeton, deux consommations",
  verdictGagnant: "spun",
  verdictPerdant: "already_consumed",
  stockInitial: 5,

  contexte(tour) {
    return {
      campagne: uid(3, 1, tour),
      roue: uid(3, 2, tour),
      lotGagnant: uid(3, 3, tour),
      lotPerdant: uid(3, 4, tour),
      programme: uid(3, 5, tour),
      parrain: uid(3, 6, tour),
      versement: uid(3, 7, tour),
      cleParrain: cleDevice("e", tour, 0),
      jeton: jetonGrant(tour),
    };
  },

  fixture(tour) {
    const c = this.contexte(tour);
    return `
set client_min_messages = warning;
insert into public.campaigns (id, organization_id, name, status)
values (${lit(c.campagne)}, ${lit(ORG)}, ${lit(`Sonde parrainage ${tour}`)}, 'active');

-- Aucun créneau horaire : la roue est ouverte à tout instant, sinon la RPC
-- rendrait 'unavailable' selon l'heure de passage de la CI — un rouge
-- intermittent sans rapport avec la concurrence.
insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values (${lit(c.roue)}, ${lit(ORG)}, ${lit(c.campagne)}, 'Roue sonde parrainage', 'unlimited');

-- BORNE 2 (20260725200000) : un tour offert ne tire jamais un lot à stock
-- illimité. Le seul gagnant a donc un stock FINI, et le perdant un poids nul :
-- le tirage est déterministe, ce qui rend l'assertion sur le stock exacte.
insert into public.prizes
  (id, organization_id, wheel_id, label, weight, is_losing, stock, position)
values
  (${lit(c.lotGagnant)}, ${lit(ORG)}, ${lit(c.roue)}, 'Lot à stock fini',
   100, false, ${this.stockInitial}, 0),
  (${lit(c.lotPerdant)}, ${lit(ORG)}, ${lit(c.roue)}, 'Perdu (poids 0)',
   0, true, null, 1);

insert into public.referral_programs (id, campaign_id, organization_id, enabled)
values (${lit(c.programme)}, ${lit(c.campagne)}, ${lit(ORG)}, true);

insert into public.referral_sponsors
  (id, campaign_id, organization_id, sponsor_key, referral_code)
values
  (${lit(c.parrain)}, ${lit(c.campagne)}, ${lit(ORG)},
   ${lit(c.cleParrain)}, ${lit(codeParrain(tour))});

insert into public.referral_rewards
  (id, campaign_id, organization_id, sponsor_id, beneficiary, kind, spin_grant_token)
values
  (${lit(c.versement)}, ${lit(c.campagne)}, ${lit(ORG)}, ${lit(c.parrain)},
   'sponsor', 'spin', ${lit(c.jeton)});

do $armement$
begin
  -- ARMEMENT : un jeton déjà consommé rendrait 'already_consumed' aux quatre
  -- sessions — zéro gagnant, faux rouge imputé au produit.
  if not exists (
    select 1 from public.referral_rewards rr
     where rr.id = ${lit(c.versement)}
       and rr.grant_consumed_at is null
       and rr.spin_grant_token = ${lit(c.jeton)}
  ) then
    raise exception 'armement rompu : le jeton % n''est pas consommable', ${lit(c.jeton)};
  end if;
end
$armement$;
`;
  },

  session(tour, worker) {
    const c = this.contexte(tour);
    return sqlSession({
      scenario: this.nom,
      tour,
      worker,
      attendus: CONCURRENTS,
      corps: `
    v_json := public.consume_referral_spin_grant(
      ${lit(c.campagne)}, ${lit(c.cleParrain)}, ${lit(c.jeton)});
    v_verdict := coalesce(v_json->>'state', 'aucun_etat');
    v_detail := v_json;`,
    });
  },

  controle(tour) {
    const c = this.contexte(tour);
    return `
select json_build_object(
${sqlControleCommun(this.nom, tour, this.verdictGagnant)},
  'versement', (
    select json_build_object(
        'consomme', rr.grant_consumed_at is not null,
        'resulting_spin_id', rr.resulting_spin_id)
      from public.referral_rewards rr where rr.id = ${lit(c.versement)}),
  'spins_parrainage', (
    select count(*) from public.spins s
     where s.wheel_id = ${lit(c.roue)}
       and s.source = 'referral'
       and s.player_key = ${lit(c.cleParrain)}),
  'stock_final', (
    select p.stock from public.prizes p where p.id = ${lit(c.lotGagnant)})
);
`;
  },

  invariants(tour, donnees) {
    const violations = [];
    const gagnants = donnees.resultats.filter((r) => r.verdict === "spun");
    const autres = donnees.resultats.filter((r) => r.verdict !== "spun");

    if (gagnants.length !== 1) {
      violations.push({
        regle:
          "un jeton à usage unique ne rend qu'UN tour — sinon N identités fabriquées = N tours offerts",
        attendu: "exactement 1 session en `spun`",
        observe: `${gagnants.length} — ${resume(donnees.resultats)}`,
      });
    }
    const inattendus = autres.filter((r) => r.verdict !== this.verdictPerdant);
    if (inattendus.length > 0) {
      violations.push({
        regle: "les sessions battues sont refusées explicitement, pas en erreur",
        attendu: `tous en \`${this.verdictPerdant}\``,
        observe: resume(inattendus),
      });
    }
    if (!donnees.versement || donnees.versement.consomme !== true) {
      violations.push({
        regle: "le jeton doit être marqué consommé",
        attendu: "grant_consumed_at non nul",
        observe: JSON.stringify(donnees.versement),
      });
    }
    if (gagnants.length === 1 && donnees.versement) {
      const spinAttendu = gagnants[0].detail?.spin_id ?? null;
      if (donnees.versement.resulting_spin_id !== spinAttendu) {
        violations.push({
          regle: "le tour journalisé est celui de la session gagnante",
          attendu: String(spinAttendu),
          observe: String(donnees.versement.resulting_spin_id),
        });
      }
    }
    if (donnees.spins_parrainage !== 1) {
      violations.push({
        regle: "un jeton consommé = un seul tour de roue en base",
        attendu: "1",
        observe: String(donnees.spins_parrainage),
      });
    }
    if (donnees.stock_final !== this.stockInitial - gagnants.length) {
      violations.push({
        regle: "le stock ne paie qu'un seul lot pour un seul jeton",
        attendu: String(this.stockInitial - gagnants.length),
        observe: String(donnees.stock_final),
      });
    }
    return violations;
  },
};

// ============================================================
// Scénario 4 — un joueur, un seul tour, N onglets ouverts
// ============================================================
//
// POURQUOI CE QUATRIÈME SCÉNARIO EXISTE : le scénario 2 emploie des joueurs
// DISTINCTS et n'exerce donc AUCUN des 14 verrous consultatifs du dépôt — le
// verrou de `perform_atomic_spin` porte sur (roue, player_key). Le trou nommé
// couvre deux familles, `for update` ET `pg_advisory` ; sans ce scénario la
// seconde resterait entièrement non testée.
//
// CE QU'IL PROUVE EXACTEMENT — et il faut être précis, sous peine de vendre
// plus que ce qu'il tient. La double partie est déjà interdite au niveau du
// STOCKAGE par `spins_one_per_window_idx` (00019 : index unique partiel sur
// (wheel_id, player_key, play_window_key)). Le verrou consultatif ne rend donc
// pas l'unicité possible : il la rend PROPRE. Deux choses distinctes sont
// vérifiées ici :
//   · l'index tient sous course réelle — un index n'est qu'une promesse tant
//     qu'on ne l'a pas mis en concurrence ;
//   · les sessions battues reçoivent la réponse PRODUIT (`limit_reached`), pas
//     une erreur. C'est ce que le verrou achète, et c'est ce que le joueur voit :
//     « vous avez déjà joué » au lieu d'un écran d'erreur.
//
// CE QUE CELA COÛTE SI L'INVARIANT TOMBE : la limite de jeu (« une fois », « une
// fois par jour ») cesse d'être annoncée proprement, et sans l'index elle
// deviendrait contournable en ouvrant N onglets.
//
// La roue ne porte QU'UN lot perdant : le stock ne peut donc rien borner ici, et
// la seule chose sous test est bien la garde de fenêtre de jeu. Un lot à stock
// fini ferait passer un défaut de verrou pour une simple rupture de stock.
//
// POUR LE FAIRE ROUGIR : retirer `pg_advisory_xact_lock(...)` de
// `perform_atomic_spin` (20260731120000_quick_games_skill.sql:143). Les N
// sessions évaluent alors `exists (select 1 from spins …)` au même instant,
// aucune ne voit les autres, toutes tentent d'insérer — l'index unique en
// retient une et les autres remontent un `23505`. L'invariant « aucune session
// ne lève d'exception » tombe, et « les battues sont refusées sur
// limit_reached » aussi.

const scenarioTourUnique = {
  nom: "spin_once",
  titre: "perform_atomic_spin — un joueur, N onglets, un seul tour dû",
  verdictGagnant: "joue",

  contexte(tour) {
    return {
      campagne: uid(4, 1, tour),
      roue: uid(4, 2, tour),
      lot: uid(4, 3, tour),
      cleJoueur: cleDevice("d", tour, 0),
    };
  },

  fixture(tour) {
    const c = this.contexte(tour);
    return `
set client_min_messages = warning;
insert into public.campaigns (id, organization_id, name, status)
values (${lit(c.campagne)}, ${lit(ORG)}, ${lit(`Sonde tour unique ${tour}`)}, 'active');

insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values (${lit(c.roue)}, ${lit(ORG)}, ${lit(c.campagne)}, 'Roue sonde tour unique', 'once');

insert into public.prizes
  (id, organization_id, wheel_id, label, weight, is_losing, stock, position)
values
  (${lit(c.lot)}, ${lit(ORG)}, ${lit(c.roue)}, 'Perdu', 1, true, null, 0);

do $armement$
declare
  v_limite text;
  v_joues integer;
begin
  select w.play_limit into v_limite from public.wheels w where w.id = ${lit(c.roue)};
  select count(*) into v_joues from public.spins s
   where s.wheel_id = ${lit(c.roue)} and s.player_key = ${lit(c.cleJoueur)};
  -- ARMEMENT : une roue restée en 'weekly' ou un tour déjà joué rendraient
  -- l'invariant trivialement vrai (tout le monde refusé), donc vert sans rien
  -- prouver. C'est exactement la forme du test qui ne teste rien.
  if v_limite is distinct from 'once' or v_joues <> 0 then
    raise exception 'armement rompu : play_limit=% et % tour(s) déjà joué(s)',
      v_limite, v_joues;
  end if;
end
$armement$;
`;
  },

  session(tour, worker) {
    const c = this.contexte(tour);
    return sqlSession({
      scenario: this.nom,
      tour,
      worker,
      attendus: CONCURRENTS,
      corps: `
    select * into v_r
      from public.perform_atomic_spin(
        ${lit(ORG)}, ${lit(c.campagne)}, ${lit(c.roue)},
        ${lit(c.cleJoueur)}, null::text, 'direct', false)
     limit 1;
    if not found then
      v_verdict := 'aucune_ligne';
    else
      if v_r.denial_reason is not null then
        v_verdict := 'refus:' || v_r.denial_reason;
      else
        v_verdict := 'joue';
      end if;
      v_detail := pg_catalog.jsonb_build_object(
        'spin_id', v_r.spin_id, 'denial_reason', v_r.denial_reason);
    end if;`,
    });
  },

  controle(tour) {
    const c = this.contexte(tour);
    return `
select json_build_object(
${sqlControleCommun(this.nom, tour, this.verdictGagnant)},
  'tours_joues', (
    select count(*) from public.spins s
     where s.wheel_id = ${lit(c.roue)} and s.player_key = ${lit(c.cleJoueur)})
);
`;
  },

  invariants(tour, donnees) {
    const violations = [];
    const joues = donnees.resultats.filter((r) => r.verdict === "joue");
    const refuses = donnees.resultats.filter(
      (r) => r.verdict === "refus:limit_reached",
    );
    const exceptions = donnees.resultats.filter((r) => r.verdict === "exception");

    if (joues.length !== 1) {
      violations.push({
        regle:
          "une roue « une fois » ne rend qu'UN tour — sinon la limite de jeu se contourne en ouvrant N onglets",
        attendu: "exactement 1 session en `joue`",
        observe: `${joues.length} — ${resume(donnees.resultats)}`,
      });
    }
    if (refuses.length !== donnees.resultats.length - joues.length) {
      violations.push({
        regle: "les sessions battues sont refusées sur `limit_reached`",
        attendu: `${donnees.resultats.length - joues.length} refus`,
        observe: resume(donnees.resultats.filter((r) => r.verdict !== "joue")),
      });
    }
    if (exceptions.length > 0) {
      violations.push({
        regle: "aucune session ne doit lever d'exception",
        attendu: "0 exception",
        observe: resume(exceptions),
      });
    }
    if (donnees.tours_joues !== 1) {
      violations.push({
        regle: "un seul tour est écrit en base pour ce joueur",
        attendu: "1",
        observe: String(donnees.tours_joues),
      });
    }
    return violations;
  },
};

const SCENARIOS = [
  scenarioCaisse,
  scenarioRoue,
  scenarioParrainage,
  scenarioTourUnique,
];

function resume(resultats) {
  return resultats
    .map((r) => `w${r.worker}=${r.verdict}(${r.ms} ms)`)
    .join(", ");
}

// ── Boucle principale ────────────────────────────────────────

async function jouerScenario(scenario) {
  const tours = [];
  const violations = [];
  const nonArmes = [];

  for (let tour = 1; tour <= TOURS; tour += 1) {
    const etiquette = `${scenario.nom} tour ${tour}`;
    try {
      await psql(scenario.fixture(tour), `${etiquette} (armement)`);
    } catch (cause) {
      // Un armement raté n'est PAS une violation d'invariant : le distinguer
      // évite d'accuser le produit d'un défaut de fixture.
      nonArmes.push(`tour ${tour} : ${cause.message.split("\n")[0]}`);
      continue;
    }

    // Le parallélisme est RÉEL : les N processus sont lancés sans attendre le
    // précédent, et c'est la barrière côté serveur qui les synchronise.
    // En mode contrôle négatif, et SEULEMENT là, on les sérialise pour vérifier
    // que la garde de recouvrement sait le détecter.
    let rendus;
    if (SANS_RENDEZ_VOUS) {
      rendus = [];
      for (let index = 0; index < CONCURRENTS; index += 1) {
        rendus.push(await lancerPsql(scenario.session(tour, index + 1)));
      }
    } else {
      rendus = await Promise.all(
        Array.from({ length: CONCURRENTS }, (_, index) =>
          lancerPsql(scenario.session(tour, index + 1)),
        ),
      );
    }
    const echouees = rendus
      .map((r, index) => ({ worker: index + 1, ...r }))
      .filter((r) => r.code !== 0);
    if (echouees.length > 0) {
      nonArmes.push(
        `tour ${tour} : ${echouees.length} session(s) psql en échec — ` +
          echouees
            .map((r) => `w${r.worker}: ${r.erreur.trim().split("\n").pop()}`)
            .join(" | "),
      );
      continue;
    }

    let donnees;
    try {
      donnees = await psqlJson(scenario.controle(tour), `${etiquette} (contrôle)`);
    } catch (cause) {
      // Un contrôle illisible ne dit RIEN de l'invariant : on le compte comme
      // tour perdu plutôt que d'interrompre la campagne et de perdre les tours
      // déjà mesurés.
      nonArmes.push(`tour ${tour} : ${cause.message.split("\n")[0]}`);
      continue;
    }
    tours.push({ tour, donnees });

    for (const violation of scenario.invariants(tour, donnees)) {
      violations.push({ tour, ...violation });
    }
  }

  const comptes = tours.filter((t) => Number(t.donnees.paires_avec_gagnant) > 0);
  const insuffisances = [];
  if (tours.length === 0) {
    insuffisances.push("aucun tour n'a pu être joué — la sonde n'établit RIEN");
  } else if (comptes.length === 0) {
    insuffisances.push(
      "aucun tour n'a montré de recouvrement avec le gagnant : les sessions se " +
        "sont sérialisées, la concurrence n'a jamais été exercée",
    );
  } else if (comptes.length < Math.ceil(TOURS * PART_MINIMALE_COMPTEE)) {
    insuffisances.push(
      `seuls ${comptes.length} tours sur ${TOURS} ont réellement mis les sessions ` +
        "en concurrence — le vert reposerait surtout sur des exécutions sérialisées",
    );
  }
  if (typeof scenario.couverture === "function" && tours.length > 0) {
    const manque = scenario.couverture(tours);
    if (manque) insuffisances.push(manque);
  }

  return { scenario, tours, comptes, violations, nonArmes, insuffisances };
}

function rendreTexte(rapports) {
  const lignes = [];
  for (const rapport of rapports) {
    lignes.push("");
    lignes.push(`── ${rapport.scenario.titre}`);
    lignes.push(
      `   tours joués ${rapport.tours.length}/${TOURS} · ` +
        `tours avec course prouvée ${rapport.comptes.length} · ` +
        `sessions ${CONCURRENTS}`,
    );
    for (const { tour, donnees } of rapport.tours) {
      lignes.push(
        `   tour ${String(tour).padStart(2)} · ` +
          `recouvrements ${donnees.paires_recouvrantes} (dont gagnant ${donnees.paires_avec_gagnant}) · ` +
          resume(donnees.resultats),
      );
    }
    for (const message of rapport.nonArmes) {
      lignes.push(`   NON COMPTÉ · ${message}`);
    }
    for (const violation of rapport.violations) {
      lignes.push(
        `   VIOLATION tour ${violation.tour} · ${violation.regle}` +
          `\n      attendu : ${violation.attendu}` +
          `\n      observé : ${violation.observe}`,
      );
    }
    for (const message of rapport.insuffisances) {
      lignes.push(`   PREUVE INSUFFISANTE · ${message}`);
    }
  }
  return lignes.join("\n");
}

function rendreMarkdown(rapports) {
  const lignes = ["## Sonde de concurrence", ""];
  lignes.push(
    `\`${CONCURRENTS}\` sessions psql simultanées, \`${TOURS}\` tours par scénario.`,
    "",
    "| scénario | tours joués | course prouvée | violations | preuve |",
    "|---|---|---|---|---|",
  );
  for (const rapport of rapports) {
    const preuve = rapport.insuffisances.length === 0 ? "suffisante" : "INSUFFISANTE";
    lignes.push(
      `| \`${rapport.scenario.nom}\` | ${rapport.tours.length}/${TOURS} | ` +
        `${rapport.comptes.length} | ${rapport.violations.length} | ${preuve} |`,
    );
  }
  lignes.push("");
  for (const rapport of rapports) {
    if (rapport.violations.length === 0 && rapport.insuffisances.length === 0) continue;
    lignes.push(`### ${rapport.scenario.titre}`, "");
    for (const violation of rapport.violations) {
      lignes.push(
        `- **tour ${violation.tour} — ${violation.regle}**  `,
        `  attendu : \`${violation.attendu}\` · observé : \`${violation.observe}\``,
      );
    }
    for (const message of rapport.insuffisances) {
      lignes.push(`- **preuve insuffisante** — ${message}`);
    }
    lignes.push("");
  }
  lignes.push(
    "",
    "> Un tour n'est compté que si l'intervalle du gagnant recouvre celui d'un",
    "> perdant : sans recouvrement, les sessions se sont sérialisées et le tour",
    "> ne prouve rien — c'est très exactement ce que le pgTAP existant ne peut",
    "> pas distinguer.",
  );
  return lignes.join("\n");
}

async function main() {
  process.stdout.write(
    `Sonde de concurrence — ${CONCURRENTS} sessions, ${TOURS} tours par scénario\n`,
  );
  if (SANS_RENDEZ_VOUS) {
    process.stdout.write(
      "MODE CONTRÔLE NÉGATIF : rendez-vous désactivé, sessions sérialisées. " +
        "La sonde DOIT échouer sur « preuve insuffisante ».\n",
    );
  }

  const rapports = [];
  try {
    // Sous le try : une installation à moitié faite laisserait sinon une
    // organisation de sonde derrière elle, sans démontage.
    await psql(sqlInstallation(), "installation");
    for (const scenario of SCENARIOS) {
      rapports.push(await jouerScenario(scenario));
    }
  } finally {
    // Le démontage doit avoir lieu même après une violation : laisser une
    // organisation de sonde dans la base fausserait les suites voisines.
    try {
      await psql(sqlDemontage(), "démontage");
    } catch (cause) {
      process.stderr.write(`Démontage incomplet : ${cause.message}\n`);
    }
  }

  process.stdout.write(`${rendreTexte(rapports)}\n`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${rendreMarkdown(rapports)}\n`);
  }

  const violations = rapports.reduce((total, r) => total + r.violations.length, 0);
  const insuffisances = rapports.reduce((total, r) => total + r.insuffisances.length, 0);

  if (violations > 0) {
    process.stdout.write(
      `\nÉCHEC · ${violations} violation(s) d'invariant sous concurrence réelle.\n`,
    );
    process.exitCode = 1;
    return;
  }
  if (insuffisances > 0) {
    process.stdout.write(
      "\nÉCHEC · aucun invariant violé, mais la sonde n'a pas prouvé qu'elle " +
        "avait exercé la concurrence. Un vert dans ces conditions serait un " +
        "vert qui ne teste rien.\n",
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    "\nOK · les trois invariants tiennent sous concurrence RÉELLE et PROUVÉE " +
      "(recouvrement mesuré à chaque tour compté).\n",
  );
}

// Point d'entrée gardé (même convention que scripts/verify-production-health.mjs) :
// le module reste importable sans ouvrir la moindre connexion, ce qui permet de
// relire le SQL généré — la seule façon de vérifier ce harnais sans base.
export const SCENARIOS_EXPORTES = SCENARIOS;
export { sqlInstallation, sqlDemontage };

const estCli =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (estCli) {
  main().catch((cause) => {
    process.stderr.write(
      `${cause instanceof ErreurHarnais ? "Harnais" : "Erreur"} : ${cause.message}\n`,
    );
    process.exitCode = 1;
  });
}

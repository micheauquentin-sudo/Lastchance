// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CONTRAT ENTRE LES DEUX REPRÉSENTATIONS DU SCHÉMA
 * ================================================
 *
 * Le projet en porte deux, et une seule est vérifiée :
 *  · `database.generated.ts` — produit par `npm run types:generate` depuis la
 *    base, dérive contrôlée en CI (job database-security) ;
 *  · `database.ts` — écrit à la main, une cinquantaine d'interfaces, vérifié
 *    par personne jusqu'à ce fichier.
 *
 * La seconde a déjà menti, et le mensonge a coûté : l'interface `Wheel`
 * omettait `skill_config`, si bien que `duplicateCampaign` recopiait
 * `game_type` sans lui. Le commerçant obtenait une roue de défi qui
 * s'annonce skill-gated et que le joueur ne peut pas jouer — et le
 * compilateur ne pouvait rien signaler, puisque la colonne n'existait pas
 * dans le type. Une colonne absente d'un type n'est pas une omission
 * neutre : c'est une zone où `tsc` cesse de travailler pour nous.
 *
 * Ce fichier relie mécaniquement les deux. Il ne remplace pas la relecture,
 * il supprime le silence.
 *
 *
 * POURQUOI UNE ANALYSE DE TEXTE PLUTÔT QU'UN TÉMOIN TYPÉ
 * ------------------------------------------------------
 * Les deux voies étaient ouvertes : (a) lire les deux fichiers et comparer
 * les noms de champs, (b) un témoin typé du genre
 * `Exclude<keyof Row<"wheels">, keyof Wheel>` contraint à `never`, qui
 * échouerait dès `npm run typecheck` — soit une étape de CI plus tôt.
 *
 * (b) a été écartée, et le motif n'est pas le confort :
 *
 *  1. **Sa précocité est conditionnelle.** Le témoin typé ne surveille que
 *     les tables que quelqu'un a pensé à câbler, une par une, à la main.
 *     Rien ne vérifie cette liste — c'est exactement la classe de silence
 *     qu'on cherche à fermer. Une garde qui se déclenche tard sur tout vaut
 *     mieux qu'une garde qui se déclenche tôt sur ce dont on s'est souvenu.
 *     TypeScript ne sait pas énumérer les interfaces d'un module (elles sont
 *     effacées à l'exécution ; `import * as` ne donne que les valeurs), donc
 *     (b) est structurellement incapable de prouver sa propre couverture.
 *     (a) le peut : voir « toute interface est classée » plus bas.
 *
 *  2. **Le message EST le produit.** Ce fichier n'a qu'un lecteur : celui
 *     qui vient d'ajouter une colonne et ne le sait pas encore. (b) lui dit
 *     `Type '"spin_id"' does not satisfy the constraint 'never'` en pointant
 *     un alias de type ; (a) lui dit quelle table, quelle interface, quelle
 *     colonne, et les deux issues admissibles.
 *
 *  3. **(b) ne peut pas exiger de motif.** L'énoncé demande qu'une colonne
 *     absente soit « explicitement listée comme OMISE VOLONTAIREMENT, avec
 *     son motif ». Un motif est une donnée : en (a) il est vérifié non vide ;
 *     en (b) il ne serait qu'un commentaire, c'est-à-dire rien.
 *
 *  4. **(b) ne peut pas détecter une exemption périmée.** Une liste
 *     d'exemptions qu'on n'élague jamais devient une muselière permanente :
 *     la colonne finit par être ajoutée à l'interface, l'exemption survit,
 *     et le jour où quelqu'un retire la colonne du type, plus rien ne parle.
 *     Ici toute exemption devenue inutile fait rougir la suite.
 *
 * Le prix payé : ~40 s de plus qu'un `tsc`, et une dépendance à la mise en
 * forme des deux fichiers. Ce second point est traité de front — l'analyseur
 * REFUSE de tourner s'il ne reconnaît pas ce qu'il lit (voir `analyser*`) :
 * un test qui ne comprend plus son entrée doit crier, pas verdir.
 *
 *
 * CE QUE CE FICHIER NE PROUVE PAS
 * -------------------------------
 * Il compare des NOMS de colonnes, jamais des types. `theme: WheelTheme`
 * contre `theme: Json` est un rétrécissement délibéré et légitime ; en
 * revanche une nullabilité qui divergerait (`string` ici, `string | null`
 * en base) passerait inaperçue. Ne pas sur-interpréter le vert.
 *
 * Il ne dit rien non plus des ~57 tables sans interface manuscrite : elles
 * sont consommées via `database.generated.ts` et n'ont donc pas de second
 * visage susceptible de mentir.
 */

const RACINE = process.cwd();
const CHEMIN_GENERE = join(RACINE, "src", "types", "database.generated.ts");
const CHEMIN_MANUSCRIT = join(RACINE, "src", "types", "database.ts");

/**
 * Correspondance interface manuscrite → table `public`. Écrite à la main
 * parce qu'aucune convention ne la déduit : `EmailLogEntry` vit dans
 * `email_log`, pas dans `email_log_entries`. Le test « toute interface est
 * classée » garantit qu'aucune interface n'échappe à cette table NI à
 * `HORS_TABLE`.
 */
const TABLE_PAR_INTERFACE = {
  Organization: "organizations",
  OrganizationMember: "organization_members",
  TeamInvitation: "team_invitations",
  Campaign: "campaigns",
  Wheel: "wheels",
  Prize: "prizes",
  QrCode: "qr_codes",
  Participation: "participations",
  Contest: "contests",
  ContestAward: "contest_awards",
  ContestMatch: "contest_matches",
  ContestPlayer: "contest_players",
  ContestPrediction: "contest_predictions",
  ContestLeague: "contest_leagues",
  ContestLeagueMember: "contest_league_members",
  Hunt: "hunts",
  HuntStep: "hunt_steps",
  HuntPlayer: "hunt_players",
  HuntScan: "hunt_scans",
  HuntCompletion: "hunt_completions",
  LoyaltyProgram: "loyalty_programs",
  LoyaltyMilestone: "loyalty_milestones",
  LoyaltyMember: "loyalty_members",
  LoyaltyStamp: "loyalty_stamps",
  LoyaltyReward: "loyalty_rewards",
  JackpotCampaign: "jackpot_campaigns",
  JackpotPlayer: "jackpot_players",
  JackpotParticipant: "jackpot_participants",
  JackpotWin: "jackpot_wins",
  EventGame: "event_games",
  EventQuestion: "event_questions",
  EventQuestionOption: "event_question_options",
  EventSession: "event_sessions",
  EventPlayer: "event_players",
  EventAnswer: "event_answers",
  EventWin: "event_wins",
  Calendar: "calendars",
  CalendarDay: "calendar_days",
  CalendarPlayer: "calendar_players",
  CalendarOpening: "calendar_openings",
  CalendarReward: "calendar_rewards",
  AutomationSetting: "automation_settings",
  EmailLogEntry: "email_log",
  NewsletterSubscriber: "newsletter_subscribers",
  NewsletterCampaign: "newsletter_campaigns",
} as const;

/**
 * Interfaces manuscrites qui ne décrivent AUCUNE table : formes internes à
 * une colonne `jsonb`, ou lignes rendues par une RPC. Leur place ici est une
 * affirmation, pas une échappatoire — y ranger le miroir d'une vraie table
 * reviendrait à désarmer la garde, et se verrait en relecture.
 */
const HORS_TABLE: Record<string, string> = {
  EngagementActionConfig:
    "Forme d'une entrée de la colonne jsonb campaigns.engagement.",
  WheelTheme: "Forme de la colonne jsonb wheels.theme.",
  QrStyle: "Forme de la colonne jsonb qr_codes.style.",
  CustomerProfile: "Ligne agrégée rendue par la RPC org_customer_profiles.",
  TeamMemberRow:
    "Ligne rendue par la RPC org_team_members (l'email vit dans auth.users).",
};

type Omission = { colonne: string; motif: string };

/**
 * Colonnes présentes en base et volontairement absentes d'une interface.
 *
 * Deux natures cohabitent ici, et la distinction est écrite dans chaque
 * motif parce qu'elle commande la suite :
 *  · « HORS MODÈLE » — la colonne n'appartient pas à l'objet métier
 *    manipulé par l'application (curseur de worker, garde d'ordonnancement,
 *    compteur d'invalidation). Aucune raison de l'ajouter.
 *  · « DETTE » — l'application LIT ou ÉCRIT réellement la colonne, mais en
 *    la redéclarant dans un type local ad hoc parce que l'interface ne la
 *    porte pas. C'est la situation exacte qui a produit le défaut
 *    `Wheel.skill_config`. Ces lignes sont à résorber, pas à conserver ;
 *    elles sont ici pour être VUES, l'inventaire n'étant pas dans le
 *    périmètre du présent fichier.
 */
const OMISSIONS: Record<string, readonly Omission[]> = {
  organizations: [
    {
      colonne: "last_reengage_run_at",
      motif:
        "HORS MODÈLE — curseur de rotation du cron de relance, écrit et " +
        "ordonné par src/lib/reengagement.ts et la route cron via le client " +
        "typé par database.generated.ts. Aucun écran commerçant ne le lit.",
    },
    {
      colonne: "stripe_event_created_at",
      motif:
        "HORS MODÈLE — garde d'ordonnancement des webhooks Stripe, comparée " +
        "DANS la RPC (20260805170000, seule définition vivante) pour ignorer " +
        "un événement arrivé en retard. Une seule lecture applicative, et " +
        "elle ne peut PAS passer par l'interface : la colonne n'est pas dans " +
        "le grant de colonnes accordé à `authenticated` sur organizations " +
        "(00017), donc absente de l'objet rendu par getUserAndOrg. " +
        "src/app/dashboard/settings/page.tsx la lit par le client " +
        "service_role déjà ouvert pour webhook_secret et la passe à " +
        "billingActions(). L'ajouter à `Organization` ferait mentir le type " +
        "sur tous les autres chemins de lecture.",
    },
  ],
  contest_players: [
    {
      colonne: "tiebreaker_guess",
      motif:
        "DETTE — src/actions/pronostics.ts l'ÉCRIT (deux points d'appel). " +
        "Une écriture qu'aucun type ne décrit n'est vérifiée par personne.",
    },
  ],
  event_sessions: [
    {
      colonne: "max_participants",
      motif:
        "DETTE — sélectionnée et lue par src/lib/event-context.ts, qui la " +
        "redéclare dans un type local.",
    },
    {
      colonne: "state_revision",
      motif: "DETTE — lue par src/lib/event.ts pour le versionnage d'état.",
    },
    {
      colonne: "participant_revision",
      motif:
        "HORS MODÈLE — compteur d'invalidation maintenu côté base " +
        "(20260805190000) ; zéro occurrence applicative.",
    },
  ],
  event_players: [
    {
      colonne: "moderation_state",
      motif:
        "DETTE — src/lib/event-context.ts la sélectionne puis la redéclare " +
        "dans un type local, y compris son union de valeurs.",
    },
    {
      colonne: "moderation_reason",
      motif: "DETTE — sélectionnée et redéclarée par src/lib/event-context.ts.",
    },
    {
      colonne: "moderation_original_pseudo",
      motif:
        "DETTE — sélectionnée par src/lib/event-context.ts, qui s'en sert " +
        "pour restituer le pseudo d'origine au membre de l'org.",
    },
    {
      colonne: "moderated_at",
      motif:
        "HORS MODÈLE — traçabilité de l'acte de modération, aucune lecture " +
        "applicative.",
    },
    {
      colonne: "moderated_by",
      motif:
        "HORS MODÈLE — traçabilité de l'acte de modération, aucune lecture " +
        "applicative.",
    },
  ],
  newsletter_subscribers: [
    {
      colonne: "birthday_month",
      motif:
        "DETTE, ET LA PLUS TROMPEUSE DU LOT — la migration 20260805190000 a " +
        "minimisé l'anniversaire : le millésime n'est plus conservé, " +
        "birth_date est désormais TOUJOURS neutralisée par trigger et la " +
        "donnée vit dans birthday_month/birthday_day. L'interface " +
        "NewsletterSubscriber porte encore birth_date, documentée « " +
        "Anniversaire (YYYY-MM-DD) » : elle décrit un régime abrogé et " +
        "ignore les deux colonnes qui portent la donnée réelle.",
    },
    {
      colonne: "birthday_day",
      motif: "DETTE — même minimisation que birthday_month, même mensonge.",
    },
  ],
  participations: [
    {
      colonne: "spin_id",
      motif:
        "DETTE — src/actions/play.ts redéclare `spin_id: string | null` dans " +
        "un type local parce que Participation ne le porte pas ; c'est ce " +
        "champ qui porte la chaîne de ressources du claim. Motif identique " +
        "à celui du défaut Wheel.skill_config.",
    },
  ],
};

/**
 * Champs manuscrits qui ne correspondent à aucune colonne. Vide aujourd'hui,
 * et c'est le bon état : ces interfaces sont des miroirs de tables. Un champ
 * calculé n'a rien à y faire — il appartient à un type de vue. La constante
 * existe pour que l'ajout d'une exception soit un geste explicite et relu.
 */
const CHAMPS_HORS_COLONNE: Record<string, readonly Omission[]> = {};

// ── Analyseurs ─────────────────────────────────────────────────────────────
// Les deux refusent de rendre un résultat s'ils ne reconnaissent pas la mise
// en forme attendue. C'est délibéré : la seule issue pire qu'un test rouge
// est un test vert qui a cessé de lire son entrée.

/** Colonnes du bloc `Row` de chaque table de `public`, d'après le snapshot. */
function analyserGenere(source: string): Map<string, string[]> {
  const lignes = source.split(/\r?\n/);
  const debutPublic = lignes.indexOf("  public: {");
  const debutTables = lignes.indexOf("    Tables: {", debutPublic);
  if (debutPublic === -1 || debutTables === -1) {
    throw new Error(
      "database.generated.ts : bloc `public.Tables` introuvable — la mise en " +
        "forme du générateur a changé, cet analyseur doit être révisé.",
    );
  }

  const tables = new Map<string, string[]>();
  let table: string | null = null;

  for (let i = debutTables + 1; i < lignes.length; i++) {
    const ligne = lignes[i];
    if (ligne === "    Views: {") break;

    const entete = /^ {6}([a-z0-9_]+): \{$/.exec(ligne);
    if (entete) {
      table = entete[1];
      continue;
    }
    if (table === null || tables.has(table) || ligne !== "        Row: {") {
      continue;
    }
    // Figée après le rétrécissement : le nom sert dans la boucle interne et
    // dans les messages, on ne dépend pas de l'analyse de flux sur un `let`.
    const courante: string = table;

    const colonnes: string[] = [];
    let j = i + 1;
    for (; j < lignes.length && lignes[j] !== "        }"; j++) {
      if (lignes[j].includes("{")) {
        throw new Error(
          `database.generated.ts : type imbriqué dans Row de « ${courante} » — ` +
            "l'analyseur suppose un champ par ligne, il doit être révisé.",
        );
      }
      const colonne = /^ {10}([a-zA-Z0-9_]+)\??: /.exec(lignes[j]);
      if (colonne) colonnes.push(colonne[1]);
    }
    if (j >= lignes.length) {
      throw new Error(
        `database.generated.ts : bloc Row non fermé pour « ${courante} ».`,
      );
    }
    if (colonnes.length === 0) {
      throw new Error(`database.generated.ts : Row vide pour « ${courante} ».`);
    }
    tables.set(courante, colonnes);
    i = j;
  }
  return tables;
}

/**
 * Champs de chaque `export interface` de `database.ts`.
 *
 * Limite mesurée, à connaître : si l'accolade fermante d'une interface du
 * MILIEU du fichier disparaît, cet analyseur ne lève rien — il avale
 * l'interface suivante et rend un champ de trop. Ce cas est bien attrapé,
 * mais par deux autres chemins : le décompte d'interfaces chute (sentinelle
 * du test « classe toute interface ») et les champs avalés deviennent des
 * fantômes (test « ne promet aucun champ »). Seule une accolade manquante
 * sur la DERNIÈRE interface du fichier lève ici.
 */
function analyserManuscrit(source: string): Map<string, string[]> {
  const lignes = source.split(/\r?\n/);
  const interfaces = new Map<string, string[]>();

  for (let i = 0; i < lignes.length; i++) {
    const entete = /^export interface ([A-Za-z0-9_]+) \{$/.exec(lignes[i]);
    if (!entete) continue;

    const champs: string[] = [];
    let j = i + 1;
    for (; j < lignes.length && lignes[j] !== "}"; j++) {
      // Une accolade ouvrante signalerait un champ objet inline : la lecture
      // « un champ par ligne à deux espaces » ne tiendrait plus.
      if (/^ {2}[a-zA-Z0-9_]+\??: .*\{\s*$/.test(lignes[j])) {
        throw new Error(
          `database.ts : champ objet inline dans « ${entete[1]} » — ` +
            "l'analyseur doit être révisé.",
        );
      }
      const champ = /^ {2}([a-zA-Z0-9_]+)\??: /.exec(lignes[j]);
      if (champ) champs.push(champ[1]);
    }
    if (j >= lignes.length) {
      throw new Error(`database.ts : interface « ${entete[1]} » non fermée.`);
    }
    interfaces.set(entete[1], champs);
    i = j;
  }
  return interfaces;
}

const TABLES = analyserGenere(readFileSync(CHEMIN_GENERE, "utf8"));
const INTERFACES = analyserManuscrit(readFileSync(CHEMIN_MANUSCRIT, "utf8"));

describe("contrat database.ts ↔ database.generated.ts", () => {
  /**
   * Ce que ce test empêche : la répétition littérale du défaut
   * `Wheel.skill_config`. Une colonne ajoutée en base, un snapshot
   * régénéré, une interface laissée en arrière — et `tsc` cesse
   * silencieusement de garder ce champ.
   *
   * Pour le faire rougir : retirer `skill_config` de l'interface `Wheel`
   * (src/types/database.ts) sans l'inscrire dans OMISSIONS.wheels, ou
   * ajouter une colonne à l'une des 45 tables couvertes puis régénérer le
   * snapshot sans toucher à l'interface.
   */
  it("n'omet aucune colonne sans l'avoir explicitement exemptée", () => {
    const manquantes: string[] = [];

    for (const [nom, table] of Object.entries(TABLE_PAR_INTERFACE)) {
      const colonnes = TABLES.get(table);
      const champs = INTERFACES.get(nom);
      // Une correspondance qui ne résout plus est une panne de la garde,
      // pas une absence de défaut : on la fait remonter comme un manque.
      if (!colonnes) {
        manquantes.push(`table « ${table} » absente du snapshot généré`);
        continue;
      }
      if (!champs) {
        manquantes.push(`interface « ${nom} » absente de database.ts`);
        continue;
      }

      const exemptees = new Set(
        (OMISSIONS[table] ?? []).map((o) => o.colonne),
      );
      for (const colonne of colonnes) {
        if (champs.includes(colonne) || exemptees.has(colonne)) continue;
        manquantes.push(
          `${table}.${colonne} — présente en base, absente de l'interface ` +
            `${nom}, non exemptée. Ajoutez-la à ${nom} (src/types/database.ts) ` +
            "ou inscrivez-la dans OMISSIONS avec son motif.",
        );
      }
    }

    expect(manquantes).toEqual([]);
  });

  /**
   * Une liste d'exemptions qu'on n'élague jamais est une muselière
   * permanente : la colonne finit par rejoindre l'interface, l'exemption
   * lui survit, et le jour où quelqu'un la retire du type plus rien ne
   * parle. Ce test rend l'exemption périssable.
   *
   * Pour le faire rougir : ajouter `spin_id` à l'interface `Participation`
   * sans retirer l'entrée correspondante d'OMISSIONS.participations ;
   * ou exempter une colonne qui n'existe pas (faute de frappe) ; ou
   * exempter une colonne d'une table non couverte par TABLE_PAR_INTERFACE.
   */
  it("ne conserve aucune exemption périmée, mal orthographiée ou muette", () => {
    // Construction par boucle et non par `.map()` : TypeScript infère
    // `string[][]` d'un `.map` renvoyant un littéral de tableau, que le
    // constructeur de Map refuse.
    const tablesCouvertes = new Map<string, string>();
    for (const [nom, table] of Object.entries(TABLE_PAR_INTERFACE)) {
      tablesCouvertes.set(table, nom);
    }
    const anomalies: string[] = [];

    for (const [table, omissions] of Object.entries(OMISSIONS)) {
      const nom = tablesCouvertes.get(table);
      if (!nom) {
        anomalies.push(
          `${table} — exemptions déclarées pour une table qu'aucune ` +
            "interface manuscrite ne miroite : entrée morte, à supprimer.",
        );
        continue;
      }
      const colonnes = TABLES.get(table) ?? [];
      const champs = INTERFACES.get(nom) ?? [];
      const vues = new Set<string>();

      for (const { colonne, motif } of omissions) {
        if (!colonnes.includes(colonne)) {
          anomalies.push(
            `${table}.${colonne} — exemptée mais absente de la base : ` +
              "colonne renommée ou supprimée, exemption à retirer.",
          );
        }
        if (champs.includes(colonne)) {
          anomalies.push(
            `${table}.${colonne} — exemptée ALORS QUE ${nom} la porte ` +
              "désormais : la dette est résorbée, retirez l'exemption pour " +
              "que la colonne redevienne gardée.",
          );
        }
        // Le motif est la seule chose qui distingue un arbitrage d'un oubli.
        if (motif.trim().length < 30) {
          anomalies.push(
            `${table}.${colonne} — motif absent ou trop court pour dire ` +
              "pourquoi la colonne est hors du type.",
          );
        }
        if (vues.has(colonne)) {
          anomalies.push(`${table}.${colonne} — exemptée deux fois.`);
        }
        vues.add(colonne);
      }
    }

    expect(anomalies).toEqual([]);
  });

  /**
   * Le point aveugle de toute garde câblée à la main : l'interface qu'on
   * ajoute sans la câbler. Elle ne casse rien, elle ne dit rien, et elle
   * ment aussi longtemps qu'on veut. C'est précisément ce que TypeScript
   * ne peut pas surveiller — d'où la lecture textuelle.
   *
   * Pour le faire rougir : ajouter `export interface Referral { … }` à
   * database.ts sans l'inscrire ni dans TABLE_PAR_INTERFACE, ni dans
   * HORS_TABLE.
   */
  it("classe toute interface manuscrite : miroir de table, ou hors table", () => {
    const nonClassees = [...INTERFACES.keys()].filter(
      (nom) => !(nom in TABLE_PAR_INTERFACE) && !(nom in HORS_TABLE),
    );

    expect(nonClassees).toEqual([]);
    // Sentinelle, et pas une décoration : sans elle, un analyseur qui aurait
    // cessé de reconnaître `export interface` rendrait `nonClassees` vide et
    // ce test passerait en ne lisant rien. Couplée à l'assertion ci-dessus
    // (interfaces ⊆ classées), elle force l'égalité des deux ensembles : une
    // entrée de HORS_TABLE qui ne désigne plus aucune interface fait rougir.
    // C'est aussi ce qui rattrape l'accolade fermante manquante décrite sur
    // `analyserManuscrit` — vérifié : le décompte tombe à 49.
    expect(INTERFACES.size).toBeGreaterThanOrEqual(
      Object.keys(TABLE_PAR_INTERFACE).length + Object.keys(HORS_TABLE).length,
    );
  });

  /**
   * Le défaut miroir : un champ que le type promet et que la base n'a pas
   * (ou plus). Le code le lit, obtient `undefined`, et le compilateur jure
   * que c'est un `string`. Vide aujourd'hui — donc ce test dit quelque
   * chose de vrai plutôt que de couvrir un passif.
   *
   * Pour le faire rougir : ajouter `foo: string;` à l'interface `Prize`, ou
   * supprimer une colonne en base et régénérer le snapshot sans toucher au
   * type manuscrit.
   */
  it("ne promet aucun champ qui n'existe pas en base", () => {
    const fantomes: string[] = [];

    for (const [nom, table] of Object.entries(TABLE_PAR_INTERFACE)) {
      const colonnes = TABLES.get(table);
      const champs = INTERFACES.get(nom);
      if (!colonnes || !champs) continue; // déjà signalé par le premier test

      const tolerees = new Set(
        (CHAMPS_HORS_COLONNE[table] ?? []).map((o) => o.colonne),
      );
      for (const champ of champs) {
        if (colonnes.includes(champ) || tolerees.has(champ)) continue;
        fantomes.push(
          `${nom}.${champ} — promis par l'interface, absent de la table ` +
            `${table} : toute lecture rend undefined sous un type non ` +
            "nullable.",
        );
      }
    }

    expect(fantomes).toEqual([]);
  });

  /**
   * Sans ces bornes, une évolution de mise en forme rendrait des maps
   * quasi vides et TOUS les tests ci-dessus passeraient en ne comparant
   * rien. Le projet a déjà livré un filet vert qui ne vérifiait rien (le
   * job CI qui inspectait `.next/server/app` avant le build) : la classe
   * d'erreur est connue, elle se garde explicitement.
   *
   * Pour le faire rougir : casser volontairement une regex d'analyse.
   */
  it("a bien lu ses deux entrées (sentinelles de l'analyseur)", () => {
    expect(TABLES.size).toBeGreaterThanOrEqual(90);
    expect(INTERFACES.size).toBeGreaterThanOrEqual(45);

    // Chaque correspondance déclarée doit résoudre des deux côtés, sinon la
    // garde couvre moins de tables qu'elle ne l'annonce.
    const irresolues = Object.entries(TABLE_PAR_INTERFACE).filter(
      ([nom, table]) => !TABLES.has(table) || !INTERFACES.has(nom),
    );
    expect(irresolues).toEqual([]);

    // Les quatre interfaces à risque produit direct — celles dont un
    // mensonge se traduit par un lot mal émis, une roue injouable ou un
    // code de retrait perdu — sont couvertes nommément.
    for (const nom of ["Wheel", "Prize", "Campaign", "Participation"]) {
      expect(Object.keys(TABLE_PAR_INTERFACE)).toContain(nom);
      expect(INTERFACES.get(nom)?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

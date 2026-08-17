import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// UN REFUS DE LA BASE DOIT ARRIVER DANS LA LANGUE DU MODULE
//
// Depuis `20260905120000_p0_gardes_publication.sql`, la colonne de publication
// des neuf modules n'est plus écrivable par `authenticated` : chaque module
// passe par une RPC qui rejoue le rôle, le droit de module et le droit effectif
// d'abonnement. Le risque de ce déplacement n'est PAS la sécurité — elle est
// meilleure — c'est l'expérience : une RPC refuse par un code, et un code non
// traduit devient « Mise à jour impossible » là où le commerçant lisait, la
// veille, quel module lui manquait.
//
// ── CE QUE CE FICHIER MESURE, ET POURQUOI IL LE MESURE ICI ──
//
// Les quatre actions montées ci-dessous reçoivent une organisation qui a le
// droit CÔTÉ APPLICATION (addon allumé, abonnement actif) et une base qui le
// refuse. Ce montage n'est pas artificiel : c'est exactement l'état d'une
// divergence entre `hasXAccess` (TypeScript) et `org_has_module_access` (SQL),
// la seule chose que la garde de parité `access_parity.test.sql` surveille sans
// pouvoir l'empêcher. C'est aussi le SEUL montage qui traverse la traduction :
// sur un compte réellement sans droit, la garde applicative refuse avant, et
// ce chemin n'est jamais atteint.
//
// ── CE QU'IL NE MESURE PAS ──
//
// Ni que Postgres émet réellement ces messages (pgTAP), ni que les gardes
// métier passent avant (leurs propres harnais). Il mesure le maillon qu'aucun
// des deux ne voit : la phrase rendue à l'écran quand la base dit non.
// ────────────────────────────────────────────────────────────

const HUNT_ID = "00000000-0000-4000-8000-00000000c001";
const QUIZ_ID = "00000000-0000-4000-8000-00000000c002";
const CAMPAIGN_ID = "00000000-0000-4000-8000-00000000c003";
const PROGRAM_ID = "00000000-0000-4000-8000-00000000c004";
const SESSION_ID = "00000000-0000-4000-8000-00000000c005";

/** Réponse d'une table simulée, selon l'opération qui l'a atteinte. */
type FixtureTable = {
  /** Résolution de `maybeSingle()`. */
  single?: unknown;
  /** Résolution du `await` de la chaîne (lecture ou `update`). */
  awaited?: unknown;
  /** Résolution du `await` quand la chaîne portait un `insert`. */
  insert?: unknown;
};

const { state } = vi.hoisted(() => ({
  state: {
    /** Réponse rendue à CHAQUE `rpc()`, par nom. */
    reponses: {} as Record<string, { data: unknown; error: { message: string } | null }>,
    /** Appels observés, dans l'ordre. */
    rpc: [] as Array<{ nom: string; args: Record<string, unknown> }>,
    /** Écritures passées par le client RLS, par table. */
    ecritures: [] as Array<{ table: string; champs: Record<string, unknown> }>,
    /** Tables simulées du tour en cours — remises à neuf à chaque test. */
    tables: {} as Record<string, FixtureTable | undefined>,
    role: "owner" as string,
  },
}));

/** Réponse d'une RPC de transition : le refus de droit de module. */
const REFUS_MODULE = (nom: string) => ({
  data: null,
  error: { message: `module access required: ${nom}` },
});

const TABLES: Record<string, FixtureTable> = {
  event_sessions: { single: { data: { id: SESSION_ID }, error: null } },
  hunts: { single: { data: { id: HUNT_ID, reward_label: "Panier garni" }, error: null } },
  hunt_steps: { awaited: { count: 4, error: null } },
  quizzes: {
    single: {
      data: {
        id: QUIZ_ID,
        reward_mode: "none",
        reward_label: "",
        target_wheel_id: null,
        reward_stock: 0,
      },
      error: null,
    },
  },
  quiz_questions: { awaited: { count: 3, error: null } },
  campaigns: { single: { data: { id: CAMPAIGN_ID }, error: null } },
  referral_programs: { awaited: { data: [{ id: PROGRAM_ID }], error: null } },
};

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/auth", () => ({
  getUserAndOrg: vi.fn(async () => ({
    user: { id: "user-1" },
    organization: {
      id: "org-1",
      // TOUS les addons allumés et un abonnement actif : les gardes
      // applicatives passent, seule la base refuse. Sans cela le test
      // s'arrêterait avant la RPC et ne prouverait rien de la traduction.
      addon_hunts: true,
      addon_quiz: true,
      addon_referral: true,
      addon_events: true,
      timezone: "Europe/Paris",
      subscription_status: "active",
      trial_ends_at: "2099-01-01T00:00:00Z",
      past_due_since: null,
      comp_access: false,
      comp_access_until: null,
    },
    role: state.role,
  })),
}));
// La télécommande d'événement est la seule des cinq surfaces à passer par le
// client `service_role` : `authorizeRemote` a déjà prouvé l'appartenance de la
// session à l'organisation active, la RPC rejoue le rôle et — depuis ce lot —
// le droit du module. Le double alimente le MÊME journal d'appels que le
// client RLS, pour que les assertions « la RPC a bien été atteinte » se lisent
// de la même façon d'un module à l'autre.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: (nom: string, args: Record<string, unknown>) => {
      state.rpc.push({ nom, args });
      return Promise.resolve(state.reponses[nom] ?? { data: { state: "ok" }, error: null });
    },
    from: () => {
      const c: Record<string, unknown> = {};
      const self = () => c;
      for (const m of ["select", "eq"]) c[m] = self;
      c.maybeSingle = () => Promise.resolve({ data: { state_revision: 1 }, error: null });
      return c;
    },
  })),
}));
// `rateLimit` seul est doublé : il frappe Upstash et le client `service_role`.
// Le reste du module (les règles, la construction des clés) reste RÉEL — un
// seuil doublé ici ne prouverait rien du seau que la production applique.
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: vi.fn(() => Promise.resolve(true)),
  observeSharedKey: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/event-realtime", () => ({
  broadcastEventRefresh: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/monitoring", () => ({
  reportError: vi.fn(),
  monitored: (_n: string, f: unknown) => f,
}));
vi.mock("@/lib/revalidate-play", () => ({ revalidatePlaySlugs: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ hasEverSubscribed: vi.fn(async () => true) }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: (nom: string, args: Record<string, unknown>) => {
      state.rpc.push({ nom, args });
      return Promise.resolve(
        state.reponses[nom] ?? { data: true, error: null },
      );
    },
    from(table: string) {
      const c: Record<string, unknown> = {};
      const self = () => c;
      // L'opération est retenue parce qu'une même table sert les deux chemins
      // du parrainage : l'`update` qui ne touche aucune ligne, puis l'`insert`
      // qui suit. Sans cette distinction, aucun montage ne peut faire échouer
      // le SEUL des deux que ce lot corrige.
      let operation: "lecture" | "insert" = "lecture";
      for (const m of [
        "select", "eq", "neq", "in", "is", "not", "gt", "lt", "order", "limit",
      ]) {
        c[m] = self;
      }
      c.update = (champs: Record<string, unknown>) => {
        state.ecritures.push({ table, champs });
        return c;
      };
      c.insert = (champs: Record<string, unknown>) => {
        operation = "insert";
        state.ecritures.push({ table, champs });
        return c;
      };
      c.maybeSingle = () =>
        Promise.resolve(state.tables[table]?.single ?? { data: null, error: null });
      c.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
        const fixture = state.tables[table];
        const reponse =
          (operation === "insert" ? fixture?.insert : undefined) ??
          fixture?.awaited ?? { data: null, error: null };
        return Promise.resolve(reponse).then(ok, ko);
      };
      return c;
    },
  })),
}));

const chasse = await import("./hunts");
const quiz = await import("./quiz");
const campagnes = await import("./campaigns");
const parrainage = await import("./referral");
const evenements = await import("./events");
const { messageAccesCampagne } = await import("@/lib/message-acces-campagne");

function form(champs: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(champs)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  state.reponses = {};
  state.rpc = [];
  state.ecritures = [];
  state.tables = structuredClone(TABLES);
  state.role = "owner";
});

describe("le refus de droit de la base arrive à l'écran, module par module", () => {
  it("chasse : la phrase nomme la Chasse au trésor, pas « mise à jour impossible »", async () => {
    state.reponses.set_hunt_status = REFUS_MODULE("hunts");

    const res = await chasse.setHuntStatus(null, form({ id: HUNT_ID, status: "active" }));

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toBe(
      "Le module Chasse au trésor n'est pas activé sur votre compte.",
    );
    // La RPC a bien été atteinte : sans cette assertion, un refus arrivé plus
    // tôt (garde métier, lecture manquée) rendrait le test vert pour une
    // mauvaise raison.
    expect(state.rpc.map((a) => a.nom)).toContain("set_hunt_status");
  });

  it("chasse : un refus de transition n'appelle PAS le solde des complétions", async () => {
    // CONTRÔLE DE CONSÉQUENCE. `settle_hunt_completions` frappe des codes
    // `CHASSE-` réels. Le faire courir après une publication REFUSÉE émettrait
    // des lots pour une chasse que la base vient de refuser de publier.
    state.reponses.set_hunt_status = REFUS_MODULE("hunts");

    await chasse.setHuntStatus(null, form({ id: HUNT_ID, status: "active" }));

    expect(state.rpc.map((a) => a.nom)).not.toContain("settle_hunt_completions");
  });

  it("quiz : la phrase nomme le Quiz", async () => {
    state.reponses.set_quiz_status = REFUS_MODULE("quiz");

    const res = await quiz.setQuizStatus(null, form({ id: QUIZ_ID, status: "active" }));

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toBe(
      "Le module Quiz n'est pas activé sur votre compte.",
    );
    expect(state.rpc.map((a) => a.nom)).toContain("set_quiz_status");
  });

  it("campagne : la phrase reste celle de l'accès campagne, refus applicatif ou refus SQL", async () => {
    // Le message de campagne est le seul des quatre à porter un discriminant
    // (essai terminé / abonnement résilié) qui coûte une lecture privilégiée.
    // Le comparer au helper plutôt qu'à un littéral interdit qu'une phrase soit
    // recopiée ici et dérive de celle que les autres écrans affichent.
    state.reponses.set_campaign_status = REFUS_MODULE("wheel");

    const res = await campagnes.updateCampaign(
      null,
      form({ id: CAMPAIGN_ID, status: "active" }),
    );

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toBe(
      messageAccesCampagne({ essaiTermine: false, geste: "activation" }),
    );
  });

  it("campagne : le nom N'EST PAS enregistré quand la transition est refusée", async () => {
    // LE POINT DE DÉCOUPAGE DU CAS MIXTE. Le nom et le statut voyagent dans le
    // même formulaire et ne peuvent plus s'écrire ensemble ; si le renommage
    // partait en premier, le commerçant lirait un refus d'abonnement pendant
    // que son nouveau nom serait bel et bien en base, sans rien qui le dise.
    state.reponses.set_campaign_status = REFUS_MODULE("wheel");

    await campagnes.updateCampaign(
      null,
      form({ id: CAMPAIGN_ID, name: "Nouveau nom", status: "active" }),
    );

    expect(state.ecritures.filter((e) => e.table === "campaigns")).toEqual([]);
  });

  it("parrainage : la phrase nomme le Parrainage, et la config a bien été enregistrée", async () => {
    // L'ORDRE DU DÉCOUPAGE LE PLUS DÉLICAT. `enabled` est noyé dans dix-sept
    // colonnes d'un panneau que le commerçant enregistre souvent : la config
    // part par le client RLS, l'interrupteur suit par la RPC. Si l'interrupteur
    // passait en premier, un échec de la config laisserait un programme ALLUMÉ
    // sur des récompenses que le commerçant croit avoir changées.
    state.reponses.set_referral_program_enabled = REFUS_MODULE("referral");

    const res = await parrainage.saveReferralProgram({
      campaignId: CAMPAIGN_ID,
      enabled: true,
      chestThreshold: 5,
      sponsorMaxFilleuls: 10,
      windowDays: 30,
      sponsor: { kind: "lot", label: "Un café", details: "", stock: 20 },
      filleul: { kind: "none", label: "", details: "", stock: "" },
      chest: { kind: "none", label: "", details: "", stock: "" },
    });

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toBe(
      "Le module Parrainage n'est pas activé sur votre compte.",
    );
    const ecriture = state.ecritures.find((e) => e.table === "referral_programs");
    expect(ecriture?.champs.sponsor_reward_label).toBe("Un café");
    // `enabled` A QUITTÉ le payload du client RLS : la colonne n'est plus
    // grantée, l'y laisser ferait échouer TOUT enregistrement du panneau.
    expect(ecriture?.champs).not.toHaveProperty("enabled");
  });

  it("parrainage : à la CRÉATION aussi, la phrase nomme le Parrainage", async () => {
    // MÊME CAUSE, MÊME FONCTION, DEUX VOCABULAIRES. À la création, `enabled`
    // reste dans la ligne (c'est voulu : création atomique, trigger gardien) —
    // donc ce n'est pas la RPC qui refuse mais le trigger, par un `P0001` que
    // le test `code === "23505"` ne reconnaît pas. Le refus tombait dans
    // « Enregistrement impossible » à dix lignes du refus jumeau qui, lui,
    // nommait le module.
    state.tables.referral_programs = {
      awaited: { data: [], error: null },
      insert: {
        data: null,
        error: { code: "P0001", message: "module access required: referral" },
      },
    };

    const res = await parrainage.saveReferralProgram({
      campaignId: CAMPAIGN_ID,
      enabled: true,
      chestThreshold: 5,
      sponsorMaxFilleuls: 10,
      windowDays: 30,
      sponsor: { kind: "lot", label: "Un café", details: "", stock: 20 },
      filleul: { kind: "none", label: "", details: "", stock: "" },
      chest: { kind: "none", label: "", details: "", stock: "" },
    });

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toBe(
      "Le module Parrainage n'est pas activé sur votre compte.",
    );
    // Le chemin traversé est bien l'INSERT, et `enabled` y est bien resté :
    // sans cette assertion, un test vert pourrait décrire un correctif qui
    // aurait sorti la colonne de la ligne — ce que ce lot ne fait pas.
    const insertion = state.ecritures.find(
      (e) => e.table === "referral_programs" && "enabled" in e.champs,
    );
    expect(insertion?.champs.enabled).toBe(true);
  });

  it("événement : la phrase nomme le Mode événement, pas « réessayez »", async () => {
    // LE PLUS SENSIBLE DES NEUF, et le seul que ce lot CRÉE : avant lui, la RPC
    // ne pouvait pas lever pour cette cause. `start_event_session` lève au lieu
    // de rendre `invalid_transition` précisément pour ne pas envoyer
    // l'organisateur chercher une panne technique devant sa salle — et son
    // appelant écrasait ce message par « Une erreur est survenue, réessayez. ».
    state.reponses.start_event_session = REFUS_MODULE("events");

    const res = await evenements.startEventSession({ sessionId: SESSION_ID });

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toBe(
      "Le module Mode événement n'est pas activé sur votre compte.",
    );
    expect(state.rpc.map((a) => a.nom)).toContain("start_event_session");
  });

  it("campagne : ARMER la programmation automatique parle d'abonnement, pas d'enregistrement", async () => {
    // Le trigger `campaigns_guard_auto_schedule` (20260906120000) refuse la
    // transition vers `auto_schedule = true`, parce que c'est le cron qui
    // publiera ensuite en `service_role` (il lit le droit lui aussi depuis
    // `20260926120000`, mais après coup : sa réponse est un e-mail, pas un
    // message de formulaire). C'est le SEUL des cinq appels au
    // vocabulaire de campagne qui n'a aucune garde applicative en face : la
    // phrase ne peut venir que d'ici.
    state.tables.campaigns = {
      ...TABLES.campaigns,
      awaited: {
        data: null,
        error: { code: "P0001", message: "module access required: wheel" },
      },
    };

    const res = await campagnes.updateCampaignAutomation(
      null,
      form({
        id: CAMPAIGN_ID,
        auto_schedule: "on",
        starts_at: "2099-01-01T10:00",
        ends_at: "",
        budget: "",
      }),
    );

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toBe(
      messageAccesCampagne({ essaiTermine: false, geste: "programmation" }),
    );
  });

  it("parrainage : éteindre n'exige aucun droit et passe quand même par la RPC", async () => {
    // La RPC ne garde QUE l'allumage. Un commerçant dont l'abonnement s'arrête
    // doit pouvoir ARRÊTER son parrainage — l'en empêcher serait un
    // enfermement. La RPC est appelée avec `p_enabled: false`, et elle passe.
    const res = await parrainage.saveReferralProgram({
      campaignId: CAMPAIGN_ID,
      enabled: false,
      chestThreshold: 5,
      sponsorMaxFilleuls: 10,
      windowDays: 30,
      sponsor: { kind: "none", label: "", details: "", stock: "" },
      filleul: { kind: "none", label: "", details: "", stock: "" },
      chest: { kind: "none", label: "", details: "", stock: "" },
    });

    expect(res.ok).toBe(true);
    expect(state.rpc).toEqual([
      {
        nom: "set_referral_program_enabled",
        args: {
          p_organization_id: "org-1",
          p_program_id: PROGRAM_ID,
          p_enabled: false,
        },
      },
    ]);
  });
});

describe("les autres refus gardent chacun leur sens", () => {
  it("une ligne absente se dit « introuvable », pas « module non activé »", async () => {
    // Les deux refusent, mais envoyer un commerçant acheter un module pour
    // débloquer une chasse qui n'existe pas est une impasse coûteuse.
    state.reponses.set_hunt_status = { data: false, error: null };

    const res = await chasse.setHuntStatus(null, form({ id: HUNT_ID, status: "active" }));

    expect(res.ok === false && res.error).toBe("Chasse introuvable");
  });

  it("campagne : une ligne absente se dit « Campagne introuvable », pas un refus de module", async () => {
    // Même piège que pour la chasse, sur le chemin qui a changé de comportement
    // dans ce lot : `updateCampaign` répondait « ok » en silence quand
    // l'`UPDATE` filtré par organisation ne touchait aucune ligne. La RPC rend
    // `data: false` sur ce cas, et ce test verrouille que ça reste distinct du
    // refus de droit de module (même bloc `issue`, branche voisine).
    state.reponses.set_campaign_status = { data: false, error: null };

    const res = await campagnes.updateCampaign(
      null,
      form({ id: CAMPAIGN_ID, status: "active" }),
    );

    expect(res.ok === false && res.error).toBe("Campagne introuvable");
  });

  it("une panne reste une panne et ne s'habille pas en refus de droit", async () => {
    state.reponses.set_quiz_status = {
      data: null,
      error: { message: "could not serialize access" },
    };

    const res = await quiz.setQuizStatus(null, form({ id: QUIZ_ID, status: "active" }));

    expect(res.ok === false && res.error).toBe("Mise à jour impossible");
  });

  it("événement : une panne garde son message générique", async () => {
    // La traduction ajoutée dans `runTransition` sert CINQ transitions dont une
    // seule est gardée. Si elle était écrite trop large, un incident de base un
    // soir d'événement se lirait « votre module n'est pas activé » — et
    // l'organisateur irait acheter ce qu'il possède déjà.
    state.reponses.start_event_session = {
      data: null,
      error: { message: "could not serialize access" },
    };

    const res = await evenements.startEventSession({ sessionId: SESSION_ID });

    expect(res.ok === false && res.error).toBe("Une erreur est survenue, réessayez.");
  });

  it("campagne : une panne à l'enregistrement de la programmation reste une panne", async () => {
    state.tables.campaigns = {
      ...TABLES.campaigns,
      awaited: { data: null, error: { code: "40001", message: "could not serialize access" } },
    };

    const res = await campagnes.updateCampaignAutomation(
      null,
      form({
        id: CAMPAIGN_ID,
        auto_schedule: "on",
        starts_at: "2099-01-01T10:00",
        ends_at: "",
        budget: "",
      }),
    );

    expect(res.ok === false && res.error).toBe("Enregistrement impossible");
  });

  it("parrainage : un refus RLS à la création reste « Enregistrement impossible »", async () => {
    // Le trigger ne porte QU'UN raise. Un `42501` n'est pas un refus de module
    // et ne doit pas envoyer le commerçant acheter un module qu'il a déjà.
    state.tables.referral_programs = {
      awaited: { data: [], error: null },
      insert: {
        data: null,
        error: { code: "42501", message: "new row violates row-level security policy" },
      },
    };

    const res = await parrainage.saveReferralProgram({
      campaignId: CAMPAIGN_ID,
      enabled: true,
      chestThreshold: 5,
      sponsorMaxFilleuls: 10,
      windowDays: 30,
      sponsor: { kind: "none", label: "", details: "", stock: "" },
      filleul: { kind: "none", label: "", details: "", stock: "" },
      chest: { kind: "none", label: "", details: "", stock: "" },
    });

    expect(res.ok === false && res.error).toBe("Enregistrement impossible");
  });
});

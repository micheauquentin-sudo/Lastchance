// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// calendar-context — chemin de LECTURE PUBLIC du calendrier
// (/calendar/[slug], son manifeste PWA) et contexte des actions publiques.
//
// POURQUOI CE FICHIER : ce chargeur décide, pour un visiteur ANONYME et avec
// un client `service_role` qui contourne la RLS, (a) quel calendrier est
// servi, (b) SOUS QUELLE IDENTITÉ la RPC `calendar_public_state` est appelée.
// Ce second point est le plus sensible du module : c'est le hash du cookie
// qui détermine quelles cases sont « ouvertes » et quels codes de retrait
// sont rendus. Aucun test ne le couvrait.
//
// La RPC est simulée : on vérifie les ARGUMENTS qu'elle reçoit (identité) et
// ce que le chargeur fait de sa réponse (fail-closed, mapping), pas son SQL —
// celui-ci est prouvé par pgTAP.
// ────────────────────────────────────────────────────────────

const { db, cookieJar, createAdminClientMock } = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type Builder = {
    eq: (column: string, value: unknown) => Builder;
    maybeSingle: () => Promise<{ data: Row | null; error: null }>;
  };

  const db = {
    calendars: [] as Row[],
    /** Table + colonnes + filtres de chaque requête, dans l'ordre. */
    queries: [] as Array<{
      table: string;
      columns: string;
      filters: Record<string, unknown>;
    }>,
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    /** Réponse simulée de `calendar_public_state`. */
    rpcData: null as unknown,
    rpcError: null as { message: string } | null,
    reset() {
      db.calendars = [];
      db.queries = [];
      db.rpcCalls = [];
      db.rpcData = null;
      db.rpcError = null;
    },
  };

  function createAdminClientMock() {
    return {
      from(table: string) {
        return {
          select(columns: string) {
            // `filters` est enregistré par RÉFÉRENCE puis rempli par les `eq`
            // successifs : complet au moment des assertions.
            const filters: Record<string, unknown> = {};
            db.queries.push({ table, columns, filters });
            const builder: Builder = {
              eq(column, value) {
                filters[column] = value;
                return builder;
              },
              maybeSingle: async () => ({
                data:
                  db.calendars.find((r) =>
                    Object.entries(filters).every(([k, v]) => r[k] === v),
                  ) ?? null,
                error: null,
              }),
            };
            return builder;
          },
        };
      },
      rpc(name: string, args: Record<string, unknown>) {
        db.rpcCalls.push({ name, args });
        return Promise.resolve({ data: db.rpcData, error: db.rpcError });
      },
    };
  }

  return { db, cookieJar: { jar: {} as Record<string, string> }, createAdminClientMock };
});

// La factory `vi.mock` est hissée au-dessus des imports : elle ne peut lire
// que des valeurs issues de `vi.hoisted`.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name in cookieJar.jar ? { value: cookieJar.jar[name] } : undefined,
  }),
}));

import {
  calendarTokenCookieName,
  loadCalendarActionContext,
  loadCalendarPublicContext,
} from "./calendar-context";

/** Le refus unique du module — recopié, car c'est sa stabilité qu'on teste. */
const UNAVAILABLE = "Ce calendrier n'est pas disponible.";

const CAL_ID = "3f1b6c2a-0000-4000-8000-000000000001";
const SLUG = "noel-chez-marcel";
const ORG_ID = "org-marcel";
const OTHER_ORG_ID = "org-voisin";
/** Libellé qu'une case VERROUILLÉE ne doit jamais laisser filer au client. */
const LOT_CACHE = "LOT-SECRET-CASE-12";

type Over = Record<string, unknown>;

function org(over: Over = {}) {
  return {
    id: ORG_ID,
    name: "Chez Marcel",
    logo_url: null,
    subscription_status: "active",
    trial_ends_at: "2026-01-01T00:00:00.000Z",
    past_due_since: null,
    addon_calendar: true,
    comp_access: false,
    comp_access_until: null,
    timezone: "Europe/Paris",
    ...over,
  };
}

function calendar(over: Over = {}) {
  return {
    id: CAL_ID,
    organization_id: ORG_ID,
    status: "active",
    public_slug: SLUG,
    organizations: org(),
    ...over,
  };
}

/**
 * Réponse nominale de `calendar_public_state` : une case OUVERTE par le joueur
 * courant (avec son code, qui lui revient) et une case VERROUILLÉE dont la RPC
 * laisserait passer le contenu — le mapper doit le réduire à null.
 */
function publicStateRaw(over: Over = {}) {
  return {
    state: "ok",
    calendar: {
      id: CAL_ID,
      name: "Calendrier de Marcel",
      theme: "noel",
      status: "active",
      day_count: 2,
      merchant_content: null,
      completion_reward_label: "Une bûche offerte",
      completion_reward_details: null,
    },
    days: [
      {
        day_index: 1,
        unlock_at: "2026-12-01T00:00:00.000Z",
        status: "opened",
        is_special: false,
        content_type: "lot",
        reward_label: "Un chocolat",
        code: "CAL-MIEN1234",
        out_of_stock: false,
      },
      {
        day_index: 2,
        unlock_at: "2026-12-02T00:00:00.000Z",
        status: "locked",
        is_special: true,
        content_type: "lot",
        reward_label: LOT_CACHE,
        reward_details: LOT_CACHE,
        content_text: LOT_CACHE,
        code: "CAL-PASENCORE",
        spin_grant_token: "jeton-de-spin",
      },
    ],
    progression: { opened_count: 1, day_count: 2 },
    completion_reward: null,
    ...over,
  };
}

/** Hash recalculé ici, jamais importé : un test qui réutilise la fonction
 *  hachée ne prouve que sa propre cohérence avec elle-même. */
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

beforeEach(() => {
  db.reset();
  db.calendars = [calendar()];
  db.rpcData = publicStateRaw();
  cookieJar.jar = {};
  vi.restoreAllMocks();
});

// ────────────────────────────────────────────────────────────
// 1. Résolution : UUID ou slug
// ────────────────────────────────────────────────────────────
describe("loadCalendarPublicContext — résolution du calendrier", () => {
  it("un UUID est cherché sur `id`, sans passer par le slug", async () => {
    // Rouge si l'UUID partait vers `public_slug` : plus aucun accès par
    // identifiant ne résoudrait — or c'est celui que porte le manifeste PWA
    // installé sur l'écran d'accueil du joueur.
    const ctx = await loadCalendarPublicContext(CAL_ID);

    expect(db.queries[0].filters).toEqual({ id: CAL_ID });
    expect(ctx.ok).toBe(true);
  });

  it("un slug est cherché sur `public_slug`, en minuscules", async () => {
    // Conséquence produit : un slug recopié à la main depuis une affiche, en
    // capitales, doit ouvrir le calendrier. Rouge si le `.toLowerCase()`
    // sautait — le QR marcherait, la saisie manuelle non.
    const ctx = await loadCalendarPublicContext("Noel-Chez-Marcel");

    expect(db.queries[0].filters).toEqual({ public_slug: SLUG });
    expect(ctx.ok).toBe(true);
  });

  it("une chaîne qui CONTIENT un UUID reste un slug", async () => {
    // Rouge si le motif perdait ses ancres `^…$` : une saisie arbitraire
    // partirait vers une colonne `uuid` et ferait échouer la requête
    // (22P02) au lieu de rendre un 404 propre.
    await loadCalendarPublicContext(`prefixe-${CAL_ID}`);

    expect(db.queries[0].filters).toEqual({ public_slug: `prefixe-${CAL_ID}` });
  });
});

// ────────────────────────────────────────────────────────────
// 2. Cloisonnement et états fermés — un seul refus, aucune RPC
// ────────────────────────────────────────────────────────────
describe("loadCalendarPublicContext — refus indistinguables", () => {
  const refusals: Array<[string, () => void]> = [
    ["calendrier inconnu", () => { db.calendars = []; }],
    [
      "organisation embarquée absente",
      () => { db.calendars = [calendar({ organizations: null })]; },
    ],
    [
      "organisation embarquée d'un autre tenant",
      () => { db.calendars = [calendar({ organizations: org({ id: OTHER_ORG_ID }) })]; },
    ],
    [
      "module calendrier coupé",
      () => { db.calendars = [calendar({ organizations: org({ addon_calendar: false }) })]; },
    ],
    [
      "essai expiré",
      () => {
        db.calendars = [
          calendar({
            organizations: org({
              subscription_status: "trialing",
              trial_ends_at: "2020-01-01T00:00:00.000Z",
            }),
          }),
        ];
      },
    ],
    ["calendrier en brouillon", () => { db.calendars = [calendar({ status: "draft" })]; }],
    ["calendrier archivé", () => { db.calendars = [calendar({ status: "archived" })]; }],
  ];

  it("tous les motifs rendent la même phrase et n'appellent JAMAIS la RPC", async () => {
    // Deux propriétés en une, parce qu'elles se tiennent : `calendar_public_state`
    // est la fonction qui matérialise les codes de retrait ; l'appeler avant
    // d'avoir statué sur le tenant et l'abonnement reviendrait à la faire
    // travailler pour un visiteur qu'on va refuser. Et un message spécifique
    // par motif transformerait la page en oracle sur l'état commercial du
    // commerçant (« essai expiré » se lit de l'extérieur).
    vi.spyOn(console, "error").mockImplementation(() => {});
    const messages = new Set<string>();

    for (const [label, setup] of refusals) {
      db.reset();
      db.rpcData = publicStateRaw();
      db.calendars = [calendar()];
      setup();

      const ctx = await loadCalendarPublicContext(SLUG);
      if (ctx.ok) throw new Error(`« ${label} » aurait dû fermer le calendrier`);
      messages.add(ctx.error);
      expect(db.rpcCalls, label).toEqual([]);
    }

    expect(messages).toEqual(new Set([UNAVAILABLE]));
  });

  it("ne demande que les colonnes publiques de l'organisation", async () => {
    // `organizations(*)` ramènerait `webhook_secret` et `stripe_customer_id`
    // dans un contexte servi à un anonyme — invisible du typage, la ligne
    // étant castée depuis `unknown`.
    await loadCalendarPublicContext(SLUG);

    expect(db.queries[0].columns).toContain(
      "organizations(id, name, logo_url, subscription_status, trial_ends_at, past_due_since, addon_calendar, comp_access, comp_access_until, timezone)",
    );
    expect(db.queries[0].columns).not.toContain("organizations(*");
    // Le calendrier lui-même n'est lu que par ses 4 colonnes publiques.
    expect(db.queries[0].columns).not.toContain("*,");
  });

  it("une seule requête précède la RPC", async () => {
    // Chemin ouvert à Internet : rouge si quelqu'un rajoutait une lecture
    // séquentielle (organisation, cases) avant les gardes.
    await loadCalendarPublicContext(SLUG);

    expect(db.queries).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────
// 3. Identité du joueur — le point le plus sensible du module
// ────────────────────────────────────────────────────────────
describe("loadCalendarPublicContext — sous quelle identité la RPC est appelée", () => {
  it("sans cookie : aucune identité n'est envoyée à la RPC", async () => {
    // Rouge si une valeur par défaut (chaîne vide, null explicite) partait à
    // sa place : la RPC chercherait un joueur de hash vide et pourrait
    // attribuer ses cases ouvertes — donc ses codes — au premier visiteur venu.
    const ctx = await loadCalendarPublicContext(SLUG);

    expect(db.rpcCalls).toHaveLength(1);
    expect(db.rpcCalls[0].name).toBe("calendar_public_state");
    expect(db.rpcCalls[0].args).toEqual({
      p_calendar_id: CAL_ID,
      p_player_token_hash: undefined,
    });
    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.hasIdentity).toBe(false);
  });

  it("avec cookie : seul le SHA-256 part, jamais le jeton", async () => {
    // Le cookie est le mot de passe du joueur. Rouge si `hashPlayerToken`
    // sautait : le jeton brut transiterait vers la base, et une fuite
    // suffirait à rejouer l'identité — donc à récupérer les codes.
    const TOKEN = "jeton-du-joueur";
    cookieJar.jar[calendarTokenCookieName(CAL_ID)] = TOKEN;

    const ctx = await loadCalendarPublicContext(SLUG);

    expect(db.rpcCalls[0].args.p_player_token_hash).toBe(sha256(TOKEN));
    expect(JSON.stringify(db.rpcCalls[0].args)).not.toContain(TOKEN);
    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.hasIdentity).toBe(true);
    // Ni le jeton ni son hash ne doivent repartir vers l'appelant.
    expect(JSON.stringify(ctx.publicState)).not.toContain(TOKEN);
    expect(JSON.stringify(ctx.publicState)).not.toContain(sha256(TOKEN));
  });

  it("le cookie est nommé par CALENDRIER : celui d'un autre est ignoré", async () => {
    // Deux calendriers d'un même commerce (ou de deux commerces sur le même
    // téléphone) doivent avoir deux identités. Rouge si le nom du cookie
    // perdait l'identifiant : les cases ouvertes — et les codes — d'un
    // calendrier s'afficheraient sur un autre.
    cookieJar.jar[calendarTokenCookieName("un-autre-calendrier")] = "jeton";

    const ctx = await loadCalendarPublicContext(SLUG);

    expect(db.rpcCalls[0].args.p_player_token_hash).toBeUndefined();
    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.hasIdentity).toBe(false);
  });

  it("le cookie est cherché sur l'identifiant RÉSOLU, pas sur l'URL", async () => {
    // Le visiteur est arrivé par le slug ; son cookie, lui, est nommé par
    // l'UUID. Rouge si le nom était construit sur le paramètre d'URL : le même
    // joueur aurait deux identités selon qu'il arrive par lien ou par QR, et
    // perdrait ses cases déjà ouvertes.
    const TOKEN = "jeton-du-joueur";
    cookieJar.jar[calendarTokenCookieName(CAL_ID)] = TOKEN;

    await loadCalendarPublicContext(SLUG);

    expect(db.rpcCalls[0].args.p_player_token_hash).toBe(sha256(TOKEN));
  });
});

// ────────────────────────────────────────────────────────────
// 4. Fail-closed sur la RPC
// ────────────────────────────────────────────────────────────
describe("loadCalendarPublicContext — fail-closed", () => {
  it("une RPC en erreur ferme la page", async () => {
    // Rouge si l'erreur était ignorée : `mapCalendarPublicState(null)` rend un
    // état « unavailable » silencieux, et la page afficherait un calendrier
    // vide plutôt qu'un 404 — le joueur croirait ses cases perdues.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    db.rpcError = { message: "deadlock detected" };

    const ctx = await loadCalendarPublicContext(SLUG);

    expect(ctx.ok).toBe(false);
    if (ctx.ok) throw new Error("RPC en erreur : la page doit être fermée");
    expect(ctx.error).toBe(UNAVAILABLE);
    expect(spy).toHaveBeenCalled();
  });

  const degradedStates: Array<[string, Over]> = [
    ["un état non `ok`", { state: "unavailable" }],
    ["un jsonb sans calendrier", { calendar: null }],
  ];

  it.each(degradedStates)("%s ferme la page", async (_label, over) => {
    // Rouge si le chargeur se contentait de l'absence d'erreur SQL : la RPC
    // refuse aussi par la donnée (calendrier fermé côté SQL), pas seulement
    // par exception.
    db.rpcData = publicStateRaw(over);

    const ctx = await loadCalendarPublicContext(SLUG);

    expect(ctx.ok).toBe(false);
  });

  it("une réponse RPC vide (null) ferme la page", async () => {
    // Rouge si l'absence de données était traitée comme un calendrier ouvert
    // mais sans cases : le joueur verrait une grille vide au lieu d'un 404.
    db.rpcData = null;

    const ctx = await loadCalendarPublicContext(SLUG);

    expect(ctx.ok).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// 5. Cas nominal — ce qui franchit la frontière
// ────────────────────────────────────────────────────────────
describe("loadCalendarPublicContext — cas nominal", () => {
  it("rend de quoi jouer, et le contenu d'une case verrouillée reste caché", async () => {
    // INVARIANT #2 du module, vérifié ici À TRAVERS LE CHEMIN PUBLIC RÉEL : la
    // RPC est délibérément simulée en train de laisser filer le contenu d'une
    // case non ouverte ; c'est le passage par `mapCalendarPublicState` qui doit
    // l'annuler. Rouge si le chargeur rendait `stateRaw` brut — le libellé et
    // le code du lot du 24 seraient lisibles dans le payload RSC dès le 1er.
    const ctx = await loadCalendarPublicContext(SLUG);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.calendarId).toBe(CAL_ID);
    expect(ctx.publicSlug).toBe(SLUG);
    expect(ctx.organization.id).toBe(ORG_ID);
    expect(ctx.publicState.state).toBe("ok");
    expect(ctx.publicState.calendar?.name).toBe("Calendrier de Marcel");

    // La case ouverte par CE joueur lui rend bien son code…
    expect(ctx.publicState.days[0].code).toBe("CAL-MIEN1234");
    // …la case verrouillée ne rend rien du tout.
    expect(ctx.publicState.days[1]).toMatchObject({
      status: "locked",
      contentType: null,
      contentText: null,
      rewardLabel: null,
      rewardDetails: null,
      code: null,
      spinGrantToken: null,
    });
    expect(JSON.stringify(ctx)).not.toContain(LOT_CACHE);
    expect(JSON.stringify(ctx)).not.toContain("CAL-PASENCORE");
  });
});

// ────────────────────────────────────────────────────────────
// 6. Contexte d'action — plus pauvre encore
// ────────────────────────────────────────────────────────────
describe("loadCalendarActionContext — contexte minimal des actions publiques", () => {
  const refusals: Array<[string, () => void]> = [
    ["calendrier inconnu", () => { db.calendars = []; }],
    ["organisation absente", () => { db.calendars = [calendar({ organizations: null })]; }],
    [
      "organisation d'un autre tenant",
      () => { db.calendars = [calendar({ organizations: org({ id: OTHER_ORG_ID }) })]; },
    ],
    [
      "module coupé",
      () => { db.calendars = [calendar({ organizations: org({ addon_calendar: false }) })]; },
    ],
    ["calendrier archivé", () => { db.calendars = [calendar({ status: "archived" })]; }],
  ];

  it.each(refusals)("refuse sans rien dire quand %s", async (_label, setup) => {
    // Le contrat de refus est ici plus pauvre que celui de la page : PAS de
    // champ `error`. Rouge si un motif s'y glissait — ces contextes servent des
    // actions POST, dont la réponse est directement lisible par l'appelant.
    setup();

    const ctx = await loadCalendarActionContext(CAL_ID);

    expect(ctx).toEqual({ ok: false });
  });

  it("n'appelle jamais la RPC d'état public", async () => {
    // Miroir de `loadEventActionContext` : une action publique ne doit pas
    // reconstruire tout l'état du calendrier pour vérifier une garde — c'est
    // l'amplification de lecture qu'on refuse sur un chemin ouvert.
    await loadCalendarActionContext(CAL_ID);

    expect(db.rpcCalls).toEqual([]);
    expect(db.queries).toHaveLength(1);
  });

  it("rend l'organisation résolue en base, jamais celle passée en entrée", async () => {
    // `organizationId` sort de la LIGNE lue, pas d'un paramètre : c'est lui qui
    // scopera ensuite les écritures. Rouge s'il venait de l'appelant.
    const ctx = await loadCalendarActionContext(CAL_ID);

    expect(ctx.ok).toBe(true);
    if (!ctx.ok) throw new Error("le calendrier nominal doit être accepté");
    expect(ctx.calendarId).toBe(CAL_ID);
    expect(ctx.organizationId).toBe(ORG_ID);
    expect(ctx.admin).toBeDefined();
  });

  it("ne résout QUE par identifiant, jamais par slug", async () => {
    // Rouge si ce chargeur acceptait aussi le slug : les actions publiques
    // recevraient une clé devinable là où la page, elle, a déjà résolu l'UUID.
    const ctx = await loadCalendarActionContext(SLUG);

    expect(db.queries[0].filters).toEqual({ id: SLUG });
    expect(ctx.ok).toBe(false);
  });
});

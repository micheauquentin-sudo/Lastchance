import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// deleteWheel — LA ROUE SUPPRIMÉE EMPORTAIT LES CODES GAIN- NON RETIRÉS
//
// `participations.wheel_id` porte `on delete cascade` (00001:100), et une
// SECONDE clé composite ajoutée plus tard cascade elle aussi (00017:285-289) :
// les deux, pas une seule. Retirer une roue de la rotation d'une campagne —
// un RÉGLAGE, du point de vue du commerçant : « je retire la roue Happy
// hour » — emportait donc toutes ses participations, y compris celles dont le
// `redeem_code` est émis et le `redeemed_at` encore null. Le client se
// présentait au comptoir et la caisse répondait « code introuvable ».
//
// Le dépôt garde déjà exactement ce danger un cran au-dessus, sur
// `deleteCampaign`, avec un refus qui NOMME le chiffre. La roue, elle, ne
// portait qu'un `confirm()` navigateur qui ne nommait rien.
//
// PRINCIPE : on ne touche pas à la cascade — la retirer donnerait un 23503
// opaque au commerçant. On refuse tant qu'un lot attend, et le refus nomme le
// nombre.
//
// ── SECOND TOUR : LA GARDE ÉTAIT UN NO-OP POUR UN `editor` ──
//
// La première version comptait via le client de SESSION. Or
// `participations: owner select` (00017:98) garde par `is_org_owner`, qui
// exige STRICTEMENT `role = 'owner'` (00015:10-22), alors que supprimer la
// roue relève de `wheels: editors` (00019:71, `for all`) — un `editor` en a le
// droit. Pour lui, la RLS rendait 0 ligne : aucun chiffre, aucune case, aucune
// confirmation, et la cascade emportait tout.
//
// Le propriétaire, LUI, voyait le refus. C'est exactement pourquoi le défaut a
// survécu à une revue : le seul test qui existait montait un compte `owner`.
// Ces tests-ci montent les DEUX rôles, et le mock reproduit la RLS
// owner-only — sans quoi ils ne pourraient toujours pas voir la différence.
// ────────────────────────────────────────────────────────────

const WHEEL_ID = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN_ID = "22222222-2222-4222-8222-222222222222";

const { state } = vi.hoisted(() => ({
  state: {
    /** Rôle du membre qui clique. `editor` a le droit de supprimer la roue. */
    role: "owner" as string,
    /** Lots gagnés sur cette roue, encore non remis — la VÉRITÉ en base. */
    enAttente: 0,
    /** Le comptage échoue-t-il ? (`error` non nul côté PostgREST) */
    comptageEnPanne: false,
    /** `count: null` SANS `error` : la forme muette que `?? 0` avalait. */
    comptageMuet: false,
    /** Nombre de roues de la campagne (la garde « dernière roue »). */
    nbRoues: 2,
    /** Les suppressions réellement parties en base. */
    deletes: [] as string[],
    /** Filtres posés sur le comptage — c'est là que se joue le multi-tenant. */
    filtresComptage: [] as Array<[string, unknown]>,
    /** Quel client a réellement compté : « rls » ou « admin ». */
    comptagePar: [] as string[],
  },
}));

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
    organization: { id: "org-1" },
    role: state.role,
  })),
}));
vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/revalidate-play", () => ({ revalidatePlaySlugs: vi.fn() }));

/**
 * Comptage de `participations`, avec le résultat que rend le client donné.
 *
 * `via: "rls"` REPRODUIT `participations: owner select` : un non-propriétaire
 * ne voit aucune ligne. C'est cette simulation qui donne au test le pouvoir de
 * distinguer un `owner` d'un `editor` ; sans elle, les deux rôles rendraient le
 * même chiffre et le défaut resterait invisible, exactement comme il l'a été.
 */
function comptageParticipations(via: "rls" | "admin") {
  const visible = via === "admin" || state.role === "owner";
  const resultat = state.comptageEnPanne
    ? { count: null, error: { message: "timeout PostgREST" } }
    : state.comptageMuet
      ? { count: null, error: null }
      : { count: visible ? state.enAttente : 0, error: null };

  const c: Record<string, unknown> = {
    select: () => c,
    eq: (col: string, val: unknown) => {
      state.filtresComptage.push([col, val]);
      return c;
    },
    not: (col: string, _op: string, val: unknown) => {
      state.filtresComptage.push([col, val]);
      return c;
    },
    is: (col: string, val: unknown) => {
      state.filtresComptage.push([col, val]);
      // Le comptage se résout sur le DERNIER prédicat de la chaîne.
      if (col !== "cancelled_at") return c;
      state.comptagePar.push(via);
      return Promise.resolve(resultat);
    },
  };
  return c;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from(table: string) {
      if (table === "participations") return comptageParticipations("admin");
      throw new Error(`table inattendue au client admin : ${table}`);
    },
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from(table: string) {
      if (table === "participations") return comptageParticipations("rls");
      // `wheels` sert trois fois : la lecture de la roue, le décompte des
      // roues de la campagne, puis la suppression. On distingue par la
      // méthode réellement appelée, pas par un compteur d'appels.
      const w: Record<string, unknown> = {
        estCompte: false,
        estSuppression: false,
        select: (_cols: string, opts?: { count?: string }) => {
          w.estCompte = Boolean(opts?.count);
          return w;
        },
        delete: () => {
          w.estSuppression = true;
          return w;
        },
        eq: (col: string, val: unknown) => {
          if (w.estSuppression) {
            if (col === "id") state.deletes.push(String(val));
            return col === "organization_id"
              ? Promise.resolve({ error: null })
              : w;
          }
          if (w.estCompte && col === "campaign_id") {
            return Promise.resolve({ count: state.nbRoues, error: null });
          }
          return w;
        },
        maybeSingle: async () => ({
          data: { id: WHEEL_ID, campaign_id: CAMPAIGN_ID },
        }),
      };
      return w;
    },
  })),
}));

const { deleteWheel } = await import("./prizes");
const { WHEEL_OUTSTANDING_LOSS_HINT } = await import("@/lib/validations/prizes");
const { COMPTAGE_INDISPONIBLE } = await import("@/lib/codes-en-attente");

function form(confirme: boolean) {
  const fd = new FormData();
  fd.set("id", WHEEL_ID);
  if (confirme) fd.set("confirm_outstanding", "1");
  return fd;
}

describe("deleteWheel — les lots gagnés sur cette roue", () => {
  beforeEach(() => {
    state.role = "owner";
    state.enAttente = 0;
    state.comptageEnPanne = false;
    state.comptageMuet = false;
    state.nbRoues = 2;
    state.deletes = [];
    state.filtresComptage = [];
    state.comptagePar = [];
  });

  it("refuse tant qu'un lot de cette roue attend en caisse", async () => {
    state.enAttente = 7;
    const res = await deleteWheel(null, form(false));

    expect(res.ok).toBe(false);
    // Le refus doit NOMMER le nombre : « des lots » ne permet pas d'arbitrer,
    // 7 si — c'est ce chiffre qui fait choisir entre le ménage et le client.
    expect(res.ok === false && res.error).toContain("7");
    // Et il doit porter le MARQUEUR partagé : c'est lui, et non `!ok`, qui
    // décide de montrer la case de confirmation. Sans lui, l'écran ne la
    // proposerait jamais et la suppression deviendrait impossible.
    expect(res.ok === false && res.error).toContain(WHEEL_OUTSTANDING_LOSS_HINT);
    // Et surtout : rien n'est parti en base.
    expect(state.deletes).toEqual([]);
  });

  it("supprime quand le commerçant confirme en connaissance de cause", async () => {
    state.enAttente = 7;
    const res = await deleteWheel(null, form(true));

    expect(res.ok).toBe(true);
    expect(state.deletes).toEqual([WHEEL_ID]);
  });

  it("ne demande rien quand tous les lots ont déjà été retirés", async () => {
    // CONTRÔLE NÉGATIF DE LA GARDE : si elle se déclenchait sur le cas
    // nominal, elle transformerait un réglage banal en obstacle, et le
    // commerçant apprendrait à cocher la case sans la lire — ce qui la
    // rendrait inutile le jour où elle compte.
    const res = await deleteWheel(null, form(false));

    expect(res.ok).toBe(true);
    expect(state.deletes).toEqual([WHEEL_ID]);
  });

  it("le refus « dernière roue » ne porte PAS le marqueur", async () => {
    // CONTRÔLE NÉGATIF DU MARQUEUR : sur ce refus-là, cocher une case ne
    // changerait rien — la campagne a toujours besoin d'une roue à servir.
    // S'il portait le marqueur, l'écran présenterait une confirmation
    // destructive inutile, exactement la pédagogie que le registre des gardes
    // cherche à éviter.
    state.nbRoues = 1;
    state.enAttente = 7;
    const res = await deleteWheel(null, form(false));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).not.toContain(WHEEL_OUTSTANDING_LOSS_HINT);
    expect(state.deletes).toEqual([]);
  });

  it("compte les lots de SA roue et de SON organisation, non remis, non annulés", async () => {
    state.enAttente = 1;
    await deleteWheel(null, form(false));

    // Un comptage non scopé sur l'organisation ferait refuser la suppression à
    // cause des lots d'un AUTRE commerçant — et divulguerait au passage son
    // activité par le nombre affiché. En client ADMIN ce filtre n'est plus
    // seulement une hygiène : la RLS ne le posera pas à notre place.
    // `cancelled_at` compte aussi : un lot annulé n'est plus un engagement,
    // l'inclure gonflerait le chiffre et ferait cocher une case pour rien.
    expect(state.filtresComptage).toEqual([
      ["wheel_id", WHEEL_ID],
      ["organization_id", "org-1"],
      ["redeem_code", null],
      ["redeemed_at", null],
      ["cancelled_at", null],
    ]);
  });
});

describe("deleteWheel — la garde vaut pour l'ÉDITEUR, pas seulement le propriétaire", () => {
  beforeEach(() => {
    state.role = "editor";
    state.enAttente = 0;
    state.comptageEnPanne = false;
    state.comptageMuet = false;
    state.nbRoues = 2;
    state.deletes = [];
    state.filtresComptage = [];
    state.comptagePar = [];
  });

  it("un ÉDITEUR obtient le même refus chiffré qu'un propriétaire", async () => {
    // LE TEST QUI MANQUAIT. Compté via le client de session, ce cas rendait
    // `count = 0` — `is_org_owner` exige `role = 'owner'` — donc aucune
    // confirmation, et 7 codes GAIN- détruits en silence par quelqu'un qui
    // avait parfaitement le droit de cliquer.
    state.enAttente = 7;
    const res = await deleteWheel(null, form(false));

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("7");
    expect(res.ok === false && res.error).toContain(WHEEL_OUTSTANDING_LOSS_HINT);
    expect(state.deletes).toEqual([]);
  });

  it("le comptage passe par le client ADMIN, jamais par la RLS", async () => {
    // La propriété structurelle, épinglée : c'est le CHOIX DU CLIENT qui rend
    // la garde vraie pour les deux rôles. Compter sous RLS la rendrait à
    // nouveau owner-only, et le test précédent rougirait pour une raison qu'on
    // ne verrait pas ici.
    state.enAttente = 3;
    await deleteWheel(null, form(false));

    expect(state.comptagePar).toEqual(["admin"]);
  });

  it("un ÉDITEUR supprime bien quand il confirme, et quand rien n'attend", async () => {
    // CONTRÔLE NÉGATIF DU CONTRÔLE DE RÔLE : l'`editor` a le droit de
    // supprimer la roue (`wheels: editors`, 00019:71). Si la ligne de rôle
    // neuve l'excluait, on aurait fermé un droit légitime en croyant fermer
    // une fuite.
    state.enAttente = 7;
    expect((await deleteWheel(null, form(true))).ok).toBe(true);

    state.enAttente = 0;
    state.deletes = [];
    expect((await deleteWheel(null, form(false))).ok).toBe(true);
    expect(state.deletes).toEqual([WHEEL_ID]);
  });

  it("un CAISSIER est refusé avant tout comptage", async () => {
    // Le contrôle de rôle explicite : `cashier` n'a pas `wheels: editors`. Le
    // refus tombe AVANT de contourner la RLS — on ne fait pas une lecture
    // privilégiée pour quelqu'un qui n'ira nulle part.
    state.role = "cashier";
    state.enAttente = 7;
    const res = await deleteWheel(null, form(true));

    expect(res.ok).toBe(false);
    expect(state.comptagePar).toEqual([]);
    expect(state.deletes).toEqual([]);
  });
});

describe("deleteWheel — le comptage qui échoue ne vaut PAS « zéro »", () => {
  beforeEach(() => {
    state.role = "owner";
    state.enAttente = 12;
    state.comptageEnPanne = false;
    state.comptageMuet = false;
    state.nbRoues = 2;
    state.deletes = [];
    state.filtresComptage = [];
    state.comptagePar = [];
  });

  it("une erreur de comptage refuse, SANS proposer de case à cocher", async () => {
    state.comptageEnPanne = true;
    const res = await deleteWheel(null, form(false));

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toBe(COMPTAGE_INDISPONIBLE);
    // Pas de marqueur : cocher une case qu'aucun chiffre n'accompagne
    // n'apprendrait au commerçant qu'à cocher sans lire.
    expect(res.ok === false && res.error).not.toContain(
      WHEEL_OUTSTANDING_LOSS_HINT,
    );
    expect(state.deletes).toEqual([]);
  });

  it("une case DÉJÀ cochée ne force pas une suppression non vérifiée", async () => {
    // Le point le plus fin : la confirmation porte sur un chiffre qu'on n'a
    // jamais réussi à lire. La cocher ne peut pas être un consentement éclairé.
    state.comptageEnPanne = true;
    const res = await deleteWheel(null, form(true));

    expect(res.ok).toBe(false);
    expect(state.deletes).toEqual([]);
  });

  it("un `count: null` MUET refuse aussi — c'est la forme que `?? 0` avalait", async () => {
    state.comptageMuet = true;
    const res = await deleteWheel(null, form(false));

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toBe(COMPTAGE_INDISPONIBLE);
    expect(state.deletes).toEqual([]);
  });
});

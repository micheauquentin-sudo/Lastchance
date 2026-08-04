import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// DEUX CÂBLAGES D'ORDRE — le solde doit courir APRÈS la destruction
//
// Les deux RPC soldées ici (`resync_calendar_progress`,
// `settle_hunt_completions`) réparent la même forme de défaut : un état
// dérivé n'est calculé qu'au moment du geste du JOUEUR, alors que le
// COMMERÇANT peut changer le dénominateur entre deux gestes. Le joueur se
// retrouve alors soit crédité de ce qu'il n'a pas fait, soit complet sans
// personne pour le constater.
//
// Ce fichier ne teste PAS ce que font les RPC — c'est le travail des suites
// pgTAP, seules capables de le prouver contre un vrai Postgres. Il teste ce
// que les tests SQL ne peuvent pas voir : **quand** l'action les appelle, et
// ce qu'elle fait quand elles échouent.
//
// Les harnais voisins (`calendar.day-loss`, `hunts.step-delete`) ne
// traversent pas cette branche : leur bouchon rend une grille vide, donc
// `removable` reste vide et l'appel n'a jamais lieu. Ils passent sans
// exécuter le code — d'où ce fichier.
// ────────────────────────────────────────────────────────────

const CALENDAR_ID = "00000000-0000-4000-8000-0000000000c9";
const HUNT_ID = "00000000-0000-4000-8000-0000000000h9".replace(/h/g, "a");

const { state } = vi.hoisted(() => ({
  state: {
    /** Cases DÉJÀ en base, avec leur index. */
    casesExistantes: [] as Array<{ id: string; day_index: number }>,
    /** Nombre de cases demandé par le formulaire. */
    nouveauNombre: 15,
    /** Suppressions réellement parties. */
    suppressions: [] as string[][],
    /** Appels RPC, dans l'ORDRE — c'est tout l'objet du test. */
    rpc: [] as Array<{ nom: string; args: Record<string, unknown> }>,
    /** La RPC doit-elle échouer ? */
    rpcEchoue: false,
    /** Statut demandé à `setHuntStatus`. */
    statutEcrit: null as string | null,
    role: "owner" as string,
    addonHunts: true,
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
    organization: {
      id: "org-1",
      addon_hunts: state.addonHunts,
      subscription_status: "active",
      trial_ends_at: "2099-01-01T00:00:00Z",
      past_due_since: null,
      comp_access: false,
      comp_access_until: null,
    },
    role: state.role,
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/monitoring", () => ({
  reportError: vi.fn(),
  monitored: (_n: string, f: unknown) => f,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: (nom: string, args: Record<string, unknown>) => {
      state.rpc.push({ nom, args });
      // `hunts.status` n'est plus écrivable par `authenticated` (migration
      // 20260905120000) : l'écriture du statut EST une RPC désormais. Elle
      // reste distincte du solde, et `rpcEchoue` ne la touche pas — c'est
      // l'échec du SOLDE que ce fichier éprouve, pas celui de la transition.
      if (nom === "set_hunt_status") {
        state.statutEcrit = String(args.p_status);
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve(
        state.rpcEchoue
          ? { data: null, error: { message: "boom" } }
          : { data: 0, error: null },
      );
    },
    from(table: string) {
      if (table === "calendars") {
        // `eq` rend TOUJOURS la chaîne : la rendre terminale sur
        // `organization_id` coupait la lecture avant son `.maybeSingle()`.
        // C'est `then` qui rend la chaîne awaitable pour l'UPDATE.
        const c: Record<string, unknown> = {
          select: () => c,
          update: () => c,
          eq: () => c,
          maybeSingle: () =>
            Promise.resolve({
              data: {
                start_date: "2026-12-01",
                day_count: 24,
                timezone: "Europe/Paris",
              },
              error: null,
            }),
          then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
            Promise.resolve({ data: null, error: null }).then(ok, ko),
        };
        return c;
      }
      if (table === "calendar_openings") {
        // Aucune ouverture : la garde de perte de cases laisse passer sans
        // confirmation, et le test porte alors sur le SEUL recomptage.
        // Chaîne entièrement permissive : la garde de perte de cases pose des
        // filtres qui varient (`in`, `is`, `not`) selon lequel des deux
        // comptages elle construit. Ce fichier ne teste pas la garde — elle a
        // son propre harnais — mais le RECOMPTAGE qui la suit.
        const c: Record<string, unknown> = {
          select: () => c,
          eq: () => c,
          in: () => c,
          is: () => c,
          not: () => c,
          then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
            Promise.resolve({ count: 0, error: null }).then(ok, ko),
        };
        return c;
      }
      if (table === "calendar_days") {
        const c: Record<string, unknown> = {
          select: () => c,
          update: () => c,
          insert: () => Promise.resolve({ error: null }),
          delete: () => c,
          in: (_col: string, ids: string[]) => {
            state.suppressions.push(ids);
            return c;
          },
          eq: () => c,
          // Le `.gt("day_index", …)` de la garde : les cases condamnées.
          gt: () =>
            Promise.resolve({
              data: state.casesExistantes
                .filter((d) => d.day_index > state.nouveauNombre)
                .map((d) => ({ id: d.id })),
              error: null,
            }),
          // Le `select` NU de syncCalendarDays : toutes les cases en base.
          then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
            Promise.resolve({ data: state.casesExistantes, error: null }).then(
              ok,
              ko,
            ),
        };
        return c;
      }
      if (table === "hunts") {
        // Plus aucun `.update()` ici : le statut passe par `set_hunt_status`.
        // Cette table n'est plus lue que pour la garde « le lot final est
        // renseigné », qui court AVANT la transition.
        const c: Record<string, unknown> = {
          select: () => c,
          eq: () => c,
          maybeSingle: () =>
            Promise.resolve({
              data: { id: HUNT_ID, reward_label: "Panier garni" },
              error: null,
            }),
        };
        return c;
      }
      // hunt_steps : comptage pour la garde « au moins 2 étapes ».
      const c: Record<string, unknown> = {
        select: () => c,
        eq: (col: string) =>
          col === "organization_id" ? Promise.resolve({ count: 5 }) : c,
      };
      return c;
    },
  })),
}));

const calendrier = await import("./calendar");
const chasse = await import("./hunts");

function statusForm(statut: string) {
  const fd = new FormData();
  fd.set("id", HUNT_ID);
  fd.set("status", statut);
  return fd;
}

function calendarForm(dayCount: number) {
  state.nouveauNombre = dayCount;
  const fd = new FormData();
  fd.set("id", CALENDAR_ID);
  fd.set("name", "Calendrier de l'Avent");
  fd.set("theme", "noel");
  fd.set("start_date", "2026-12-01");
  fd.set("timezone", "Europe/Paris");
  fd.set("day_count", String(dayCount));
  fd.set("public_slug", "avent-2026");
  fd.set("merchant_content", "");
  fd.set("completion_reward_label", "Un bon de 20 €");
  fd.set("completion_reward_details", "");
  fd.set("completion_reward_stock", "10");
  return fd;
}

describe("le compteur du calendrier est recompté après une réduction", () => {
  beforeEach(() => {
    state.casesExistantes = Array.from({ length: 24 }, (_, i) => ({
      id: `case-${i + 1}`,
      day_index: i + 1,
    }));
    state.suppressions = [];
    state.rpc = [];
    state.rpcEchoue = false;
    state.role = "owner";
  });

  it("réduire la grille : le recomptage part APRÈS la suppression", async () => {
    const res = await calendrier.updateCalendar(null, calendarForm(15));

    expect(res.ok).toBe(true);
    // Les neuf cases condamnées sont bien parties…
    expect(state.suppressions).toHaveLength(1);
    expect(state.suppressions[0]).toHaveLength(9);
    // …et le recomptage a suivi, sur le bon calendrier.
    expect(state.rpc).toEqual([
      { nom: "resync_calendar_progress", args: { p_calendar_id: CALENDAR_ID } },
    ]);
  });

  it("agrandir la grille ne déclenche AUCUN recomptage", async () => {
    // CONTRÔLE NÉGATIF DU DÉCLENCHEUR : une grille qu'on agrandit ne perd
    // aucune ouverture. Payer l'aller-retour là aussi ne corrigerait rien et
    // masquerait, dans les journaux, les cas où il compte vraiment.
    const res = await calendrier.updateCalendar(null, calendarForm(31));

    expect(res.ok).toBe(true);
    expect(state.suppressions).toEqual([]);
    expect(state.rpc).toEqual([]);
  });

  it("un recomptage en échec ne fait pas échouer la réduction", async () => {
    // Les cases sont DÉJÀ supprimées quand la RPC part. Refuser la mise à
    // jour de la grille parce que le recomptage a raté laisserait le
    // commerçant devant un écran qui ment sur ce qui vient de se passer.
    state.rpcEchoue = true;

    const res = await calendrier.updateCalendar(null, calendarForm(15));

    expect(res.ok).toBe(true);
    expect(state.rpc).toHaveLength(1);
  });
});

describe("la chasse solde ses complétions à la réactivation", () => {
  beforeEach(() => {
    state.rpc = [];
    state.rpcEchoue = false;
    state.statutEcrit = null;
    state.role = "owner";
    state.addonHunts = true;
  });

  it("passer la chasse en actif solde les joueurs devenus complets", async () => {
    // Le durcissement de `settle_hunt_completions` (elle porte désormais les
    // gardes d'addon, de statut et de fenêtre) a créé ce trou : retirer une
    // étape PENDANT que la chasse est en brouillon ne solde plus personne.
    // La réactivation est le moment où le solde redevient légitime.
    const res = await chasse.setHuntStatus(null, statusForm("active"));

    expect(res.ok).toBe(true);
    // L'ORDRE EST L'OBJET DU TEST, et il s'est renforcé : le solde ne part pas
    // seulement après l'écriture du statut, il part après une transition que la
    // base a ACCEPTÉE. Une chasse refusée à la publication ne solde plus rien.
    expect(state.rpc).toEqual([
      {
        nom: "set_hunt_status",
        args: {
          p_organization_id: "org-1",
          p_hunt_id: HUNT_ID,
          p_status: "active",
        },
      },
      { nom: "settle_hunt_completions", args: { p_hunt_id: HUNT_ID } },
    ]);
  });

  it("passer la chasse en brouillon ne solde RIEN", async () => {
    // CONTRÔLE NÉGATIF : solder en sortie d'activité rouvrirait exactement
    // l'émission massive que les quatre gardes viennent de fermer.
    const res = await chasse.setHuntStatus(null, statusForm("draft"));

    expect(res.ok).toBe(true);
    expect(state.rpc.map((appel) => appel.nom)).toEqual(["set_hunt_status"]);
  });

  it("un solde en échec ne bloque pas la réactivation", async () => {
    // Le statut est déjà écrit. Refuser de rouvrir sa chasse parce qu'un
    // solde a raté serait une punition sans rapport : il se rejouera à la
    // réactivation suivante ou au prochain scan.
    state.rpcEchoue = true;

    const res = await chasse.setHuntStatus(null, statusForm("active"));

    expect(res.ok).toBe(true);
    expect(state.statutEcrit).toBe("active");
  });
});

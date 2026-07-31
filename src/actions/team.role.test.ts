import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// updateTeamMemberRole / inviteTeamMember — LE RÔLE QU'ON NE POUVAIT PAS CHANGER
//
// Marie est invitée en « Caisse uniquement ». Le propriétaire veut la passer
// « Campagnes et caisse ». Il n'existait AUCUN bouton pour cela — ni action, ni
// policy : `organization_members` n'accorde à `authenticated` que `select` et
// `delete`. Le seul contournement, ré-inviter Marie avec le nouveau rôle, ne
// faisait RIEN : `accept_team_invitation` insère `on conflict do nothing`
// (00015:91-93). Marie lisait « Bienvenue dans l'équipe », le propriétaire
// voyait son invitation acceptée, et le rôle restait `cashier`. La
// RÉTROGRADATION échouait tout autant, ce qui est le sens le plus grave :
// l'éditeur qu'on croyait ramené à la caisse gardait `is_org_editor`.
//
// Deux gestes ici : une action de changement de rôle bornée au propriétaire
// (et refusant de dégrader le dernier), et une invitation qui REFUSE plutôt
// que d'annoncer un succès qu'elle ne produit pas.
// ────────────────────────────────────────────────────────────

const MARIE = "00000000-0000-4000-8000-0000000000b1";

const { state } = vi.hoisted(() => ({
  state: {
    role: "owner" as string,
    /** Membres renvoyés par `org_team_members`.
     *  NB : `vi.hoisted` tourne AVANT les `const` du module — on inline le
     *  littéral de MARIE ici (il n'est pas encore initialisé). */
    membres: [
      { user_id: "00000000-0000-4000-8000-0000000000b0", email: "patron@exemple.fr", role: "owner" },
      {
        user_id: "00000000-0000-4000-8000-0000000000b1",
        email: "marie@exemple.fr",
        role: "cashier",
      },
    ] as Array<{ user_id: string; email: string; role: string }>,
    /** Erreur simulée de la RPC de changement de rôle. */
    rpcError: null as { message: string } | null,
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    /** Invitations réellement insérées. */
    invitations: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/auth", () => ({
  getUserAndOrg: vi.fn(async () => ({
    user: { id: "00000000-0000-4000-8000-0000000000b0", email: "patron@exemple.fr" },
    organization: { id: "org-1", name: "Ma boutique" },
    role: state.role,
  })),
}));
vi.mock("@/lib/active-organization-cookie", () => ({
  setActiveOrganizationCookie: vi.fn(),
}));
vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/resend", () => ({
  sendTeamInviteEmail: vi.fn(async () => true),
}));
vi.mock("@/lib/team-invite", () => ({
  signInviteToken: () => "jeton",
  verifyInviteToken: () => null,
}));
vi.mock("@/lib/env", () => ({ APP_URL: "https://exemple.test" }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      if (name === "org_team_members") {
        return Promise.resolve({ data: state.membres, error: null });
      }
      return Promise.resolve({ data: null, error: state.rpcError });
    },
    from(table: string) {
      if (table === "team_invitations") {
        const chaine: Record<string, unknown> = {
          insert: (row: Record<string, unknown>) => {
            state.invitations.push(row);
            return chaine;
          },
          select: () => chaine,
          single: () => Promise.resolve({ data: { id: "inv-1" }, error: null }),
        };
        return chaine;
      }
      throw new Error(`table inattendue: ${table}`);
    },
  })),
}));

const { inviteTeamMember, updateTeamMemberRole } = await import("./team");

function roleForm(userId: string, role: string) {
  const fd = new FormData();
  fd.set("userId", userId);
  fd.set("role", role);
  return fd;
}

function inviteForm(email: string, role = "editor") {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("role", role);
  return fd;
}

beforeEach(() => {
  state.role = "owner";
  state.membres = [
    { user_id: "00000000-0000-4000-8000-0000000000b0", email: "patron@exemple.fr", role: "owner" },
    { user_id: MARIE, email: "marie@exemple.fr", role: "cashier" },
  ];
  state.rpcError = null;
  state.rpcCalls = [];
  state.invitations = [];
});

describe("updateTeamMemberRole — le chemin qui manquait", () => {
  it("le propriétaire promeut un caissier en éditeur", async () => {
    const res = await updateTeamMemberRole(null, roleForm(MARIE, "editor"));

    expect(res.ok).toBe(true);
    expect(state.rpcCalls).toEqual([
      {
        name: "set_team_member_role",
        // Le tenant vient de la SESSION, jamais du formulaire : un userId
        // volé ne peut pas désigner le membre d'une autre organisation.
        args: {
          p_organization_id: "org-1",
          p_user_id: MARIE,
          p_role: "editor",
        },
      },
    ]);
  });

  it("rétrograde aussi — c'est le sens que l'invitation ne savait pas faire", async () => {
    const res = await updateTeamMemberRole(null, roleForm(MARIE, "cashier"));

    expect(res.ok).toBe(true);
    expect(state.rpcCalls[0].args).toMatchObject({ p_role: "cashier" });
  });

  it("un éditeur ne change le rôle de personne", async () => {
    state.role = "editor";

    const res = await updateTeamMemberRole(null, roleForm(MARIE, "editor"));

    expect(res.ok).toBe(false);
    // Le refus tombe AVANT la RPC : la borne SQL est un filet, pas le seul mur.
    expect(state.rpcCalls).toEqual([]);
  });

  it("refuse 'owner' comme cible sans même appeler la base", async () => {
    // Promouvoir quelqu'un propriétaire lui donnerait le droit de retirer le
    // propriétaire d'origine : autre décision, autres garde-fous.
    const res = await updateTeamMemberRole(null, roleForm(MARIE, "owner"));

    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toEqual([]);
  });

  it("explique le refus quand la base protège le DERNIER propriétaire", async () => {
    state.rpcError = { message: 'raise exception "last owner"' };

    const res = await updateTeamMemberRole(null, roleForm("00000000-0000-4000-8000-0000000000b0", "cashier"));

    expect(res.ok).toBe(false);
    // Le message doit dire POURQUOI : « Changement impossible » enverrait le
    // propriétaire réessayer, ou pire, retirer puis ré-inviter — geste qui
    // détruirait l'organisation.
    if (!res.ok) expect(res.error).toContain("seul propriétaire");
  });
});

describe("inviteTeamMember — l'invitation qui mentait", () => {
  it("refuse de ré-inviter un membre existant, et nomme son accès actuel", async () => {
    const res = await inviteTeamMember(null, inviteForm("marie@exemple.fr"));

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("Caisse uniquement");
      expect(res.error).toContain("liste des membres");
    }
    // Rien n'est créé, donc aucun email trompeur ne part.
    expect(state.invitations).toEqual([]);
  });

  it("invite normalement quelqu'un qui n'est pas encore de l'équipe", async () => {
    // CONTRÔLE NÉGATIF DE LA GARDE : si elle se déclenchait aussi ici, plus
    // aucun collègue ne pourrait être invité.
    const res = await inviteTeamMember(null, inviteForm("nouveau@exemple.fr"));

    expect(res.ok).toBe(true);
    expect(state.invitations).toHaveLength(1);
    expect(state.invitations[0]).toMatchObject({
      organization_id: "org-1",
      email: "nouveau@exemple.fr",
      role: "editor",
    });
  });

  it("la comparaison d'adresse ignore la casse", async () => {
    // Le schéma abaisse la saisie ; la liste vient de auth.users, qui peut
    // porter une majuscule. Comparer brut rouvrirait le défaut en entier.
    state.membres = [
      { user_id: MARIE, email: "Marie@Exemple.FR", role: "editor" },
    ];

    const res = await inviteTeamMember(null, inviteForm("marie@exemple.fr"));

    expect(res.ok).toBe(false);
    expect(state.invitations).toEqual([]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

/* ════════════════════════════════════════════════════════════
 * updateOrganizationSocialLinks — CE QU'UNE ORGANISATION A LE DROIT DE FAIRE
 * OUVRIR À UN JOUEUR ANONYME
 *
 * Cette action écrit trois colonnes dont le contenu part, tel quel, dans un
 * lien cliquable rendu sur /play — page publique, visiteur anonyme, aucune
 * session. Deux propriétés seulement comptent, et elles sont écrites dans cet
 * ordre parce que c'est leur ordre de COÛT :
 *
 *   1. AUCUNE ÉCRITURE SANS LE DROIT. L'écriture passe par le `service_role`
 *      (`authenticated` n'a AUCUN privilège UPDATE sur `organizations`) : la
 *      garde `owner` de l'action est donc le SEUL contrôle qui existe. Il n'y a
 *      pas de RLS derrière pour rattraper, et c'est ce qui rend ce test-là plus
 *      important que tous les autres du fichier.
 *   2. AUCUN DOMAINE HORS LISTE BLANCHE. Un `https://` valide suffirait sinon à
 *      faire de la page du commerce un relais de redirection — avec sa caution
 *      visuelle. Le piège nommé est `instagram.com.evil.com`, qui CONTIENT le
 *      domaine autorisé sans lui appartenir.
 * ════════════════════════════════════════════════════════════ */

const ORG_ID = "00000000-0000-4000-8000-0000000000b1";

const { state, redirectMock } = vi.hoisted(() => ({
  state: {
    /** Le demandeur est-il propriétaire ? Sinon la garde rejette. */
    estProprietaire: true,
    /** Écritures réellement parvenues à la base — vide sur chaque refus. */
    ecritures: [] as Array<{
      table: string;
      payload: Record<string, unknown>;
      filtres: Record<string, unknown>;
    }>,
    /** Erreur simulée côté base. */
    erreur: null as { message: string } | null,
    /** Purges ISR demandées, pour prouver que /play est bien invalidé. */
    purges: [] as Array<{ organizationId?: string; campaignId?: string }>,
    /** Chemins revalidés côté dashboard. */
    chemins: [] as string[],
    reset() {
      state.estProprietaire = true;
      state.ecritures = [];
      state.erreur = null;
      state.purges = [];
      state.chemins = [];
    },
  },
  redirectMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));

vi.mock("@/lib/auth", () => ({ getUserAndOrg: vi.fn() }));
vi.mock("@/lib/active-organization-cookie", () => ({
  setActiveOrganizationCookie: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({
  requireOrganizationOwner: vi.fn(async () => {
    // Le vrai redirige un éditeur ou un caissier vers /dashboard, ce qui LÈVE
    // en Next. Le simuler ici prouve qu'aucune écriture n'a lieu au-delà.
    if (!state.estProprietaire) throw new Error("FORBIDDEN");
    return { user: { id: "user-1" }, organization: { id: ORG_ID } };
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      const appel = {
        table,
        payload: {} as Record<string, unknown>,
        filtres: {} as Record<string, unknown>,
      };
      const builder = {
        update(payload: Record<string, unknown>) {
          appel.payload = payload;
          state.ecritures.push(appel);
          return builder;
        },
        eq(colonne: string, valeur: unknown) {
          appel.filtres[colonne] = valeur;
          return builder;
        },
        then: (
          onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) =>
          Promise.resolve({ data: null, error: state.erreur }).then(
            onFulfilled,
            onRejected,
          ),
      };
      return builder;
    },
  }),
}));

vi.mock("@/lib/revalidate-play", () => ({
  revalidatePlaySlugs: (
    _client: unknown,
    filtre: { organizationId?: string; campaignId?: string },
  ) => {
    state.purges.push(filtre);
    return Promise.resolve();
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (chemin: string) => {
    state.chemins.push(chemin);
  },
}));

vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));

import { updateOrganizationSocialLinks } from "./organizations";

/** Formulaire de la carte : les TROIS champs sont toujours postés ensemble. */
function form(over: Partial<Record<string, string>> = {}): FormData {
  const fd = new FormData();
  fd.set("google_review_url", over.google_review_url ?? "");
  fd.set("instagram_url", over.instagram_url ?? "");
  fd.set("tiktok_url", over.tiktok_url ?? "");
  return fd;
}

afterEach(() => {
  state.reset();
  vi.clearAllMocks();
});

// ────────────────────────────────────────────────────────────
// 1 — le droit d'écrire
// ────────────────────────────────────────────────────────────
describe("updateOrganizationSocialLinks — qui a le droit d'écrire", () => {
  it("le propriétaire écrit, sur SON organisation et pas une autre", async () => {
    const res = await updateOrganizationSocialLinks(
      null,
      form({
        google_review_url: "https://g.page/r/CxAbCdEf/review",
        instagram_url: "https://www.instagram.com/chez-marcel",
        tiktok_url: "https://tiktok.com/@chezmarcel",
      }),
    );

    expect(res.ok).toBe(true);
    expect(state.ecritures).toHaveLength(1);
    expect(state.ecritures[0].table).toBe("organizations");
    expect(state.ecritures[0].filtres).toEqual({ id: ORG_ID });
    expect(state.ecritures[0].payload).toEqual({
      google_review_url: "https://g.page/r/CxAbCdEf/review",
      instagram_url: "https://www.instagram.com/chez-marcel",
      tiktok_url: "https://tiktok.com/@chezmarcel",
    });
  });

  it("un éditeur ou un caissier n'écrit RIEN", async () => {
    // Le service_role contourne la RLS : cette garde est le seul contrôle.
    state.estProprietaire = false;

    await expect(
      updateOrganizationSocialLinks(
        null,
        form({ instagram_url: "https://www.instagram.com/chez-marcel" }),
      ),
    ).rejects.toThrow("FORBIDDEN");

    expect(state.ecritures).toEqual([]);
  });

  it("purge /play pour TOUTE l'organisation, pas pour une campagne", async () => {
    // Le lien est org-wide : il apparaît sur toutes les pages de la maison.
    await updateOrganizationSocialLinks(
      null,
      form({ tiktok_url: "https://tiktok.com/@chezmarcel" }),
    );

    expect(state.purges).toEqual([{ organizationId: ORG_ID }]);
    expect(state.chemins).toContain("/dashboard");
    expect(state.chemins).toContain("/dashboard/settings");
  });

  it("une erreur de base ne se raconte pas comme un succès", async () => {
    state.erreur = { message: "boom" };

    const res = await updateOrganizationSocialLinks(
      null,
      form({ tiktok_url: "https://tiktok.com/@chezmarcel" }),
    );

    expect(res.ok).toBe(false);
    expect(state.purges).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────
// 2 — la liste blanche d'hôtes
// ────────────────────────────────────────────────────────────
describe("updateOrganizationSocialLinks — liste blanche d'hôtes", () => {
  /** Un refus doit être TOTAL : message ET aucune écriture. */
  async function refuse(champ: string, valeur: string) {
    const res = await updateOrganizationSocialLinks(
      null,
      form({ [champ]: valeur }),
    );
    expect(res.ok, `${valeur} aurait dû être refusé`).toBe(false);
    expect(state.ecritures, `${valeur} a été écrit malgré le refus`).toEqual([]);
    state.reset();
  }

  it("refuse un domaine hors liste", async () => {
    await refuse("google_review_url", "https://evil.com/avis");
  });

  it("refuse un domaine qui CONTIENT un domaine autorisé", async () => {
    // Le piège que la comparaison par suffixe de point existe pour fermer :
    // `instagram.com.evil.com` appartient à `evil.com`.
    await refuse("instagram_url", "https://instagram.com.evil.com/chez-marcel");
    await refuse("tiktok_url", "https://tiktok.com.evil.com/@chezmarcel");
    // Et sans le point non plus : `xinstagram.com` n'est pas Instagram.
    await refuse("instagram_url", "https://xinstagram.com/chez-marcel");
  });

  it("refuse les identifiants dans l'URL", async () => {
    // Ils masquent l'hôte réel dans la barre d'adresse du joueur (patron
    // `lib/webhook-url.ts`).
    await refuse("instagram_url", "https://qui:quoi@instagram.com/chez-marcel");
    await refuse("instagram_url", "https://instagram.com@evil.com/x");
  });

  it("refuse ce qui n'est pas https", async () => {
    await refuse("instagram_url", "http://www.instagram.com/chez-marcel");
    await refuse("instagram_url", "javascript:alert(1)");
    await refuse("instagram_url", "pas une url");
  });

  it("refuse un lien plus long que la colonne (300)", async () => {
    await refuse(
      "instagram_url",
      `https://www.instagram.com/${"a".repeat(300)}`,
    );
  });

  it("accepte un sous-domaine du domaine autorisé", async () => {
    const res = await updateOrganizationSocialLinks(
      null,
      form({ instagram_url: "https://www.instagram.com/monbar" }),
    );

    expect(res.ok).toBe(true);
    expect(state.ecritures[0].payload.instagram_url).toBe(
      "https://www.instagram.com/monbar",
    );
  });

  it("refuse un port", async () => {
    // `https://instagram.com:1` n'est pas une adresse qu'Instagram sert.
    await refuse("instagram_url", "https://instagram.com:1/x");
  });

  it("accepte les quatre formes de lien d'avis Google", async () => {
    // Google distribue son lien d'avis sous plusieurs domaines : les refuser
    // ferait échouer le réglage le plus demandé par les commerçants.
    for (const lien of [
      "https://g.page/r/CxAbCdEf/review",
      "https://search.google.com/local/writereview?placeid=Ch1",
      "https://www.google.com/maps/place/Chez+Marcel",
      "https://maps.app.goo.gl/AbCdEf",
    ]) {
      const res = await updateOrganizationSocialLinks(
        null,
        form({ google_review_url: lien }),
      );
      expect(res.ok, `${lien} aurait dû être accepté`).toBe(true);
      state.reset();
    }
  });

  it("accepte les profils sociaux, sous-domaine ou non", async () => {
    for (const [champ, lien] of [
      ["instagram_url", "https://www.instagram.com/monbar"],
      ["tiktok_url", "https://www.tiktok.com/@monbar"],
    ] as const) {
      const res = await updateOrganizationSocialLinks(
        null,
        form({ [champ]: lien }),
      );
      expect(res.ok, `${lien} aurait dû être accepté`).toBe(true);
      state.reset();
    }
  });

  it("refuse le RESTE de google.com, où l'on héberge ce qu'on veut", async () => {
    // Le cœur du resserrement. Un suffixe `google.com` laissait un propriétaire
    // de tenant servir aux joueurs, sous la tuile « ⭐ Donnez votre avis — Sur
    // Google », une page qu'il compose lui-même ou une redirection ouverte :
    //   · sites.google.com  — pages librement composées (faux formulaire) ;
    //   · /url?q= et /amp/s/ — redirecteurs vers n'importe quelle destination ;
    //   · accounts.google.com — un écran de connexion.
    await refuse("google_review_url", "https://sites.google.com/view/x");
    await refuse("google_review_url", "https://www.google.com/url?q=https://evil");
    await refuse("google_review_url", "https://www.google.com/amp/s/evil");
    await refuse("google_review_url", "https://accounts.google.com/signin");
  });

  it("refuse goo.gl hors de l'hôte EXACT maps.app.goo.gl", async () => {
    // Le suffixe acceptait `sub.evil.goo.gl` ; et `goo.gl` nu est un
    // raccourcisseur généraliste, dont la destination n'appartient pas au
    // commerce.
    await refuse("google_review_url", "https://sub.evil.goo.gl");
    await refuse("google_review_url", "https://goo.gl/xyz");
  });

  it("refuse g.co, retiré de la liste", async () => {
    // `g.co/kgs/…` raccourcit une fiche du Knowledge Graph, pas un lien d'avis,
    // et `g.co` est le raccourcisseur Google généraliste.
    await refuse("google_review_url", "https://g.co/kgs/AbCdEf");
  });
});

// ────────────────────────────────────────────────────────────
// 3 — l'effacement
// ────────────────────────────────────────────────────────────
describe("updateOrganizationSocialLinks — effacer un lien", () => {
  it("'' efface : la colonne reçoit '', jamais null ni l'omission", async () => {
    // La colonne n'a pas de `null` concurrent — '' EST « non renseigné ». Une
    // omission laisserait l'ancien lien en place et le commerçant croirait
    // l'avoir retiré.
    const res = await updateOrganizationSocialLinks(
      null,
      form({ instagram_url: "https://www.instagram.com/monbar" }),
    );

    expect(res.ok).toBe(true);
    expect(state.ecritures[0].payload).toEqual({
      google_review_url: "",
      instagram_url: "https://www.instagram.com/monbar",
      tiktok_url: "",
    });
  });

  it("les espaces seuls valent un effacement, pas un lien invalide", async () => {
    const res = await updateOrganizationSocialLinks(
      null,
      form({ tiktok_url: "   " }),
    );

    expect(res.ok).toBe(true);
    expect(state.ecritures[0].payload.tiktok_url).toBe("");
  });
});

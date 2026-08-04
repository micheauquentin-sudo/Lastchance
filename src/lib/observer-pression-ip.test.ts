import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `observerPressionIp` — LE CHEMIN UNIQUE D'UNE IP VERS UN COMPTEUR.
 *
 * ── CE FICHIER EXISTE PARCE QU'UN CONTRÔLE NÉGATIF A PARLÉ ──────────
 *
 * Dix-neuf sites ont été migrés vers ce helper avant que ce fichier existe.
 * En neutralisant son étiquetage — `pressionParIp(...)` remplacé par un objet
 * qui reverse l'IP brute, c'est-à-dire le défaut d'origine restauré — la suite
 * rendait **210 verts et 0 rouge**. Le helper concentrait la règle de tout le
 * dépôt et n'était gardé par rien : exactement la classe de défaut que ce
 * dépôt se reproche, reproduite en la corrigeant.
 *
 * ── POURQUOI UN FICHIER SÉPARÉ DE `request-ip.test.ts` ──────────────
 *
 * Il faut doubler `@/lib/rate-limit` pour observer ce qui sort du helper, et
 * `request-ip.test.ts` teste `clientIpFromHeaders` — qui n'a rien à voir avec
 * les seaux. Mocker le module de rate-limit pour tout ce fichier ferait porter
 * un doublage à des tests qui ne le demandent pas.
 */

const appels: Array<{
  bucket: string;
  rule: { limit: number; windowSeconds: number };
  event: string;
  extra: Record<string, unknown>;
}> = [];

vi.mock("@/lib/rate-limit", () => ({
  rateLimitBucket: (...parts: Array<string | number>) => parts.join(":"),
  observeSharedKey: async (
    bucket: string,
    rule: { limit: number; windowSeconds: number },
    event: string,
    extra: Record<string, unknown> = {},
  ) => {
    appels.push({ bucket, rule, event, extra });
  },
}));

const { observerPressionIp } = await import("@/lib/request-ip");
const { ETIQUETTE_IP_NON_MESUREE, IP_CLIENT_INCONNUE } = await import(
  "@/lib/request-ip"
);

const REGLE = { limit: 40, windowSeconds: 60 };

beforeEach(() => {
  appels.length = 0;
});

describe("observerPressionIp — ce qui part réellement au compteur", () => {
  it("une IP MESURÉE produit la clé d'avant migration, au caractère près", async () => {
    await observerPressionIp(
      ["quiz:public:ip", "quiz-1"],
      "203.0.113.7",
      REGLE,
      "quiz_public_pressure",
      { quiz_id: "quiz-1" },
    );

    // L'enjeu n'est pas cosmétique : une clé différente aurait coupé en deux
    // toutes les séries de supervision au déploiement, sans que personne ne
    // puisse comparer un avant et un après.
    expect(appels).toHaveLength(1);
    expect(appels[0].bucket).toBe("quiz:public:ip:quiz-1:203.0.113.7");
    expect(appels[0].event).toBe("quiz_public_pressure");
    expect(appels[0].extra).toMatchObject({ quiz_id: "quiz-1", ip_mesuree: true });
  });

  it("une IP ILLISIBLE est étiquetée dans la clé ET dans le nom de l'événement", async () => {
    await observerPressionIp(
      ["quiz:public:ip", "quiz-1"],
      IP_CLIENT_INCONNUE,
      REGLE,
      "quiz_public_pressure",
    );

    // DEUX aveux, pas un (ADR-075) : une clé qui ne peut pas se lire comme
    // une adresse, et une série distincte que personne n'agrège par mégarde
    // avec la série attribuée.
    expect(appels[0].bucket).toBe(
      `quiz:public:ip:quiz-1:${ETIQUETTE_IP_NON_MESUREE}`,
    );
    expect(appels[0].bucket).not.toContain(IP_CLIENT_INCONNUE);
    expect(appels[0].event).toBe("quiz_public_pressure.ip_non_mesuree");
    expect(appels[0].extra).toMatchObject({ ip_mesuree: false });
  });

  it("l'IP est la DERNIÈRE composante de la clé", async () => {
    await observerPressionIp(["a", "b", "c"], "203.0.113.7", REGLE, "e");
    // Une IP placée avant un identifiant rendrait deux seaux distincts
    // impossibles à séparer au tri dans la supervision.
    expect(appels[0].bucket).toBe("a:b:c:203.0.113.7");
    expect(appels[0].bucket.endsWith("203.0.113.7")).toBe(true);
  });

  it("ne REFUSE jamais rien, quoi qu'il arrive (ADR-032)", async () => {
    // Le contrat du helper est d'être fail-open : il n'a aucune valeur de
    // retour exploitable, donc aucun appelant ne peut en tirer un refus.
    const retour = await observerPressionIp(["a"], IP_CLIENT_INCONNUE, REGLE, "e");
    expect(retour).toBeUndefined();
  });

  it("les métadonnées de l'appelant survivent à l'ajout de `ip_mesuree`", async () => {
    await observerPressionIp(["a"], "203.0.113.7", REGLE, "e", {
      campaign_id: "c-1",
      hunt_id: "h-1",
    });
    // Un `{...extra}` posé APRÈS `ip_mesuree` l'écraserait silencieusement le
    // jour où un appelant nomme une clé ainsi ; l'ordre est donc épinglé.
    expect(appels[0].extra).toEqual({
      campaign_id: "c-1",
      hunt_id: "h-1",
      ip_mesuree: true,
    });
  });

  it("la règle de seuil est transmise telle quelle", async () => {
    await observerPressionIp(["a"], "203.0.113.7", REGLE, "e");
    expect(appels[0].rule).toEqual(REGLE);
  });
});

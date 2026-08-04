import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { phraseClientAnnulation } from "@/lib/annulation-cause";
import { contrastRatio } from "@/lib/contrast";
import {
  expireBientot,
  messageDeLot,
  WALLET_STATUS_TONES,
  WALLET_SURFACE_TEXTS,
  WALLET_URGENT_BADGE,
} from "./player-wallet-screen";

/**
 * GARDES DU PORTEFEUILLE CLIENT.
 *
 * Deux natures de garde vivent ici, et il faut les distinguer :
 *
 *  - des gardes de SOURCE, qui lisent les fichiers. Depuis le 2026-08-04 le
 *    rendu React est disponible en test (`// @vitest-environment happy-dom`),
 *    donc c'est un choix et non une contrainte — et le choix est ici le bon :
 *    les trois interdits fermés sont des interdits d'ABSENCE (pas de jeton
 *    dans l'URL, pas de code journalisé, pas de cookie posé), et un rendu ne
 *    prouve jamais qu'une chose n'existe nulle part, seulement qu'elle
 *    n'apparaît pas sur le montage qu'on a choisi.
 *  - des gardes de MESURE, qui recalculent un rapport WCAG sur les couleurs
 *    réellement déclarées. Celles-là tiennent pour l'état qui sera ajouté
 *    demain, parce qu'elles bouclent sur la table d'habillage.
 */

const SOURCE_ECRAN = readFileSync(
  "src/components/wallet/player-wallet-screen.tsx",
  "utf8",
);
const SOURCE_PAGE = readFileSync("src/app/portefeuille/page.tsx", "utf8");
/** Les deux fichiers qui touchent un code de retrait, et eux seuls. */
const FICHIERS = [
  ["l'écran", SOURCE_ECRAN],
  ["la page", SOURCE_PAGE],
] as const;

/** Ce qui est du CODE, commentaires retirés — un interdit ne se prouve pas sur de la prose. */
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

describe("interdit 1 — aucun jeton, aucun identifiant dans l'URL", () => {
  it("la page n'accepte AUCUN paramètre", () => {
    // LA SIGNATURE EST LA GARANTIE. `loadPlayerWallet()` ne prend rien et lit
    // le cookie lui-même ; si la page se remettait à accepter `searchParams`,
    // le premier besoin venu (« un lien direct vers un lot ») rouvrirait la
    // porte, et un lien listant des codes de retrait est un droit au porteur
    // transférable.
    const signature = /export default async function \w+\(([^)]*)\)/.exec(
      SOURCE_PAGE,
    );
    expect(signature, "signature du composant de page introuvable").not.toBeNull();
    expect(signature![1].trim()).toBe("");
  });

  it("la route est fixe — aucun segment dynamique", () => {
    // Un dossier `[quelquechose]` sous /portefeuille recréerait le jeton d'URL
    // par un autre chemin que la signature.
    const code = sansCommentaires(SOURCE_PAGE);
    expect(code).not.toMatch(/\bparams\b/);
    expect(code).not.toMatch(/\bsearchParams\b/);
  });

  it("le chargement se fait sans argument", () => {
    expect(sansCommentaires(SOURCE_PAGE)).toMatch(/loadPlayerWallet\(\)/);
  });
});

describe("interdit 2 — un code de retrait ne se journalise jamais", () => {
  // Ni console, ni supervision, ni analytique, ni attribut de données : un
  // `data-code` finit dans le DOM, donc dans la portée de toute extension de
  // navigateur, et un `console.log` de débogage finit dans les journaux d'un
  // proxy. Le code est rendu au porteur du cookie et s'arrête là.
  const INTERDITS: [string, RegExp][] = [
    ["console", /\bconsole\s*\./],
    ["supervision", /\breportError\b/],
    ["analytique", /\b(?:track|analytics|gtag|plausible|posthog)\b/i],
    ["attribut de données", /\bdata-[a-z-]+\s*=/],
  ];

  for (const [fichier, source] of FICHIERS) {
    for (const [nom, motif] of INTERDITS) {
      it(`${fichier} : aucun ${nom}`, () => {
        expect(sansCommentaires(source)).not.toMatch(motif);
      });
    }
  }
});

describe("interdit 3 — aucun cookie posé sur ce chemin", () => {
  for (const [fichier, source] of FICHIERS) {
    it(`${fichier} n'écrit aucun cookie`, () => {
      // Une page de CONSULTATION n'a pas à fabriquer une identité de joueur à
      // un visiteur qui passait par là. Seul `peekPlayerDeviceTokenHash`, dans
      // la couche métier, touche au cookie — en lecture.
      const code = sansCommentaires(source);
      expect(code).not.toMatch(/cookies\s*\(/);
      expect(code).not.toMatch(/\.set\s*\(/);
      expect(code).not.toMatch(/ensurePlayerDevice|issuePlayerDevice/);
    });
  }
});

describe("le rendu reste serveur", () => {
  it("aucun `use client` sur le chemin du code", () => {
    // Un composant client ferait voyager les codes dans le paquet JavaScript
    // en plus du document. Ce n'est pas une fuite en soi, mais c'est une
    // surface de plus pour rien : la page est une consultation, elle n'a aucun
    // état local à tenir.
    for (const [, source] of FICHIERS) {
      expect(source).not.toMatch(/^\s*["']use client["']/m);
    }
  });

  it("le rendu est dynamique — le contenu dépend du cookie", () => {
    expect(SOURCE_PAGE).toMatch(/export const dynamic = "force-dynamic"/);
  });

  it("la page n'est pas indexable", () => {
    // Une page de codes n'a rien à faire dans un index public.
    expect(SOURCE_PAGE).toMatch(/robots:\s*\{\s*index:\s*false/);
  });
});

describe("l'ordre vient du serveur", () => {
  it("l'écran ne retrie rien", () => {
    // La RPC ordonne par nom de commerçant puis émission décroissante. Deux
    // tris concurrents finissent toujours par diverger ; celui qui a raison
    // est celui de la base.
    const code = sansCommentaires(SOURCE_ECRAN);
    expect(code).not.toMatch(/\.sort\s*\(/);
    expect(code).not.toMatch(/\.reverse\s*\(/);
  });
});

/* ─────────────────────────── mesure des couleurs ─────────────────────────── */

/**
 * Jetons `k-*` relus dans `globals.css` : la source qui peint vraiment. Les
 * recopier ici les figerait à la valeur d'aujourd'hui.
 */
function jetonsProjet(): Record<string, string> {
  const css = readFileSync("src/app/globals.css", "utf8");
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/--color-(k-[a-z]+):\s*(#[0-9a-fA-F]{6})/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

/**
 * oklch → hex sRGB. Tailwind 4 ne publie plus ses couleurs en hexadécimal ;
 * les relire dans `theme.css` et convertir vaut mieux que recopier des valeurs
 * de Tailwind 3, qui DIFFÈRENT (le projet s'est déjà fait prendre : `zinc-400`
 * y valait `#a1a1aa`, il vaut `#9f9fa9`). La conversion est contrôlée plus bas
 * sur deux couleurs de valeur connue.
 */
function oklchVersHex(L: number, C: number, Hdeg: number): string {
  const h = (Hdeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return (
    "#" +
    lin
      .map((v) => {
        const g = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
        return Math.round(Math.min(1, Math.max(0, g)) * 255)
          .toString(16)
          .padStart(2, "0");
      })
      .join("")
  );
}

function jetonsTailwind(): Record<string, string> {
  const css = readFileSync("node_modules/tailwindcss/theme.css", "utf8");
  const out: Record<string, string> = { white: "#ffffff", black: "#000000" };
  for (const m of css.matchAll(
    /--color-([a-z]+-\d+):\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/g,
  )) {
    out[m[1]] = oklchVersHex(Number(m[2]) / 100, Number(m[3]), Number(m[4]));
  }
  return out;
}

const JETONS = { ...jetonsProjet(), ...jetonsTailwind() };

/** `bg-k-green text-white …` → { fond, texte }, résolus en hexadécimal. */
function resoudre(className: string): { fond: string; texte: string } {
  const fond = /(?:^|\s)bg-([a-z0-9-]+)(?:\s|$)/.exec(className)?.[1];
  const texte = /(?:^|\s)text-([a-z0-9-]+)(?:\s|$)/.exec(className)?.[1];
  expect(fond, `pas de bg-* dans « ${className} »`).toBeDefined();
  expect(texte, `pas de text-* dans « ${className} »`).toBeDefined();
  expect(JETONS[fond!], `jeton inconnu : ${fond}`).toBeDefined();
  expect(JETONS[texte!], `jeton inconnu : ${texte}`).toBeDefined();
  return { fond: JETONS[fond!], texte: JETONS[texte!] };
}

describe("contraste — la conversion, d'abord", () => {
  it("retrouve deux couleurs Tailwind de valeur connue", () => {
    // CONTRÔLE DE L'INSTRUMENT. Sans lui, une conversion fausse rendrait
    // toutes les mesures suivantes vertes et vides de sens. `zinc-300` et
    // `zinc-400` sont les deux valeurs que le projet a déjà vérifiées à la
    // main sur /play.
    expect(JETONS["zinc-300"]).toBe("#d4d4d8");
    expect(JETONS["zinc-400"]).toBe("#9f9fa9");
  });

  it("calcule un vrai rapport WCAG", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });

  it("connaît les jetons du projet", () => {
    expect(JETONS["k-ink"]).toBeDefined();
    expect(JETONS["k-bg"]).toBeDefined();
  });
});

describe("contraste — chaque habillage du portefeuille", () => {
  // Les pastilles sont du gras de 11 px : seuil AA normal (4.5:1), pas
  // AA-large. On ne s'accorde pas la remise des grands caractères sur ce qui
  // dit au client si son lot est encore dû.
  const SEUIL = 4.5;

  for (const [statut, tone] of Object.entries(WALLET_STATUS_TONES)) {
    it(`pastille « ${tone.label} » (${statut})`, () => {
      const { fond, texte } = resoudre(tone.className);
      const ratio = contrastRatio(texte, fond);
      expect(
        ratio,
        `${tone.label} : ${texte} sur ${fond} → ${ratio.toFixed(2)}:1, seuil ${SEUIL}:1`,
      ).toBeGreaterThanOrEqual(SEUIL);
    });
  }

  it("pastille « Bientôt fini »", () => {
    const { fond, texte } = resoudre(WALLET_URGENT_BADGE);
    expect(contrastRatio(texte, fond)).toBeGreaterThanOrEqual(SEUIL);
  });

  it("les textes posés sur le cartouche blanc", () => {
    const fond = resoudre(`${WALLET_SURFACE_TEXTS.fond} text-k-ink`).fond;
    for (const classe of WALLET_SURFACE_TEXTS.textes) {
      const { texte } = resoudre(`bg-white ${classe}`);
      const ratio = contrastRatio(texte, fond);
      expect(
        ratio,
        `${classe} sur ${WALLET_SURFACE_TEXTS.fond} → ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(SEUIL);
    }
  });

  it("les classes déclarées sont bien celles que l'écran pose", () => {
    // COUPLAGE. Sans cette assertion, la table pourrait rester impeccable
    // pendant que le JSX peint autre chose — c'est très exactement le défaut
    // de /play, où le preset décidait d'une couleur que le rendu ignorait.
    expect(SOURCE_ECRAN).toMatch(/\$\{tone\.className\}/);
    expect(SOURCE_ECRAN).toMatch(/\$\{WALLET_URGENT_BADGE\}/);
    for (const classe of WALLET_SURFACE_TEXTS.textes) {
      expect(SOURCE_ECRAN, `${classe} n'est plus posée`).toContain(classe);
    }
  });
});

/* ────────────────────────────── l'échéance ────────────────────────────── */

const LOT = {
  sourceType: "wheel",
  label: "Café offert",
  code: "GAIN-ABCD",
  status: "active" as const,
  cancelledCause: null,
  issuedAt: "2026-08-01T10:00:00.000Z",
  expiresAt: null as string | null,
};
const MAINTENANT = Date.parse("2026-08-01T12:00:00.000Z");

describe("échéance proche — ce que le client doit voir venir", () => {
  it("se tait sans échéance", () => {
    expect(expireBientot(LOT, MAINTENANT)).toBe(false);
  });

  it("alerte dans les 48 h", () => {
    expect(
      expireBientot(
        { ...LOT, expiresAt: "2026-08-02T12:00:00.000Z" },
        MAINTENANT,
      ),
    ).toBe(true);
  });

  it("se tait au-delà de 48 h", () => {
    expect(
      expireBientot(
        { ...LOT, expiresAt: "2026-08-05T12:00:00.000Z" },
        MAINTENANT,
      ),
    ).toBe(false);
  });

  it("se tait sur une échéance DÉJÀ passée", () => {
    // CONTRÔLE NÉGATIF de la borne basse. Sans le `reste > 0`, un lot expiré
    // depuis un mois porterait « Bientôt fini » — on presserait le client
    // d'aller réclamer un lot que la caisse refusera.
    expect(
      expireBientot(
        { ...LOT, expiresAt: "2026-07-01T12:00:00.000Z" },
        MAINTENANT,
      ),
    ).toBe(false);
  });
});

/* ─────────── la ligne d'explication, et l'accusation qui cesse ─────────── */

describe("messageDeLot — une annulation dit ENFIN qui a agi", () => {
  const annule = (cause: "purged" | "source_deleted" | "merchant" | null) => ({
    ...LOT,
    status: "cancelled" as const,
    cancelledCause: cause,
  });

  it("les trois causes reçoivent trois phrases distinctes", () => {
    const textes = (["purged", "source_deleted", "merchant"] as const).map(
      (c) => messageDeLot(annule(c)),
    );
    expect(new Set(textes).size).toBe(3);
  });

  it("la rétention n'accuse plus le commerçant", () => {
    // LE DÉFAUT FERMÉ. L'écran servait « Le commerçant a annulé ce lot. » à
    // tout coup ; pour un lot emporté par le ménage automatique des données,
    // c'était faux, et faux dans le sens qui coûte à un commerçant sa relation
    // avec un client qui croit s'être fait retirer son gain.
    expect(messageDeLot(annule("purged"))).not.toContain("commerçant a annulé");
    expect(messageDeLot(annule("merchant"))).toContain("commerçant a annulé");
  });

  it("une annulation ANTÉRIEURE au suivi des causes n'accuse personne", () => {
    // Repli honnête : ces lignes-là n'ont jamais porté de cause normalisée.
    expect(messageDeLot(annule(null))).toBe(phraseClientAnnulation(null));
    expect(messageDeLot(annule(null))).not.toContain("commerçant");
  });

  it("les trois autres états gardent leur texte d'état", () => {
    // TÉMOIN : la cause ne doit pas déborder sur ce qui n'a qu'une cause
    // possible. Un lot expiré n'a été annulé par personne.
    for (const statut of ["active", "redeemed", "expired"] as const) {
      expect(messageDeLot({ ...LOT, status: statut })).toBe(
        WALLET_STATUS_TONES[statut].hint,
      );
    }
  });

  it("le repli de la table d'habillage n'est pas un second littéral", () => {
    // Deux copies de la même phrase divergent toujours un jour ; celle-ci
    // s'afficherait alors sur les lots dont on ignore la cause.
    expect(WALLET_STATUS_TONES.cancelled.hint).toBe(phraseClientAnnulation(null));
  });

  it("l'écran passe bien par `messageDeLot`, pas par `tone.hint`", () => {
    // COUPLAGE, comme pour les couleurs : la fonction pourrait rester
    // impeccable pendant que le JSX affiche encore le texte fixe de la table.
    const code = sansCommentaires(SOURCE_ECRAN);
    expect(code).toContain("{messageDeLot(reward)}");
    expect(code).not.toContain("{tone.hint}");
  });
});

describe("les quatre états sont tous traités", () => {
  it("aucun état de la vue n'est sans habillage", () => {
    expect(Object.keys(WALLET_STATUS_TONES).sort()).toEqual([
      "active",
      "cancelled",
      "expired",
      "redeemed",
    ]);
  });

  it("seul `active` met le code en avant", () => {
    // Mettre en avant le code d'un lot annulé, retiré ou expiré, c'est
    // promettre au comptoir un droit qui n'existe plus.
    const enAvant = Object.entries(WALLET_STATUS_TONES)
      .filter(([, t]) => t.presentable)
      .map(([k]) => k);
    expect(enAvant).toEqual(["active"]);
  });

  it("les trois états vides sont distincts dans la source", () => {
    // `no-device` (jamais joué), `unavailable` (panne), et `ready` à zéro
    // (appareil connu, rien en cours) sont TROIS vécus différents. Les fondre
    // ferait dire « aucune récompense » à quelqu'un dont la base est
    // momentanément injoignable — il croirait ses gains perdus.
    expect(SOURCE_ECRAN).toMatch(/wallet\.status === "unavailable"/);
    expect(SOURCE_ECRAN).toMatch(/wallet\.status === "no-device"/);
    expect(SOURCE_ECRAN).toMatch(/wallet\.totalCount === 0/);
  });
});

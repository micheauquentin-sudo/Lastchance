import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  playContrastWarning,
  playOnLightSurface,
  resolveWheelStyle,
  WHEEL_PRESETS,
  type WheelStyle,
} from "@/lib/wheel-style";

/**
 * GARDE MÉCANIQUE — le texte de /play doit rester lisible sur le fond que le
 * commerçant a réellement choisi.
 *
 * ── Le défaut (2026-07-30) ──
 *
 * Deux presets livrés portaient un dégradé CLAIR en gardant `pageTheme:
 * "nuit"`, donc un titre `text-white` :
 *
 *   Pastel  (#fbcfe8 → #fda4af) → 1,38:1
 *   Cartoon (#fef08a → #f59e0b) → 1,16:1      (seuil AA-large : 3:1)
 *
 * Permanent, sans animation : tout commerçant choisissant l'un de ces styles
 * publiait une page dont le titre était pratiquement invisible. Personne ne
 * l'avait vu parce que les seules roues semées en E2E utilisent des styles
 * sombres — le capteur ne pouvait structurellement pas l'atteindre.
 *
 * ── Ce que cette garde vérifie, et pourquoi elle vaut mieux qu'un correctif ──
 *
 * `bgFrom` et `bgTo` sont des champs de couleur LIBRES. Corriger deux presets
 * n'aurait rien fermé. Ce test refait le calcul WCAG à chaque exécution, pour
 * chaque preset, avec la palette que `playOnLightSurface` choisira vraiment —
 * donc il tient pour le preset qui sera ajouté demain.
 *
 * ── Les couleurs LIBRES, et ce qui a été fait pour elles ──
 *
 * Cette garde ne couvre que les presets. Un commerçant peut saisir n'importe
 * quel fond, et un fond de DEMI-TEINTE est hostile au texte clair COMME au
 * texte sombre : aucune palette à deux états ne peut le sauver.
 *
 * On ne le lui refuse pas — c'est son habillage. `playContrastWarning` le
 * mesure et le lui DIT, avec le chiffre, dans l'éditeur de style. Les tests
 * de ce mécanisme sont plus bas, et le cas qui le justifie est `#7a7a7a`.
 */

/**
 * Valeurs relues dans `src/app/globals.css` (jetons `--color-k-*`) et, pour
 * `zinc-300`, converties depuis l'oklch de Tailwind 4
 * (`oklch(87.1% 0.006 286.286)` → `#d4d4d8`). La conversion a été validée sur
 * `zinc-400`, dont elle retrouve `#9f9fa9` exactement — la valeur Tailwind 3
 * `#a1a1aa` que trois lectures avaient reprise de mémoire est FAUSSE ici.
 */
const JETONS = {
  blanc: "#ffffff",
  zinc300: "#d4d4d8",
  kInk: "#211d16",
  kBody: "#3d382f",
} as const;

/**
 * Ce que `playText` rendra, résolu en couleur. Miroir volontaire de
 * `play-theme.tsx` : si l'un change sans l'autre, un test tombe.
 */
function palette(surfaceClaire: boolean) {
  return {
    // `title` : 30 px gras sur /play → seuil AA-large.
    titre: { couleur: surfaceClaire ? JETONS.kInk : JETONS.blanc, seuil: 3 },
    // `body` et `muted` : 11–14 px → seuil AA normal.
    corps: { couleur: surfaceClaire ? JETONS.kBody : JETONS.zinc300, seuil: 4.5 },
    mention: { couleur: surfaceClaire ? JETONS.kBody : JETONS.zinc300, seuil: 4.5 },
    // `kicker` : 12 px, et le DERNIER jeton à avoir porté un alpha. Il est
    // plein depuis le 2026-07-30 — il tombait à 3,17:1 pendant l'animation
    // d'entrée, quand son alpha se multipliait avec celui du bloc.
    kicker: { couleur: surfaceClaire ? JETONS.kBody : JETONS.zinc300, seuil: 4.5 },
  };
}

/**
 * Le dégradé est `radial-gradient(circle at 50% -10%, bgFrom, bgTo 75%)` : le
 * titre est haut (près de `bgFrom`), les mentions sont basses (près de `bgTo`).
 * On exige les DEUX extrémités — le texte défile par-dessus.
 */
function pire(couleur: string, style: WheelStyle): number {
  return Math.min(
    contrastRatio(couleur, style.bgFrom),
    contrastRatio(couleur, style.bgTo),
  );
}

describe("contraste de /play — chaque preset, avec la palette qu'il déclenche", () => {
  for (const preset of WHEEL_PRESETS) {
    it(`« ${preset.label} » reste lisible`, () => {
      const style = preset.style;
      // Le thème kermesse repeint la page en crème et jette le dégradé : ses
      // couleurs de fond ne décrivent alors plus rien de ce qu'on voit.
      if (style.pageTheme === "kermesse") {
        expect(playOnLightSurface(style)).toBe(true);
        return;
      }
      const p = palette(playOnLightSurface(style));
      for (const [nom, { couleur, seuil }] of Object.entries(p)) {
        const ratio = pire(couleur, style);
        expect(
          ratio,
          `${preset.label} — ${nom} (${couleur}) sur ${style.bgFrom}→${style.bgTo} : ${ratio.toFixed(2)}:1, seuil ${seuil}:1`,
        ).toBeGreaterThanOrEqual(seuil);
      }
    });
  }

  it("le style par défaut, sans aucun preset, est lisible aussi", () => {
    const style = resolveWheelStyle({});
    const p = palette(playOnLightSurface(style));
    for (const { couleur, seuil } of Object.values(p)) {
      expect(pire(couleur, style)).toBeGreaterThanOrEqual(seuil);
    }
  });
});

describe("playOnLightSurface — la règle, et son contrôle négatif", () => {
  it("classe les deux presets clairs comme clairs", () => {
    // Ce sont EUX le défaut d'origine. Si un jour ils repassent « sombres »
    // sans que leurs couleurs changent, la règle a été cassée.
    const clairs = WHEEL_PRESETS.filter((p) => playOnLightSurface(p.style)).map(
      (p) => p.key,
    );
    expect(clairs).toContain("candy"); // « Pastel »
    expect(clairs).toContain("cartoon"); // « Cartoon »
  });

  it("classe les fonds sombres comme sombres", () => {
    const sombre = resolveWheelStyle({ bgFrom: "#2e1065", bgTo: "#000000" });
    expect(playOnLightSurface(sombre)).toBe(false);
  });

  it("bascule dès qu'UNE seule extrémité devient claire", () => {
    // CONTRÔLE NÉGATIF de la règle : un dégradé sombre → blanc doit compter
    // comme clair, sinon le titre blanc disparaîtrait dans le bas de l'écran.
    // Sans cette assertion, `playOnLightSurface` pourrait ne regarder que
    // `bgFrom` et les trois tests précédents resteraient verts.
    const mixte = resolveWheelStyle({ bgFrom: "#000000", bgTo: "#ffffff" });
    expect(playOnLightSurface(mixte)).toBe(true);
  });

  it("calcule un vrai rapport WCAG", () => {
    // Valeurs de référence connues : noir/blanc = 21:1, une couleur avec
    // elle-même = 1:1. Si `contrastRatio` dérivait, tout le reste mentirait
    // en silence.
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#7f1d1d", "#7f1d1d")).toBeCloseTo(1, 5);
  });
});

describe("playContrastWarning — avertir sans refuser", () => {
  it("se tait sur les fonds francs, clairs comme sombres", () => {
    // Les cas que `playOnLightSurface` sauve déjà en changeant de palette.
    expect(
      playContrastWarning(resolveWheelStyle({ bgFrom: "#2e1065", bgTo: "#000000" })),
    ).toBeNull();
    expect(
      playContrastWarning(resolveWheelStyle({ bgFrom: "#fbcfe8", bgTo: "#fda4af" })),
    ).toBeNull();
  });

  it("se tait sur le thème kermesse — la page y est repeinte en crème", () => {
    expect(
      playContrastWarning(
        resolveWheelStyle({ pageTheme: "kermesse", bgFrom: "#7a7a7a", bgTo: "#7a7a7a" }),
      ),
    ).toBeNull();
  });

  it("PARLE sur une demi-teinte, qu'aucune palette ne peut sauver", () => {
    // LE CAS QUI JUSTIFIE TOUT LE MÉCANISME. #7a7a7a est hostile au texte clair
    // COMME au texte sombre : basculer de palette ne le sauve pas. C'est
    // précisément là qu'un commerçant a besoin qu'on le prévienne, et
    // précisément là qu'on ne peut rien décider à sa place.
    const message = playContrastWarning(
      resolveWheelStyle({ bgFrom: "#7a7a7a", bgTo: "#7a7a7a" }),
    );
    expect(message).not.toBeNull();
    expect(message).toMatch(/texte secondaire/);
  });

  it("donne un CHIFFRE, et à la française", () => {
    // Un avertissement sans mesure serait une opinion. La virgule décimale
    // parce que l'écran est en français.
    expect(
      playContrastWarning(resolveWheelStyle({ bgFrom: "#7a7a7a", bgTo: "#7a7a7a" })),
    ).toMatch(/\d,\d:1/);
  });

  it("LE TITRE NE PEUT PAS ÉCHOUER — la bascule de palette le garantit", () => {
    // Ce test remplace une branche de code MORTE. La première version de
    // `playContrastWarning` savait dire « votre titre ressort à X:1 » ; ce
    // message était inatteignable, et un test l'a montré.
    //
    // Raison : le titre blanc n'échoue qu'au-dessus d'une luminance de fond
    // d'environ 0,30 — mais là, `playOnLightSurface` bascule sur `k-ink`, qui
    // rend alors au moins 5,3:1. Les deux conditions ne peuvent pas être vraies
    // ensemble. On balaie donc tout le spectre de gris pour l'établir.
    const TITRE_CLAIR = "#ffffff";
    const TITRE_SOMBRE = "#211d16";
    for (let v = 0; v <= 255; v += 5) {
      const hex = "#" + v.toString(16).padStart(2, "0").repeat(3);
      const style = resolveWheelStyle({ bgFrom: hex, bgTo: hex });
      const titre = playOnLightSurface(style) ? TITRE_SOMBRE : TITRE_CLAIR;
      expect(
        contrastRatio(titre, hex),
        `fond ${hex} : titre à ${contrastRatio(titre, hex).toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("les animations d'entrée ne touchent plus à l'opacité", () => {
  it("aucun keyframe de /play ne fait varier l'opacité d'un bloc de TEXTE", () => {
    // GARDE STRUCTURELLE, et la seule qui ferme vraiment le sujet.
    //
    // Trois fois ce projet a relevé un « plancher d'opacité » pour sauver le
    // contraste : 0 → 0,72 → 0,75. Trois fois la limite a été déplacée, jamais
    // supprimée — et elle est retombée dès qu'on a imbriqué deux animations
    // (0,75 × 0,75 = 0,5625) puis dès qu'un preset plus clair est arrivé
    // (zinc-300 à 4,41:1, kicker à 3,17:1).
    //
    // Sans opacité dans les keyframes, la multiplication n'a plus rien à
    // multiplier. Ce test empêche que le fondu revienne « juste un peu ».
    const css = readFileSync("src/app/globals.css", "utf8");
    const ANIMATIONS_DE_TEXTE = ["play-in", "cartoon-pop-in", "tv-page", "event-pop"];
    for (const nom of ANIMATIONS_DE_TEXTE) {
      const debut = css.indexOf(`@keyframes ${nom} {`);
      expect(debut, `@keyframes ${nom} introuvable`).toBeGreaterThan(-1);
      const corps = css.slice(debut, css.indexOf("\n}", debut));
      expect(
        corps,
        `@keyframes ${nom} fait varier l'opacité. Ces animations enveloppent du TEXTE, ` +
          `et les opacités d'ancêtres se MULTIPLIENT : un second bloc animé imbriqué ` +
          `dedans repasse sous le seuil AA, quel que soit le plancher choisi.`,
      ).not.toMatch(/opacity/);
    }
  });
});

describe("les deux couleurs qui ne tiennent pas en texte", () => {
  /** Les fichiers `.tsx` d'un dossier, à toute profondeur. */
  function fichiersSous(dir: string, suffixe: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const chemin = join(dir, e.name);
      if (e.isDirectory()) out.push(...fichiersSous(chemin, suffixe));
      else if (e.name.endsWith(suffixe)) out.push(chemin);
    }
    return out;
  }

  /**
   * Une ligne de commentaire qui NOMME la classe fautive n'en habille aucun
   * texte — plusieurs en-têtes de ce dépôt expliquent précisément pourquoi
   * telle couleur a été retirée. La garde ne doit pas interdire d'en parler.
   */
  const estCommentaire = (ligne: string): boolean =>
    /^\s*(\*|\/\/|\/\*)/.test(ligne);

  /**
   * Le point du logotype « LastChance. » — un caractère DÉCORATIF, doublé par
   * le mot qui le précède. Il n'a rien à dire à un lecteur d'écran et rien à
   * faire lire à personne : c'est le seul emploi légitime de l'orange plein.
   */
  const POINT_DU_LOGOTYPE = /LastChance<span className="text-k-orange">\.<\/span>/;

  it("`text-k-orange` n'habille plus de texte dans le parcours joueur", () => {
    // `--color-k-orange` (#f5793b) est une couleur d'OBJET : elle rend 2,7:1
    // sur crème, sous le seuil AA (4,5:1) et même sous le seuil « large »
    // (3:1). Le jeton `--color-k-orange-text` (#b45309) existe pour ça depuis
    // le chantier QR, et sept sites l'ignoraient encore — dont le compte à
    // rebours du code de gain, lu en boutique sur un téléphone, et
    // l'astérisque des champs obligatoires.
    //
    // `hover:` est hors sujet : un survol n'est jamais la seule façon de lire
    // un lien, et la couleur au repos, elle, est gardée ailleurs.
    const fautifs: string[] = [];
    for (const fichier of fichiersSous("src/components/wheel", ".tsx")) {
      if (fichier.endsWith(".test.tsx")) continue;
      const source = readFileSync(fichier, "utf8");
      for (const ligne of source.split(/\r?\n/)) {
        const sansHover = ligne.replace(/hover:text-k-orange\b/g, "");
        if (/\btext-k-orange\b(?!-text)/.test(sansHover)) {
          fautifs.push(`${fichier} → ${ligne.trim().slice(0, 100)}`);
        }
      }
    }
    expect(
      fautifs,
      "utilisez `text-k-orange-text` (#b45309, calibré pour le texte) : " +
        "`text-k-orange` est la couleur décorative, elle tombe sous 3:1",
    ).toEqual([]);
  });

  it("aucune nuance `text-zinc-3xx` en dur dans les composants de jeu", () => {
    // Le parcours joueur bascule entre un fond sombre (« nuit ») et un fond
    // crème (« kermesse ») SELON LE STYLE DU COMMERÇANT. Une nuance écrite en
    // dur ne peut pas être juste des deux côtés : `text-zinc-300` rend 1,7:1
    // sur le crème — c'est exactement ce qui rendait illisible le bouton
    // « Révéler directement », seule porte d'entrée au clavier du jeu de
    // grattage.
    //
    // Le choix se fait par `playText.*` (voir play-theme.tsx), qui prend le
    // drapeau `kermesse` et rend le jeton calibré pour la surface.
    const fautifs: string[] = [];
    for (const fichier of fichiersSous("src/components/wheel", ".tsx")) {
      if (fichier.endsWith(".test.tsx")) continue;
      const source = readFileSync(fichier, "utf8");
      for (const ligne of source.split(/\r?\n/)) {
        if (estCommentaire(ligne)) continue;
        // Le défaut visé est PRÉCIS : une nuance posée dans un `className="…"`
        // littéral, donc appliquée quel que soit le thème. Trois emplois
        // voisins ne le sont pas et sont écartés ici :
        //  · `placeholder:` — texte indicatif, remplacé dès la frappe ;
        //  · une branche de ternaire `kermesse ? … : "text-zinc-300"` ;
        //  · une table de thème (`nuit: { body: "text-zinc-300" }`), où la
        //    nuance sombre est choisie POUR le fond sombre, comme le fait
        //    `playText` lui-même.
        // Les deux derniers ne sont pas des `className="…"` littéraux : la
        // restriction ci-dessous les exclut d'elle-même, sans liste à tenir.
        const litteral = ligne.match(/className="([^"]*)"/)?.[1] ?? "";
        const sansPlaceholder = litteral.replace(/placeholder:text-zinc-3\d\d\b/g, "");
        if (!/\btext-zinc-3\d\d\b/.test(sansPlaceholder)) continue;
        fautifs.push(`${fichier} → ${ligne.trim().slice(0, 100)}`);
      }
    }
    expect(
      fautifs,
      "passez par `playText.*` (play-theme.tsx) : une nuance en dur ne peut " +
        "pas être lisible à la fois sur le dégradé nuit et sur le crème kermesse",
    ).toEqual([]);
  });

  it("le point du logotype reste la seule exception tolérée", () => {
    // Contre-épreuve de la tolérance ci-dessus : si le point décoratif
    // disparaissait du produit, la tolérance devrait disparaître avec lui.
    const sites = [
      "src/app/dashboard/layout.tsx",
      "src/components/marketing/site-header.tsx",
    ];
    for (const site of sites) {
      expect(readFileSync(site, "utf8"), site).toMatch(POINT_DU_LOGOTYPE);
    }
  });
});

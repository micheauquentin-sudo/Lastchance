import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { destinationApresCreation, CHAMP_GRAND_ECRAN } from "./atterrissage-studio";

/**
 * L'ATTERRISSAGE APRÈS CRÉATION, ET SES DEUX MOITIÉS (VIT-51).
 *
 * Le mécanisme n'a de sens que si les deux côtés existent ENSEMBLE : une action
 * qui consulte le champ mais un formulaire qui ne l'envoie pas retombe
 * silencieusement sur l'atelier — c'est-à-dire le comportement d'avant, sans
 * que rien ne rougisse. C'est la forme la plus courante de régression sur ce
 * dépôt : la moitié qui reste fonctionne, donc personne ne voit que l'autre
 * manque.
 *
 * La garde apparie donc les deux, et elle est TEXTUELLE (ADR-074) : elle prouve
 * qu'un appel est écrit, jamais qu'il s'exécute.
 */

/**
 * Les HUIT modules qui créent une animation puis redirigent.
 *
 * Le jeu instantané (`campaigns`) a rejoint la liste en VIT-52, et son absence
 * disait quelque chose sur la GARDE plus que sur le module : il avait son
 * studio depuis VIT-46, mais rejoignait son atelier par un chemin écrit EN
 * TOUTES LETTRES, quand la sonde du bas ne reconnaissait que l'appel au
 * helper. Une garde qui ne reconnaît qu'une écriture ne garde pas une règle,
 * elle garde une habitude.
 */
const CREATIONS = [
  { action: "src/actions/calendar.ts", formulaire: "src/components/dashboard/new-calendar-form.tsx" },
  { action: "src/actions/campaigns.ts", formulaire: "src/components/dashboard/new-campaign-form.tsx" },
  { action: "src/actions/events.ts", formulaire: "src/components/dashboard/new-event-form.tsx" },
  { action: "src/actions/hunts.ts", formulaire: "src/components/dashboard/new-hunt-form.tsx" },
  { action: "src/actions/jackpot.ts", formulaire: "src/components/dashboard/new-jackpot-form.tsx" },
  { action: "src/actions/loyalty.ts", formulaire: "src/components/dashboard/new-loyalty-form.tsx" },
  { action: "src/actions/pronostics.ts", formulaire: "src/components/dashboard/new-contest-form.tsx" },
  { action: "src/actions/quiz.ts", formulaire: "src/components/dashboard/new-quiz-form.tsx" },
];

const lire = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");

const fichiersActions = () =>
  readdirSync("src/actions").filter((n) => n.endsWith(".ts") && !n.includes(".test."));

/** Une interpolation dans un gabarit — écrite en classes pour rester lisible. */
const INTERPOLATION = /[$][{][^}]*[}]/g;

/** `export function baseAtelierX(...): string { return <chemin>;` */
const DECLARATION_BASE =
  /export function (base[A-Za-z]+)\([^)]*\)\s*:\s*string\s*\{\s*return\s+([^\n;]+);/g;

/**
 * LES FORMES D'URL D'ATELIER, LUES LÀ OÙ ELLES SONT CONSTRUITES.
 *
 * Chaque module publie un `baseAtelierX()` qui rend son chemin. Les recopier
 * ici aurait refait le défaut qu'on répare : une seconde source de vérité, qui
 * dérive au premier renommage et laisse une garde chercher une adresse morte.
 *
 * Une forme est la SUITE de ses morceaux littéraux, interpolations ôtées : la
 * base de la roue devient « /dashboard/campaigns/ » puis « /wheel ». Aucune
 * expression régulière n'est fabriquée à partir du chemin lui-même — l'échapper
 * serait une occasion de plus de se tromper, pour une finesse inutile ici.
 */
function formesAtelier(): { nom: string; morceaux: string[] }[] {
  const dossier = "src/components/dashboard";
  const fichiers = readdirSync(dossier).filter(
    (n) => n.startsWith("atelier-") && n.endsWith("etapes.ts"),
  );
  const formes: { nom: string; morceaux: string[] }[] = [];
  for (const f of fichiers) {
    for (const d of lire(join(dossier, f)).matchAll(DECLARATION_BASE)) {
      // Le chemin est un gabarit ou une chaîne : on ôte ses deux délimiteurs.
      const morceaux = d[2].trim().slice(1, -1).split(INTERPOLATION).filter(Boolean);
      if (morceaux.length > 0) formes.push({ nom: `${f}:${d[1]}`, morceaux });
    }
  }
  return formes;
}

/** Les morceaux, dans l'ordre, quelque part dans le texte. */
function recopie(argument: string, morceaux: string[]): boolean {
  let curseur = 0;
  for (const morceau of morceaux) {
    const trouve = argument.indexOf(morceau, curseur);
    if (trouve === -1) return false;
    curseur = trouve + morceau.length;
  }
  return true;
}

describe("atterrissage après création — le studio sur grand écran", () => {
  it("choisit le studio quand le formulaire l'a dit, l'atelier sinon", () => {
    const avec = new FormData();
    avec.set(CHAMP_GRAND_ECRAN, "1");
    expect(destinationApresCreation(avec, "/studio/x/1", "/atelier?etape=a")).toBe(
      "/studio/x/1",
    );

    const sans = new FormData();
    sans.set(CHAMP_GRAND_ECRAN, "0");
    expect(destinationApresCreation(sans, "/studio/x/1", "/atelier?etape=a")).toBe(
      "/atelier?etape=a",
    );
  });

  it("un champ ABSENT retombe sur l'atelier, jamais sur le studio", () => {
    // JavaScript coupé, requête forgée, navigateur exotique : le repli le moins
    // coûteux est celui qui fonctionne aux deux tailles. L'inverse enverrait un
    // téléphone dans un écran conçu pour deux colonnes.
    expect(
      destinationApresCreation(new FormData(), "/studio/x/1", "/atelier?etape=a"),
    ).toBe("/atelier?etape=a");
  });

  it.each(CREATIONS)(
    "$action consulte le champ au lieu de rediriger en dur",
    ({ action }) => {
      expect(lire(action)).toContain("destinationApresCreation(");
    },
  );

  it.each(CREATIONS)(
    "$formulaire envoie le champ",
    ({ formulaire }) => {
      // L'autre moitié. Sans elle, l'action consulte un champ que personne
      // n'envoie et retombe sur l'atelier — le comportement d'avant, en silence.
      expect(lire(formulaire)).toContain("<ChampGrandEcran />");
    },
  );

  it("aucune création ne redirige encore DIRECTEMENT vers une étape d'atelier", () => {
    // La forme fautive est `redirect(hrefEtapeX(...))` sans passer par le
    // choix. Un neuvième module ajouté demain doit rougir ici.
    const fautifs: string[] = [];
    for (const f of fichiersActions()) {
      const src = lire(join("src/actions", f));
      for (const m of src.matchAll(/redirect\(\s*hrefEtape\w+\(/g)) {
        fautifs.push(`${f} @${src.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(fautifs).toEqual([]);
  });

  /**
   * ── LA MÊME RÈGLE, INDÉPENDAMMENT DE L'ÉCRITURE (VIT-52) ──
   *
   * La sonde ci-dessus n'a pas vu `createCampaign` de toute la campagne des
   * studios, et le module n'y était pour rien : il ne passait pas par son
   * helper, il RECOPIAIT le chemin que ce helper construit. Une garde qui
   * reconnaît un appel laisse passer le littéral qui lui est équivalent — et
   * c'est exactement ce qui est arrivé, treize livraisons durant.
   *
   * Celle-ci ne reconnaît plus une écriture : elle lit les formes d'atelier
   * DANS les helpers qui les construisent, puis les cherche dans le corps des
   * créations. Recopier son chemin rougit désormais comme appeler le helper.
   *
   * Elle ne regarde QUE les fonctions `create*` : ailleurs, rejoindre un
   * atelier est légitime — c'est la destination normale d'un « Modifier ».
   */
  it("aucune création ne recopie un chemin d'atelier à la main", () => {
    const formes = formesAtelier();
    // Une garde qui ne trouve plus aucune forme ne mesure plus rien, et passe
    // verte POUR CETTE RAISON (le défaut de VIT-49). Qu'elle le dise.
    expect(formes.length).toBeGreaterThanOrEqual(8);

    const fautifs: string[] = [];
    for (const f of fichiersActions()) {
      const src = lire(join("src/actions", f));
      for (const m of src.matchAll(/export async function (create\w*)\s*\(/g)) {
        const suivante = src.indexOf("\nexport ", m.index + 10);
        const corps = src.slice(m.index, suivante === -1 ? src.length : suivante);
        // La fonction consulte l'écran : son atterrissage est déjà arbitré.
        if (corps.includes("destinationApresCreation(")) continue;
        for (const appel of corps.matchAll(/redirect\(\s*([^;]{0,160})/g)) {
          const forme = formes.find((c) => recopie(appel[1], c.morceaux));
          if (forme) fautifs.push(`${f}::${m[1]} recopie ${forme.nom}`);
        }
      }
    }
    expect(fautifs).toEqual([]);
  });
});

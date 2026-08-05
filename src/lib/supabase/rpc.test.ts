import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/* ── POURQUOI CE TEST COMPILE AU LIEU D'EXÉCUTER ─────────────
 *
 * `rpcStrict` ne produit AUCUN comportement à l'exécution : il délègue à
 * `.rpc()`. Toute sa valeur est dans le refus à la compilation. Un test qui
 * l'appellerait avec un mock ne prouverait donc rien du tout — il serait vert
 * quoi qu'il arrive au typage, y compris si quelqu'un remplaçait `ArgsExacts`
 * par `Record<string, unknown>`.
 *
 * `@ts-expect-error` serait l'outil naturel ; il est interdit dans ce dépôt
 * (au même titre que `as any` et `@ts-ignore`), et c'est un outil faible ici :
 * il rougit sur l'ABSENCE d'erreur mais ne dit pas LAQUELLE il attendait, donc
 * une erreur pour une autre raison le satisfait.
 *
 * On applique donc à la compilation la discipline de
 * `scripts/prove-sabotages.sh` : une RÉFÉRENCE qui doit être verte, des
 * SABOTAGES qui doivent rougir CHACUN SUR SON MOTIF, et une CANARI qui prouve
 * que le compilateur a bien regardé les fichiers — sans elle, un harnais qui
 * ne compilerait rien du tout passerait pour un succès complet.
 *
 * Les fixtures sont écrites dans un dossier temporaire HORS du dépôt : dans
 * `src/`, elles feraient rougir `npm run typecheck`, ce qui est exactement ce
 * qu'on leur demande de faire ici.
 * ─────────────────────────────────────────────────────────── */

const racine = path.resolve(__dirname, "..", "..", "..");

/** Repris de `src/types/database.generated.ts` (`credit_sms_balance`) :
 *  requis `p_organization_id`, `p_units` ; optionnels `p_reference`,
 *  `p_reason`, `p_unit_cost_micros`, `p_destination_country`. */
const preambule = `
import { createAdminClient } from "@/lib/supabase/admin";
import { rpcStrict } from "@/lib/supabase/rpc";

const admin = createAdminClient();
`;

type Cas = {
  readonly fichier: string;
  readonly source: string;
  /** `null` = doit compiler proprement. */
  readonly motifAttendu: RegExp | null;
};

const cas: readonly Cas[] = [
  {
    // RÉFÉRENCE — sans elle, un `ArgsExacts` qui refuserait TOUT passerait
    // les quatre sabotages et serait déclaré bon.
    fichier: "reference.ts",
    motifAttendu: null,
    source: `${preambule}
export const a = () => rpcStrict(admin, "credit_sms_balance", {
  p_organization_id: "org",
  p_units: 1,
  p_reference: "ref",
  p_reason: null,
});
`,
  },
  {
    // LE TROU QU'ON FERME : argument OPTIONNEL mal orthographié, sous un nom
    // de fonction valide. Compilait silencieusement avant `rpcStrict`, et la
    // RPC s'exécutait avec la valeur par défaut de `p_reference`.
    fichier: "optionnel-mal-orthographie.ts",
    motifAttendu: /is not assignable to type 'never'/,
    source: `${preambule}
export const a = () => rpcStrict(admin, "credit_sms_balance", {
  p_organization_id: "org",
  p_units: 1,
  p_referenc: "ref",
});
`,
  },
  {
    fichier: "argument-requis-manquant.ts",
    motifAttendu: /not assignable to parameter of type 'ArgsExacts/,
    source: `${preambule}
export const a = () => rpcStrict(admin, "credit_sms_balance", {
  p_organization_id: "org",
});
`,
  },
  {
    fichier: "mauvais-type.ts",
    motifAttendu: /Type 'string' is not assignable to type 'number'/,
    source: `${preambule}
export const a = () => rpcStrict(admin, "credit_sms_balance", {
  p_organization_id: "org",
  p_units: "beaucoup",
});
`,
  },
  {
    fichier: "fonction-inexistante.ts",
    motifAttendu: /not assignable to parameter of type 'RpcName'/,
    source: `${preambule}
export const a = () => rpcStrict(admin, "credit_sms_balanc", {
  p_organization_id: "org",
  p_units: 1,
});
`,
  },
  {
    // CANARI : erreur triviale, sans rapport avec les RPC. Si elle ne remonte
    // pas, c'est le harnais qui est cassé (chemins, tsconfig, tsc muet) et
    // TOUS les autres verdicts sont sans valeur.
    fichier: "canari.ts",
    motifAttendu: /Type 'string' is not assignable to type 'number'/,
    source: `export const n: number = "pas un nombre";\n`,
  },
  {
    // `data` doit rester PRÉCIS. Si la conditionnelle de postgrest-js
    // dégénérait en `any`, `rpcStrict` continuerait de refuser les mauvaises
    // clés tout en rendant un résultat non typé — une régression invisible.
    fichier: "resultat-precis.ts",
    motifAttendu: /'{ created: boolean; entry_id: string; }\[\]' is not assignable/,
    source: `${preambule}
export async function a() {
  const { data, error } = await rpcStrict(admin, "credit_sms_balance", {
    p_organization_id: "org",
    p_units: 1,
  });
  if (error) return null;
  const mauvais: { pas_une_colonne: symbol }[] = data;
  return mauvais;
}
`,
  },
];

let sortie = "";
let dossier = "";

beforeAll(() => {
  dossier = mkdtempSync(path.join(tmpdir(), "lc-rpc-types-"));

  for (const c of cas) {
    writeFileSync(path.join(dossier, c.fichier), c.source, "utf8");
  }

  // `noEmit` + `skipLibCheck` : on ne compile que ces fixtures, les `.d.ts`
  // de `node_modules` ne sont pas notre sujet. `paths` rebranche `@/*` sur le
  // dépôt, puisque les fixtures vivent hors de son arborescence.
  writeFileSync(
    path.join(dossier, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2017",
        lib: ["dom", "dom.iterable", "esnext"],
        module: "esnext",
        moduleResolution: "bundler",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        typeRoots: [path.join(racine, "node_modules", "@types")],
        baseUrl: dossier,
        paths: { "@/*": [path.join(racine, "src", "*")] },
      },
      include: [path.join(dossier, "*.ts")],
    }),
    "utf8",
  );

  try {
    execFileSync(
      process.execPath,
      [
        path.join(racine, "node_modules", "typescript", "lib", "tsc.js"),
        "--noEmit",
        "-p",
        path.join(dossier, "tsconfig.json"),
      ],
      { cwd: racine, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    sortie = "";
  } catch (erreur) {
    const e = erreur as { stdout?: string; stderr?: string };
    sortie = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
  // Chemins normalisés : tsc rend des séparateurs POSIX, Windows non.
  sortie = sortie.split("\\").join("/");
}, 180_000);

afterAll(() => {
  if (dossier) rmSync(dossier, { recursive: true, force: true });
});

/** Les lignes d'erreur tsc portant sur une fixture donnée. */
function erreursDe(fichier: string): string[] {
  return sortie
    .split(/\r?\n/)
    .filter((ligne) => ligne.includes(`/${fichier}(`));
}

describe("rpcStrict — refus des clés étrangères à la compilation", () => {
  for (const c of cas) {
    const verdict = c.motifAttendu === null ? "compile" : "est refusé";

    it(`${c.fichier} ${verdict}`, () => {
      const erreurs = erreursDe(c.fichier);

      if (c.motifAttendu === null) {
        expect(erreurs, `attendu propre, tsc a dit :\n${erreurs.join("\n")}`)
          .toEqual([]);
        return;
      }

      expect(
        erreurs.length,
        `aucune erreur sur ${c.fichier} — la garde ne mord plus`,
      ).toBeGreaterThan(0);
      expect(
        erreurs.some((ligne) => c.motifAttendu!.test(ligne)),
        `erreur présente mais pas la bonne :\n${erreurs.join("\n")}`,
      ).toBe(true);
    });
  }
});

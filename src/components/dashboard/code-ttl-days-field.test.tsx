// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  CodeTtlDaysField,
  codeTtlDaysInitial,
} from "@/components/dashboard/code-ttl-days-field";

/**
 * LE CHAMP CACHÉ EST LA MOITIÉ DU MÉCANISME — ET IL EST INVISIBLE À TOUT LE
 * RESTE DE LA SUITE.
 *
 * ── CE QUE LES AUTRES GARDES NE PEUVENT PAS VOIR ────────────────────
 *
 * Côté serveur, `formData.has("code_ttl_days")` est la SEULE chose qui
 * distingue « efface le réglage » (valeur `''`, légitime : sans limite) de
 * « ne touche pas à ce réglage » (clé absente). `code-ttl-days.test.ts` prouve
 * que les sept actions honorent cette distinction ; `code-ttl-days-chargement.test.ts`
 * prouve que les pages chargent la colonne. Entre les deux, personne ne
 * vérifiait que le formulaire POSTE réellement la clé — et c'est le maillon
 * dont dépendent les deux autres :
 *
 *  - champ caché absent → vider la case n'écrirait JAMAIS « sans limite »,
 *    le commerçant ne pourrait plus retirer une échéance qu'il a posée ;
 *  - champ caché reconstruit en nombre → une saisie invalide (« 3.5 »)
 *    partirait en `''`, donc en « sans limite » silencieux, au lieu d'être
 *    refusée avec son message.
 *
 * Un test de RENDU est le seul endroit d'où l'on voit ce que le navigateur
 * enverrait. C'est précisément ce que ce dépôt ne pouvait pas faire avant
 * d'avoir un environnement de rendu (ADR-074).
 */

afterEach(cleanup);

/** Enveloppe contrôlée : le composant délègue son état au parent. */
function Champ({ initial }: { initial: number | null | undefined }) {
  const [value, setValue] = useState(() => codeTtlDaysInitial(initial));
  return (
    <form data-testid="form">
      <CodeTtlDaysField
        idPrefix="essai"
        value={value}
        onChange={setValue}
        emissionHint="À partir de la fin de la chasse."
      />
    </form>
  );
}

function champCache(): HTMLInputElement | null {
  return document.querySelector('input[type="hidden"][name="code_ttl_days"]');
}

describe("CodeTtlDaysField — ce que le formulaire enverrait vraiment", () => {
  it("pose la clé même quand aucune échéance n'est réglée", () => {
    render(<Champ initial={null} />);
    const cache = champCache();
    // PRÉSENTE et VIDE : c'est « sans limite », un choix, pas une absence.
    // Si la clé manquait, l'action lirait « ne touche pas » et le commerçant
    // ne pourrait jamais retirer une échéance posée la veille.
    expect(cache).not.toBeNull();
    expect(cache!.value).toBe("");
  });

  it("porte la valeur stockée, et la case l'affiche", () => {
    render(<Champ initial={30} />);
    expect(champCache()!.value).toBe("30");
    expect(
      (screen.getByLabelText("Validité (jours)") as HTMLInputElement).value,
    ).toBe("30");
  });

  it("une colonne NON CHARGÉE rend une case vide — le défaut réel du chantier", () => {
    // `undefined` = la page a oublié la colonne dans son `select`. Le champ
    // ne peut pas le distinguer de `null`, et c'est pour ça que la garde de
    // chargement existe côté pages : ici, on grave que le composant se
    // comporte comme pour « sans limite », donc qu'il EFFACERAIT au premier
    // enregistrement. Le trou n'est pas ici, il est en amont.
    render(<Champ initial={undefined} />);
    expect(champCache()!.value).toBe("");
  });

  it("vider la case envoie « sans limite », pas rien", () => {
    render(<Champ initial={30} />);
    fireEvent.change(screen.getByLabelText("Validité (jours)"), {
      target: { value: "" },
    });
    const cache = champCache()!;
    expect(cache.value).toBe("");
    // La clé reste posée : c'est ce qui rend l'effacement possible.
    expect(cache.name).toBe("code_ttl_days");
  });

  it("transmet une saisie INVALIDE telle quelle, pour que le serveur la refuse", () => {
    render(<Champ initial={null} />);
    fireEvent.change(screen.getByLabelText("Validité (jours)"), {
      target: { value: "3.5" },
    });
    // Reconstruire un nombre ici transformerait « 3.5 » en un silencieux
    // « sans limite ». `codeTtlDaysSchema` doit pouvoir rendre son message.
    expect(champCache()!.value).toBe("3.5");
  });

  it("trime la saisie, sans transformer un espace en réglage", () => {
    render(<Champ initial={null} />);
    fireEvent.change(screen.getByLabelText("Validité (jours)"), {
      target: { value: "  12  " },
    });
    expect(champCache()!.value).toBe("12");
  });

  it("la case est décrite par son aide et par ses bornes", () => {
    render(<Champ initial={null} />);
    const input = screen.getByLabelText("Validité (jours)");
    const decrit = (input.getAttribute("aria-describedby") ?? "").split(" ");
    // Deux textes distincts : l'instant d'où court le délai, et les bornes.
    // Un lecteur d'écran doit entendre les deux, pas seulement l'étiquette.
    expect(decrit).toHaveLength(2);
    for (const id of decrit) {
      expect(document.getElementById(id)?.textContent ?? "").not.toBe("");
    }
  });
});

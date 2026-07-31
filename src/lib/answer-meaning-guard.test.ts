import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EVENT_ANSWER_MEANING_HINT,
  EVENT_SESSION_LOSS_HINT,
} from "@/lib/validations/events";

/**
 * GARDE MÉCANIQUE — la confirmation « intervertir deux libellés ».
 *
 * ── Pourquoi un fichier à part, et non une cinquième entrée dans
 *    `destructive-confirm-coverage.test.ts` ──
 *
 * J'ai commencé par l'y inscrire. Trois de ses assertions sont tombées, et
 * elles avaient raison : ce registre est bâti pour QUATRE gardes de même
 * espèce — quatre suppressions, même champ de formulaire, et il asserte
 * explicitement que les quatre marqueurs disent LA MÊME CHOSE au commerçant.
 *
 * Celle-ci est d'une autre nature. Elle ne détruit rien : elle réécrit ce que
 * des réponses déjà données veulent dire. Son marqueur DOIT donc différer —
 * les deux refus cohabitent dans le même écran, et un marqueur partagé y
 * ferait apparaître la case qui parle de codes de retrait sous un refus qui
 * parle de réponses. Et sa confirmation n'est pas un champ de formulaire mais
 * un booléen d'entrée typée : le compilateur signale l'appelant qui l'oublie,
 * ce qu'un `name=""` ne fait pas.
 *
 * La forcer dans ce registre aurait donc exigé soit d'affaiblir ses
 * invariants, soit d'adopter ici un design moins bon pour lui ressembler.
 *
 * ── Ce que celle-ci prouve ──
 *
 * Que la chaîne tient de bout en bout : le refus PORTE le marqueur, l'écran
 * filtre DESSUS et non sur `!ok`, et les deux marqueurs de cet écran restent
 * DISTINCTS. Le projet n'ayant pas d'environnement de rendu React, une
 * condition JSX ne se vérifie que par lecture de la source — assumé.
 */

const ACTION = "src/actions/events.ts";
const COMPOSANT = "src/components/dashboard/event-editor.tsx";

function source(chemin: string): string {
  return readFileSync(chemin, "utf8").replace(/\r\n/g, "\n");
}

describe("confirmation « intervertir deux libellés »", () => {
  it("le refus de l'action PORTE le marqueur", () => {
    // ROUGE SI : le message perd le marqueur. La garde devient un cul-de-sac —
    // l'action refuse, l'écran ne propose aucune case, et l'organisateur ne
    // peut plus corriger sa question du tout, en pleine soirée.
    expect(source(ACTION)).toContain("${EVENT_ANSWER_MEANING_HINT}");
  });

  it("l'écran ne montre la case qu'après CE refus", () => {
    // ROUGE SI : la condition retombe sur `!ok` ou sur l'autre marqueur. Dans
    // le premier cas la case apparaît sur n'importe quelle erreur ; dans le
    // second, sous le mauvais message.
    const src = source(COMPOSANT);
    expect(src).toContain("error?.includes(EVENT_ANSWER_MEANING_HINT)");
  });

  it("l'écran IMPORTE le marqueur au lieu de recopier la phrase", () => {
    const src = source(COMPOSANT);
    const blocs = src.match(
      /import\s*\{[^}]*\}\s*from\s*"@\/lib\/validations\/events"/g,
    );
    expect(blocs, "aucun import depuis @/lib/validations/events").toBeTruthy();
    expect(blocs!.some((b) => b.includes("EVENT_ANSWER_MEANING_HINT"))).toBe(true);
  });

  it("les DEUX marqueurs de cet écran restent distincts", () => {
    // C'est l'assertion qui compte le plus ici, et elle dit l'inverse de celle
    // du registre voisin — à raison. `event-editor.tsx` porte DEUX refus
    // confirmables : supprimer une session (codes EVENT- perdus) et permuter
    // deux libellés (sens des réponses réécrit). S'ils partageaient un
    // marqueur, cocher l'un afficherait l'autre, et le commerçant lirait une
    // phrase qui ne décrit pas son geste.
    expect(EVENT_ANSWER_MEANING_HINT).not.toBe(EVENT_SESSION_LOSS_HINT);
    // Et ni l'un ni l'autre ne doit être contenu dans l'autre : le filtre est
    // un `includes`, pas une égalité.
    expect(EVENT_ANSWER_MEANING_HINT.includes(EVENT_SESSION_LOSS_HINT)).toBe(false);
    expect(EVENT_SESSION_LOSS_HINT.includes(EVENT_ANSWER_MEANING_HINT)).toBe(false);
  });

  it("le message de permutation ne contient PAS le marqueur de suppression", () => {
    // Le piège réellement rencontré : ma première rédaction du refus se
    // terminait par « Cochez la case de confirmation… », qui EST le marqueur
    // de la suppression de session. Les deux cases seraient apparues, et
    // celle qui parle de codes de retrait sous un refus qui parle de réponses.
    const src = source(ACTION);
    const debut = src.indexOf("Vous intervertissez deux libellés");
    expect(debut, "message de permutation introuvable").toBeGreaterThan(-1);
    const message = src.slice(debut, debut + 500);
    expect(message.includes(EVENT_SESSION_LOSS_HINT)).toBe(false);
  });
});

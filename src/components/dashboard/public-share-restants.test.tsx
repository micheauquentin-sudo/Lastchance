// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PublicShare } from "@/components/dashboard/public-share";

/**
 * LES TROIS MODULES RESTANTS du §4 du cahier (« chaque expérience joueur
 * publiable propose un QR et un lien »), après le quiz, les pronostics, le
 * calendrier et le jackpot.
 *
 * LE DÉFAUT QUE CE FICHIER GARDE — chaque module dérive son URL publique d'un
 * champ DIFFÉRENT, et une URL bâtie sur le mauvais champ produit un QR vers un
 * 404. Imprimé et collé en vitrine, c'est pire que pas de QR du tout :
 *  - fidélité : AUCUNE colonne de slug. `/passeport/[programId]` est résolu par
 *    `loadLoyaltyContext` sur l'ID du programme → `p.id` ;
 *  - événement : AUCUN slug non plus, mais un `join_code` posé par trigger, que
 *    `loadEventPublicContext` résout et que la salle lit à voix haute → c'est
 *    lui qu'on imprime, pas l'UUID de la session.
 *
 * Et dans les deux cas, aucun QR tant que l'expérience n'est pas ouverte aux
 * joueurs — la garde de la page doit être le MIROIR de celle du contexte
 * public, sinon on imprime un code que le serveur refuse.
 *
 * Ces pages sont des Server Components asynchrones (client Supabase →
 * `next/headers`) : les rendre coûterait plus de mocks que la valeur du signal.
 * On lit donc leur source, comme le font déjà `public-share.test.tsx` et
 * `public-share-modules.test.tsx`.
 */

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

afterEach(cleanup);

describe("URL publique du passeport de fidélité", () => {
  const src = source("src/app/dashboard/loyalty/[id]/page.tsx");

  it("est construite absolue, depuis APP_URL et l'ID du programme", () => {
    expect(src).toContain('import { APP_URL } from "@/lib/env"');
    // Pas de `public_slug` sur loyalty_programs : la route publique prend l'id.
    expect(src).toContain("const publicUrl = `${APP_URL}/passeport/${p.id}`");
  });

  it("est celle passée au bloc de partage", () => {
    expect(src).toMatch(/<PublicShare\s+url=\{publicUrl\}/);
    expect(src).not.toContain("const publicPath");
  });

  it("ne rend aucun QR tant que le programme n'est pas actif", () => {
    expect(src.match(/<PublicShare/g)).toHaveLength(1);

    // Miroir de loadLoyaltyContext : `program.status !== "active"` → 404.
    const gate = 'p.status === "active" ? (';
    const start = src.indexOf(gate);
    expect(start).toBeGreaterThan(-1);

    const elseAt = src.indexOf(") : (", start);
    expect(elseAt).toBeGreaterThan(start);

    expect(src.slice(start, elseAt)).toContain("<PublicShare");
    expect(src.slice(elseAt)).not.toContain("<PublicShare");
    // La branche fermée explique l'absence au lieu de livrer un code mort.
    expect(src.slice(elseAt)).toMatch(/Activez le programme/);
  });
});

describe("URL publique d'une session d'événement en direct", () => {
  const page = source("src/app/dashboard/events/[id]/page.tsx");
  const editor = source("src/components/dashboard/event-editor.tsx");

  it("est construite absolue côté page RSC, sur le join_code", () => {
    expect(page).toContain('import { APP_URL } from "@/lib/env"');
    expect(page).toContain("publicUrl: `${APP_URL}/event/${s.join_code}`");
    // L'éditeur est un composant client : il ne doit PAS lire APP_URL lui-même
    // ni refabriquer l'URL à partir de window.location.
    expect(editor).not.toContain("@/lib/env");
    expect(editor).not.toContain("window.location.origin");
  });

  it("est celle passée au bloc de partage", () => {
    expect(editor).toMatch(/<PublicShare\s+url=\{session\.publicUrl\}/);
  });

  it("ne rend aucun QR pour une session en brouillon ou archivée", () => {
    expect(editor.match(/<PublicShare/g)).toHaveLength(1);

    // Miroir de loadEventPublicContext : draft et archived → 404. La règle
    // n'est plus RECOPIÉE ici — elle est lue depuis `salleOuverteAuJoueur`
    // (`src/lib/event.ts`), désormais le seul endroit où elle s'écrit, et que
    // `event.test.ts` compare aux cinq statuts. Trois copies littérales
    // vivaient jusque-là côté SQL, côté contexte et côté éditeur ; c'est cette
    // dispersion qui avait laissé « Écran » pointer sur un 404.
    expect(editor).toContain(
      'import { salleOuverteAuJoueur } from "@/lib/event"',
    );
    const gate = "salleOuverteAuJoueur(session.status) ? (";
    const start = editor.indexOf(gate);
    expect(start).toBeGreaterThan(-1);

    const elseAt = editor.indexOf(") : (", start);
    expect(elseAt).toBeGreaterThan(start);

    expect(editor.slice(start, elseAt)).toContain("<PublicShare");
    expect(editor.slice(elseAt)).not.toContain("<PublicShare");
    expect(editor.slice(elseAt)).toMatch(/Ouvrez le salon/);
  });

  it("garde le QR d'écran de salle intact : ce n'est pas le même besoin", () => {
    // `EventJoinQr` est projeté PENDANT la soirée (data-URL, écran sombre) ;
    // `PublicShare` prépare une affiche AVANT (PNG 1024 px). Remplacer l'un par
    // l'autre reviendrait à demander au commerçant de photographier son écran.
    const screenQr = source("src/components/event/event-qr.tsx");
    expect(screenQr).toContain("export function EventJoinQr");
    expect(editor).not.toContain("@/components/event/event-qr");
    expect(editor).not.toMatch(/<EventJoinQr/);
  });
});

/**
 * PARRAINAGE — AUCUN QR COMMERÇANT, ET C'EST LA CONCLUSION, PAS UN OUBLI.
 *
 * Le module n'a pas de route publique à lui. Son lien est
 * `${origin}/play/[slug]?ref=<code>` et il est fabriqué CÔTÉ JOUEUR
 * (`referral-panel.tsx`), avec le code du parrain courant : il n'existe pas
 * d'« URL du module parrainage » que le commerçant pourrait imprimer.
 *
 * Les deux seules formes qu'un QR commerçant pourrait prendre sont mauvaises :
 *  - `/play/[slug]` sans `?ref=` : c'est déjà le QR de la campagne roue, servi
 *    par `/dashboard/qr-codes`. En reposer un second sous l'étiquette
 *    « parrainage » ferait croire au commerçant qu'il imprime autre chose ;
 *  - `/play/[slug]?ref=<code>` avec un code choisi par le commerçant : tous les
 *    scans arriveraient parrainés par la même personne — un parrainage sans
 *    parrain, qui verse des récompenses à un compte arbitraire.
 *
 * Le parrainage se propage de joueur à joueur ; son point d'entrée physique en
 * boutique EST le QR de la campagne. Ce test garde ce constat : le jour où
 * quelqu'un ajoute une route `/parrainage/…`, il rougit et la décision se
 * rejoue explicitement.
 */
describe("Parrainage", () => {
  it("n'a pas d'URL publique propre : le lien est bâti côté joueur, par parrain", () => {
    const panel = source("src/components/wheel/referral-panel.tsx");
    expect(panel).toContain("`${origin}/play/${slug}?ref=${sponsorCode}`");
    // Le code est celui du joueur courant, pas une constante du commerce.
    expect(panel).toContain("sponsorCode");
  });

  it("n'expose donc aucun bloc de partage commerçant", () => {
    const settings = source(
      "src/components/dashboard/referral-program-settings.tsx",
    );
    expect(settings).not.toContain("PublicShare");
  });
});

describe("PublicShare, une fois l'URL absolue reçue", () => {
  it.each([
    ["passeport", "https://app.lastchance.test/passeport/prog-uuid"],
    ["événement", "https://app.lastchance.test/event/K7QM2P"],
  ])("rend un QR scannable et un lien ouvrable pour le %s", (label, url) => {
    render(
      <PublicShare url={url} fileName={`${label}-exemple`} qrLabel={`Mon ${label}`} />,
    );
    expect(screen.getByText(url)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Ouvrir la page/ }).getAttribute("href"),
    ).toBe(url);
    expect(screen.getByLabelText(`QR code de Mon ${label}`)).toBeTruthy();
  });
});

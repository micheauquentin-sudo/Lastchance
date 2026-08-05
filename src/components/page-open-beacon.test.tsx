// @vitest-environment happy-dom
import { existsSync } from "node:fs";
import path from "node:path";

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PageOpenBeacon } from "@/components/page-open-beacon";

/**
 * LE DÉFAUT QUE CE FICHIER GARDE : un beacon qui appelle la mauvaise URL.
 *
 * Rien ne rougirait — le composant ne rend aucun DOM, `sendBeacon` n'attend
 * pas de réponse, et la route répond 204 dans TOUS les cas, y compris quand
 * elle n'a rien compris. Un paramètre mal nommé (`slug` au lieu d'`id`) ou un
 * module oublié produit donc un compteur qui reste à zéro pour toujours, sans
 * une erreur nulle part. La forme de l'URL est la seule chose observable.
 */

const beacon = vi.fn(() => true);

beforeEach(() => {
  vi.stubGlobal("navigator", { sendBeacon: beacon });
  beacon.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PageOpenBeacon", () => {
  it("la roue appelle le chemin roue, avec `slug` et rien d'autre", () => {
    // La FORME de cette URL — un seul paramètre, nommé `slug` — est ce que la
    // branche roue de la route sait lire. Le chemin, lui, a délibérément
    // changé (`/api/scan` → `/api/page-opens`) : voir le motif du renommage
    // sans alias dans src/app/api/page-opens/route.ts. Le compteur n'est pas
    // remis à zéro pour autant — il vit dans `qr_codes.scan_count`, que
    // l'adresse de la route ne touche pas.
    render(<PageOpenBeacon slug="promo-ete" />);
    expect(beacon).toHaveBeenCalledWith("/api/page-opens?slug=promo-ete");
  });

  it("un module appelle le chemin module, avec `id` et non `slug`", () => {
    render(<PageOpenBeacon module="quiz" publicId="quiz-de-noel" />);
    expect(beacon).toHaveBeenCalledWith(
      "/api/page-opens?module=quiz&id=quiz-de-noel",
    );
  });

  it("échappe l'identifiant public", () => {
    // Le code de jonction et l'uuid sont sûrs, mais rien n'impose qu'un futur
    // identifiant le soit : une esperluette non échappée découperait la
    // requête et ferait compter autre chose.
    render(<PageOpenBeacon module="events" publicId="A&B=C" />);
    expect(beacon).toHaveBeenCalledWith("/api/page-opens?module=events&id=A%26B%3DC");
  });

  it("n'envoie qu'UN signal par montage", () => {
    // Le compteur mesure des chargements de page ; un double envoi doublerait
    // le chiffre annoncé au commerçant.
    const { rerender } = render(<PageOpenBeacon module="quiz" publicId="noel" />);
    rerender(<PageOpenBeacon module="quiz" publicId="noel" />);
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it("ne rend aucun DOM", () => {
    // Posé en premier enfant de huit pages publiques : le moindre nœud
    // décalerait des mises en page déjà validées.
    const { container } = render(<PageOpenBeacon module="loyalty" publicId="x1" />);
    expect(container.innerHTML).toBe("");
  });

  it("appelle un chemin qui EXISTE dans src/app/api", () => {
    // Le seul lien entre l'URL écrite ici et le dossier de la route est une
    // convention : rien ne rougissait quand `/api/scan` est devenu
    // `/api/page-opens`, parce qu'un 404 se lit 204 côté beacon (sendBeacon
    // n'attend pas de réponse) et que la page ne montre rien. Il n'y a
    // volontairement AUCUN alias pour rattraper un chemin périmé — c'est ce
    // test qui tient l'invariant à la place.
    let appele = "";
    vi.stubGlobal("navigator", {
      sendBeacon: (url: string) => {
        appele = url;
        return true;
      },
    });

    render(<PageOpenBeacon slug="promo-ete" />);

    const { pathname } = new URL(appele, "https://app.example.com");
    expect(
      existsSync(
        path.join(process.cwd(), "src", "app", ...pathname.split("/"), "route.ts"),
      ),
      `${pathname} n'a pas de route.ts : le beacon appellerait dans le vide`,
    ).toBe(true);
  });

  it("se replie sur fetch keepalive quand sendBeacon est absent", () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null)));
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("fetch", fetchMock);

    render(<PageOpenBeacon module="jackpot" publicId="abcd" />);

    expect(fetchMock).toHaveBeenCalledWith("/api/page-opens?module=jackpot&id=abcd", {
      method: "POST",
      keepalive: true,
    });
  });
});

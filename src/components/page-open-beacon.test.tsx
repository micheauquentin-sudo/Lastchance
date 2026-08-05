// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScanBeacon } from "@/components/scan-beacon";

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

describe("ScanBeacon", () => {
  it("la roue garde EXACTEMENT son URL historique", () => {
    // Le chemin de la roue est livré et ses compteurs tournent en production :
    // changer sa forme d'URL remettrait à zéro un comptage en cours.
    render(<ScanBeacon slug="promo-ete" />);
    expect(beacon).toHaveBeenCalledWith("/api/scan?slug=promo-ete");
  });

  it("un module appelle le chemin module, avec `id` et non `slug`", () => {
    render(<ScanBeacon module="quiz" publicId="quiz-de-noel" />);
    expect(beacon).toHaveBeenCalledWith(
      "/api/scan?module=quiz&id=quiz-de-noel",
    );
  });

  it("échappe l'identifiant public", () => {
    // Le code de jonction et l'uuid sont sûrs, mais rien n'impose qu'un futur
    // identifiant le soit : une esperluette non échappée découperait la
    // requête et ferait compter autre chose.
    render(<ScanBeacon module="events" publicId="A&B=C" />);
    expect(beacon).toHaveBeenCalledWith("/api/scan?module=events&id=A%26B%3DC");
  });

  it("n'envoie qu'UN signal par montage", () => {
    // Le compteur mesure des chargements de page ; un double envoi doublerait
    // le chiffre annoncé au commerçant.
    const { rerender } = render(<ScanBeacon module="quiz" publicId="noel" />);
    rerender(<ScanBeacon module="quiz" publicId="noel" />);
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it("ne rend aucun DOM", () => {
    // Posé en premier enfant de six pages publiques : le moindre nœud
    // décalerait des mises en page déjà validées.
    const { container } = render(<ScanBeacon module="loyalty" publicId="x1" />);
    expect(container.innerHTML).toBe("");
  });

  it("se replie sur fetch keepalive quand sendBeacon est absent", () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null)));
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("fetch", fetchMock);

    render(<ScanBeacon module="jackpot" publicId="abcd" />);

    expect(fetchMock).toHaveBeenCalledWith("/api/scan?module=jackpot&id=abcd", {
      method: "POST",
      keepalive: true,
    });
  });
});

// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import PrivacyPage from "./page";

/**
 * La liste des sous-traitants publiée est une DÉCLARATION, pas un décor :
 * l'article 13 du RGPD exige que les destinataires des données soient
 * annoncés. Elle avait déjà divergé du code — deux tiers recevaient des
 * données personnelles sans y figurer :
 *
 *  - Brevo, qui reçoit le NUMÉRO DE TÉLÉPHONE du gagnant à chaque SMS ;
 *  - Upstash, dont la clé de seau anti-abus contient l'ADRESSE IP.
 *
 * Ce fichier tient la liste au niveau du RENDU (pas de la source) et rougit
 * dès qu'un nom en disparaît. Il ne peut pas prouver l'inverse — qu'un tiers
 * ajouté au code soit ajouté ici — mais il ferme la régression constatée :
 * un nom retiré de la page alors que le flux, lui, subsiste.
 */

afterEach(cleanup);

/** Texte rendu de la page entière, espaces normalisés. */
function texteRendu(): string {
  const { container } = render(<PrivacyPage />);
  return (container.textContent ?? "").replace(/\s+/g, " ");
}

/** La phrase qui cite ce tiers — pour vérifier ce qu'elle DIT, pas juste le nom. */
function phraseCitant(tiers: string): string {
  return (
    texteRendu()
      .split(/(?<=\.)\s+/)
      .find((phrase) => phrase.includes(tiers)) ?? ""
  );
}

describe("Politique de confidentialité — sous-traitants annoncés", () => {
  it.each([
    "Supabase",
    "Cloudflare",
    "Resend",
    "Stripe",
    "Sentry",
    "PostHog",
    "Brevo",
    "Upstash",
  ])("cite %s", (nom) => {
    expect(texteRendu()).toContain(nom);
  });

  it("dit ce que reçoit Brevo et à quelle condition", () => {
    // Nommer le tiers sans dire la donnée ni la condition ne vaut pas
    // information : le lecteur doit savoir que c'est SON numéro qui part, et
    // que rien ne part si le commerçant n'a pas activé le canal SMS.
    const phrase = phraseCitant("Brevo");

    expect(phrase).toMatch(/numéro de téléphone/i);
    expect(phrase).toMatch(/SMS/);
  });

  it("dit ce que reçoit Upstash et à quelle condition", () => {
    const phrase = phraseCitant("Upstash");

    expect(phrase).toMatch(/adresse IP/i);
    expect(phrase).toMatch(/abus/i);
  });
});

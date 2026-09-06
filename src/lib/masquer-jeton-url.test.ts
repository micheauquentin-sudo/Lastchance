import { describe, expect, it } from "vitest";
import { masquerJetonUrl } from "./masquer-jeton-url";

/**
 * Deux exigences opposées se rencontrent ici, et le test les tient toutes deux :
 *  - AUCUNE forme d'URL portant `/commande/<jeton>`, `/hunt/<jeton>` ou
 *    `/invite/<jeton>` ne doit ressortir intacte — c'est un secret rejouable ;
 *  - RIEN d'autre ne doit changer — masquer large rendrait les journaux
 *    illisibles et le premier incident de production indéchiffrable.
 */

const JETON = "9f2c1ab4d8e7-QRCODE";

describe("masquerJetonUrl — ce qui doit disparaître", () => {
  it.each([
    ["chemin relatif de commande", `/commande/${JETON}`, "/commande/[jeton]"],
    ["chemin relatif de chasse", `/hunt/${JETON}`, "/hunt/[jeton]"],
    // L'invitation d'équipe : qui ouvre ce lien rejoint l'organisation avec
    // le rôle inscrit dans le jeton. Sept jours de validité, donc sept jours
    // pendant lesquels une ligne de journal chez un tiers vaut un accès.
    ["invitation d'équipe", `/invite/${JETON}`, "/invite/[jeton]"],
    // L'invitation privée Réserver : révocable et bornée en usages, mais tant
    // qu'elle vit, la ligne de journal d'un tiers vaut une place réservée.
    [
      "invitation privée Réserver",
      `/reserver/invitation/${JETON}`,
      "/reserver/invitation/[jeton]",
    ],
    [
      "URL absolue",
      `https://app.lastchance.fr/commande/${JETON}`,
      "https://app.lastchance.fr/commande/[jeton]",
    ],
    [
      "URL protocol-relative",
      `//app.lastchance.fr/hunt/${JETON}`,
      "//app.lastchance.fr/hunt/[jeton]",
    ],
  ])("%s", (_cas, entree, attendu) => {
    expect(masquerJetonUrl(entree)).toBe(attendu);
  });

  /**
   * LE JETON EXACT QUE PARCOURT L'E2E, dans la forme exacte de `$current_url`.
   *
   * C'est ici, et NON dans `e2e/reserver.spec.ts`, que le masquage analytique
   * se prouve : dans le navigateur, le jeton est LÉGITIMEMENT présent — c'est
   * l'adresse de la page — et l'E2E ne peut donc rien affirmer d'autre que
   * « il n'est pas lisible à l'écran, ni emporté ailleurs ». La question « et
   * que part-il chez PostHog et Sentry ? » se tranche sur la fonction pure qui
   * en décide, avec la valeur réelle plutôt qu'un jeton de laboratoire : ce
   * jeton-ci porte des MAJUSCULES et des tirets, et un motif trop strict sur
   * les minuscules l'aurait laissé passer intact.
   */
  it("masque le jeton d'invitation du parcours E2E, tel qu'il part en analytics", () => {
    const jetonE2E = "E2E-INVIT-TOKEN-0000000000000000";
    expect(
      masquerJetonUrl(`https://localhost:3443/reserver/invitation/${jetonE2E}`),
    ).toBe("https://localhost:3443/reserver/invitation/[jeton]");
    expect(masquerJetonUrl(`/reserver/invitation/${jetonE2E}`)).not.toContain(
      jetonE2E,
    );
  });

  it("préserve la query, qui porte le diagnostic", () => {
    expect(
      masquerJetonUrl(`https://app.lastchance.fr/commande/${JETON}?src=qr&page=2`),
    ).toBe("https://app.lastchance.fr/commande/[jeton]?src=qr&page=2");
  });

  it("préserve le fragment", () => {
    expect(masquerJetonUrl(`/hunt/${JETON}#etape-3`)).toBe("/hunt/[jeton]#etape-3");
  });

  it("préserve la suite du chemin", () => {
    expect(masquerJetonUrl(`/commande/${JETON}/imprimer`)).toBe(
      "/commande/[jeton]/imprimer",
    );
  });

  it("ne dépend pas de la casse du préfixe", () => {
    // Un lien recopié à la main, un proxy qui normalise, un `$referrer`
    // reconstitué : la casse n'est pas garantie, le masquage doit tenir quand
    // même — Next servirait un 404, mais le jeton serait déjà parti chez le tiers.
    expect(masquerJetonUrl(`/Commande/${JETON}`)).toBe("/Commande/[jeton]");
    expect(masquerJetonUrl(`/HUNT/${JETON}`)).toBe("/HUNT/[jeton]");
  });

  it("masque au fil d'un texte libre, pas seulement en tête de chemin", () => {
    // Forme exacte d'un breadcrumb `fetch` ou d'un message d'erreur Next.
    expect(masquerJetonUrl(`GET /commande/${JETON} 404 (Not Found)`)).toBe(
      "GET /commande/[jeton] 404 (Not Found)",
    );
  });

  it("masque TOUTES les occurrences, pas seulement la première", () => {
    expect(masquerJetonUrl(`/commande/${JETON} → /hunt/${JETON}`)).toBe(
      "/commande/[jeton] → /hunt/[jeton]",
    );
  });

  it("reste stable en appels répétés (motif global sans état résiduel)", () => {
    // Un motif `/g` partagé au niveau module conserve `lastIndex` avec `.test`
    // et `.exec` : le deuxième appel raterait alors une occurrence sur deux.
    const entree = `/commande/${JETON}`;
    expect(masquerJetonUrl(entree)).toBe(masquerJetonUrl(entree));
    expect(masquerJetonUrl(entree)).toBe("/commande/[jeton]");
  });

  it("est idempotent : masquer un chemin déjà masqué ne l'abîme pas", () => {
    expect(masquerJetonUrl("/commande/[jeton]")).toBe("/commande/[jeton]");
  });
});

describe("masquerJetonUrl — le jeton qui voyage ENCODÉ dans ?next=", () => {
  /**
   * `/invite/<jeton>` redirige un visiteur non connecté vers /login et /signup
   * en emportant sa destination : `?next=%2Finvite%2F…`. Les `/` y sont
   * percent-encodés, donc le masquage de CHEMIN ne voit rien — et ces deux
   * pages-là sont vues par tout le monde, tout le temps.
   */
  it("masque l'invitation encodée vers /login", () => {
    expect(masquerJetonUrl(`/login?next=%2Finvite%2F${JETON}`)).toBe(
      "/login?next=%2Finvite%2F[jeton]",
    );
  });

  it("masque sans toucher aux autres paramètres ni à leur ordre", () => {
    expect(
      masquerJetonUrl(`/signup?src=email&next=%2Finvite%2F${JETON}&plan=pro`),
    ).toBe("/signup?src=email&next=%2Finvite%2F[jeton]&plan=pro");
  });

  it("couvre aussi les deux autres préfixes porteurs", () => {
    expect(masquerJetonUrl(`/login?next=%2Fcommande%2F${JETON}`)).toBe(
      "/login?next=%2Fcommande%2F[jeton]",
    );
  });

  it("masque la forme NON encodée, déjà couverte par le chemin", () => {
    expect(masquerJetonUrl(`/login?next=/invite/${JETON}`)).toBe(
      "/login?next=/invite/[jeton]",
    );
  });

  it("laisse une destination inoffensive OCTET POUR OCTET", () => {
    // Ré-encoder pour rien changerait la forme des URLs de tout le monde —
    // `%2F` deviendrait `%2F` mais l'accent ou l'espace, eux, se
    // normaliseraient — et casserait le regroupement des pageviews /login.
    const url = "/login?next=%2Fdashboard%2Fparticipations%3Fpage%3D2";
    expect(masquerJetonUrl(url)).toBe(url);
  });

  it("ne lève pas sur une séquence % invalide", () => {
    // `decodeURIComponent` jette sur `%zz`. Ce module tourne dans `before_send`
    // de PostHog, sur CHAQUE événement : lever ici casserait toute la capture.
    const url = "/login?next=%zz%2Finvite";
    expect(masquerJetonUrl(url)).toBe(url);
  });

  it("est idempotent sur une valeur déjà masquée", () => {
    expect(masquerJetonUrl("/login?next=%2Finvite%2F[jeton]")).toBe(
      "/login?next=%2Finvite%2F[jeton]",
    );
  });
});

describe("masquerJetonUrl — ce qui doit rester intact", () => {
  it.each([
    ["chaîne vide", ""],
    ["racine", "/"],
    ["page publique", "/privacy"],
    ["dashboard", "/dashboard/participations?statut=a-valider"],
    ["liste des chasses, au PLURIEL", "/dashboard/hunts/8f1c-2ab3"],
    ["mot commençant par le préfixe d'invitation", "/dashboard/invitations/12"],
    ["préfixe sans jeton", "/commande/"],
    ["préfixe seul, sans slash final", "/commande"],
    ["segment homonyme au milieu d'un mot", "/mes-commandes/12"],
    ["URL d'un tiers", "https://api.stripe.com/v1/checkout/sessions/cs_test_123"],
    ["message d'erreur ordinaire", "duplicate key value violates constraint"],
  ])("%s", (_cas, entree) => {
    expect(masquerJetonUrl(entree)).toBe(entree);
  });

  it("laisse intact un paramètre au nom anodin, même à valeur longue", () => {
    // La contrepartie du masquage par nom : ce qui n'annonce pas un secret
    // reste lisible, sinon l'analytique ne sert plus à rien.
    expect(masquerJetonUrl(`/jouer?campaign=${JETON}&page=2`)).toBe(
      `/jouer?campaign=${JETON}&page=2`,
    );
  });
});

/**
 * LE POSTE QUE PERSONNE NE TENAIT.
 *
 * Ces cas-là ne sont pas une redondance avec `sentry-scrub` : ils sont la
 * seule chose qui les protège chez PostHog, qui ne branche QUE ce module
 * (`src/components/analytics.tsx`, `before_send`). L'ancien commentaire de
 * `masquer-jeton-url.ts` — « les autres paramètres restent l'affaire de
 * sentry-scrub » — était vrai pour Sentry et faux pour le destinataire qui
 * reçoit l'URL de CHAQUE pageview.
 */
describe("masquerJetonUrl — les secrets qui voyagent en QUERY", () => {
  it.each([
    [
      "récupération de pronostics (lien magique)",
      "/pronos/tournoi-ete/recover?token=abc123def456",
      "/pronos/tournoi-ete/recover?token=[jeton]",
    ],
    [
      // Celui-ci ne périme JAMAIS (`src/lib/unsubscribe.ts`) : une ligne de
      // journal chez un tiers vaut une désinscription à vie, y compris dans
      // deux ans.
      "désinscription newsletter (jeton PERMANENT)",
      "/newsletter/unsubscribe?token=v1.abcdef.ghijkl",
      "/newsletter/unsubscribe?token=[jeton]",
    ],
    [
      "URL absolue, comme la voit $current_url",
      "https://app.lastchance.fr/newsletter/unsubscribe?token=secret",
      "https://app.lastchance.fr/newsletter/unsubscribe?token=[jeton]",
    ],
    [
      "signature d'URL de stockage",
      "/api/wallet?sig=deadbeef&slug=cafe",
      "/api/wallet?sig=[jeton]&slug=cafe",
    ],
    [
      "casse et séparateurs du nom : la liste est normalisée",
      "/x?Token_Hash=abc&page=2",
      "/x?Token_Hash=[jeton]&page=2",
    ],
  ])("%s", (_cas, entree, attendu) => {
    expect(masquerJetonUrl(entree)).toBe(attendu);
  });

  it("garde le chemin, l'ordre et les paramètres de diagnostic", () => {
    expect(
      masquerJetonUrl("/pronos/x/recover?src=email&token=zzz&page=2#bas"),
    ).toBe("/pronos/x/recover?src=email&token=[jeton]&page=2#bas");
  });

  it("est idempotent", () => {
    expect(masquerJetonUrl("/x?token=[jeton]")).toBe("/x?token=[jeton]");
  });

  it("masque aussi le jeton encodé DANS ?next=", () => {
    // `?next=%2Fpronos%2Fx%2Frecover%3Ftoken%3Dabc` : ni le `?` ni le `&` ne
    // sont littéraux, le masquage de premier niveau ne voit donc rien. C'est
    // la valeur décodée qu'il faut repasser au masquage COMPLET, chemin et
    // query — et non au seul masquage de chemin, comme avant.
    const sortie = masquerJetonUrl(
      "/login?next=%2Fpronos%2Fx%2Frecover%3Ftoken%3Dsecret-value",
    );
    expect(sortie).not.toContain("secret-value");
    expect(sortie).toContain("[jeton]");
  });
});

/**
 * `/ticket/<code>` — LE PIRE CAS DE LA CLASSE, et le dernier repéré.
 *
 * Le code de retrait est dans le CHEMIN, donc dans `$pathname` ET
 * `$current_url`. Et il n'est PAS consommé au GET (choix délibéré : un
 * préchargement ou un antivirus qui suit les liens aurait joué à la place du
 * client) : il reste donc actif et rejouable pendant et après la pageview qui
 * l'emporte. Il n'était couvert par AUCUNE des deux listes, ni par les
 * en-têtes.
 */
describe("masquerJetonUrl — le Ticket d'or", () => {
  it("masque le code, dans la forme exacte de CODE_TICKET (10 caractères)", () => {
    // `src/lib/ticket-or.ts` : /^[A-HJ-NP-Z2-9]{10}$/ — pas de préfixe
    // `TICKET-` ici. Ce code-là n'est donc PAS couvert par
    // `REDEEM_CODE_PATTERN`, qui travaille sur la forme préfixée du registre :
    // seul le préfixe de CHEMIN le ferme.
    expect(masquerJetonUrl("/ticket/ABCDEFGHJK")).toBe("/ticket/[jeton]");
    expect(
      masquerJetonUrl("https://app.lastchance.fr/ticket/ABCDEFGHJK"),
    ).toBe("https://app.lastchance.fr/ticket/[jeton]");
  });

  it("laisse le studio du commerçant tranquille", () => {
    // ROUGE SI : quelqu'un élargit le préfixe et emporte les pages du
    // dashboard avec — leurs identifiants sont du diagnostic, pas un secret.
    expect(masquerJetonUrl("/dashboard/tickets/8f1c-2ab3")).toBe(
      "/dashboard/tickets/8f1c-2ab3",
    );
  });
});

/**
 * LES CODES DE RETRAIT EN QUERY — le reliquat du premier lot.
 *
 * `/dashboard/redeem?code=GAIN-ABCD2345` est l'URL du comptoir, envoyée telle
 * quelle à PostHog à chaque pageview. Le nom `code` ne peut pas la trancher —
 * il doit rester lisible, c'est aussi le SQLSTATE et le code PKCE de
 * `/auth/callback` — donc c'est la FORME de la valeur qui décide.
 *
 * Le motif est PARTAGÉ avec `sentry-scrub` (`cles-sensibles.ts`) : une copie
 * aurait divergé au douzième préfixe, exactement comme les listes de noms.
 */
describe("masquerJetonUrl — les codes de retrait en query", () => {
  it("masque le code du comptoir, dont le nom de paramètre est anodin", () => {
    expect(masquerJetonUrl("/dashboard/redeem?code=GAIN-ABCD2345")).toBe(
      "/dashboard/redeem?code=[code]",
    );
  });

  it("couvre les onze familles, quel que soit le nom du paramètre", () => {
    for (const code of [
      "GAIN-ABCD2345",
      "CHASSE-EFGH2345",
      "FIDELITE-JKLM2345",
      "JACKPOT-NPQR2345",
      "EVENT-STUV2345",
      "CADEAU-WXYZ2345",
      "PARRAIN-ABCD3456",
      "QUIZ-EFGH3456",
      "PRONO-JKLM3456",
      "TICKET-NPQR3456",
      "RESA-STUV3456",
    ]) {
      const sortie = masquerJetonUrl(`/dashboard/redeem?q=${code}&remis=1`);
      expect(sortie, `${code} doit être masqué`).not.toContain(code);
      // Le reste de la query survit : c'est le diagnostic.
      expect(sortie).toContain("remis=1");
    }
  });

  it("laisse le chemin intact autour de la query masquée", () => {
    expect(
      masquerJetonUrl("https://app.lastchance.fr/dashboard/redeem?code=GAIN-ABCD2345"),
    ).toBe("https://app.lastchance.fr/dashboard/redeem?code=[code]");
  });

  it("est idempotent", () => {
    expect(masquerJetonUrl("/dashboard/redeem?code=[code]")).toBe(
      "/dashboard/redeem?code=[code]",
    );
  });
});

/**
 * LA CONTREPARTIE, ET C'EST ELLE QUI A DÉCIDÉ DE LA FORME DU CORRECTIF.
 *
 * `REDEEM_CODE_PATTERN` travaille sur une forme GÉNÉRIQUE
 * (`PREFIXE-[A-HJ-NP-Z2-9]{6,10}`), et deux slugs du produit acceptent les
 * MAJUSCULES en base — `qr_codes.slug` et `contests.slug`, seuls slugs dans ce
 * cas (`^[A-Za-z0-9-]{4,64}$`, migration 00001 ; tous les autres sont
 * `^[a-z0-9-]`). `/play/EVENT-BRETAGNE` est donc une URL parfaitement
 * légitime, de la forme exacte d'un code de retrait.
 *
 * D'où la restriction : le motif ne s'applique qu'à la QUERY. Le chemin est la
 * dimension de regroupement de PostHog — le manger rendrait illisible ce que
 * le commerçant regarde, pour fermer une fuite qui n'existe pas : aucune route
 * du produit ne porte un code PRÉFIXÉ dans son chemin.
 */
describe("masquerJetonUrl — le chemin n'est PAS soumis à la forme des codes", () => {
  it.each([
    ["slug de QR en majuscules", "/play/EVENT-BRETAGNE"],
    ["autre slug qui a la forme d'un code", "/play/CADEAU-DECEMBRE"],
    ["slug de championnat", "/pronos/QUIZ-PRINTEMPS"],
  ])("%s reste lisible", (_cas, entree) => {
    // ROUGE SI : quelqu'un applique `REDEEM_CODE_PATTERN` au chemin en pensant
    // « masquer plus, c'est masquer mieux ». Ce n'est pas vrai ici : ça ne
    // ferme rien et ça coûte l'analytique de la campagne.
    expect(masquerJetonUrl(entree)).toBe(entree);
  });

  it("le code de salon et celui du Ticket d'or sont NUS, donc hors du motif", () => {
    // Ils sont fermés par leur préfixe de CHEMIN, pas par leur forme — un code
    // nu est indiscernable d'un identifiant technique.
    expect(masquerJetonUrl("/lobby/ABC234")).toBe("/lobby/ABC234");
    expect(masquerJetonUrl("/ticket/ABCDEFGHJK")).toBe("/ticket/[jeton]");
  });
});

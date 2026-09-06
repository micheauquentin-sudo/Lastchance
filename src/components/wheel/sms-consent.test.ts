import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SMS_CONSENT_MERCHANT_TOKEN,
  SMS_CONSENT_VERSION,
  smsConsentLabel,
  smsConsentText,
} from "@/lib/claim-libelles";

/**
 * GARDE DE SOURCE — la case de consentement SMS du parcours joueur.
 *
 * ── Pourquoi une garde de SOURCE ──
 *
 * Un attribut JSX est vérifié ici par lecture du fichier. Depuis le
 * 2026-08-04 le rendu React est disponible en test
 * (`// @vitest-environment happy-dom`) : c'est un choix, pas une contrainte —
 * la garde de source prouve la forme, pas le pixel. Même parti pris que
 * `destructive-confirm-coverage.test.ts` et `weekly-digest-anchor.test.ts`.
 *
 * ── Ce qu'elle ferme, et pourquoi ça vaut un test ──
 *
 * Les trois propriétés vérifiées ici ne se voient pas à la relecture et ne se
 * voient pas non plus à l'usage : une case pré-cochée fonctionne, une case
 * mal nommée s'affiche et se coche, une case fusionnée avec celle de l'e-mail
 * envoie bien des SMS. Les trois produisent un produit qui MARCHE et un
 * consentement qui n'en est pas un — c'est-à-dire le seul type de défaut qu'on
 * ne découvre qu'au contrôle, des mois plus tard.
 *
 * 1. JAMAIS PRÉ-COCHÉE — un consentement doit être préalable et explicite.
 * 2. DISTINCT DE L'E-MAIL — la loi traite les deux canaux séparément ; un
 *    joueur peut vouloir l'un sans l'autre.
 * 3. LE NOM DU CHAMP EST CELUI QUE LE SUBMIT LIT, et le paramètre transporté
 *    est celui que le schéma serveur déclare — sinon la case existe, se coche,
 *    et ne consent à rien. Rien ne rougit, rien ne s'affiche.
 *
 * ── CE QUI A CHANGÉ, ET POURQUOI CETTE GARDE A DÛ BOUGER ──
 *
 * Le consentement partait autrefois dans une action DÉDIÉE
 * (`submitSmsConsent`), envoyée par le navigateur APRÈS la réponse du claim —
 * et une assertion de ce fichier EXIGEAIT cette séparation. Elle avait tort
 * pour une raison qu'elle ne pouvait pas voir : `claimPrize` dépose le code de
 * retrait par SMS À L'INTÉRIEUR du claim, et ce dépôt commence par lire
 * `sms_consents`. Au PREMIER gain d'un couple (organisation, numéro), le
 * consentement n'était pas encore écrit, aucun job n'était déposé, et rien ne
 * rattrapait. La séparation des transports ne protégeait donc rien — elle
 * garantissait qu'aucun primo-gagnant ne reçoive jamais son code.
 *
 * Ce qui compte réellement, et ce que ce fichier vérifie désormais, ce n'est
 * pas PAR QUEL APPEL le consentement voyage, c'est ce que le serveur en fait :
 * une VERSION archivée plutôt qu'un booléen, une organisation qu'il résout
 * lui-même, et jamais de réactivation implicite d'un numéro retiré.
 *
 * ── Ce qu'elle ne couvre PAS ──
 *
 * Elle ne connaît qu'un seul point de pose : `claim-form.tsx`. Une seconde
 * case SMS ajoutée demain sur un autre parcours devra être inscrite ici.
 */

/** Sources, en LF — le dépôt est en CRLF. */
function source(chemin: string): string {
  return readFileSync(chemin, "utf8").replace(/\r\n/g, "\n");
}

const FORMULAIRE = "src/components/wheel/claim-form.tsx";
/** Là où le consentement devient une écriture datée et versionnée. */
const ECRITURE = "src/lib/sms-prize.ts";
/** Le schéma serveur qui déclare le paramètre transporté par le claim. */
const SCHEMA = "src/lib/validations/play.ts";
/** L'action qui ordonne consentement PUIS dépôt. */
const CLAIM = "src/actions/play.ts";

const SRC_FORM = source(FORMULAIRE);
const SRC_ECRITURE = source(ECRITURE);
const SRC_SCHEMA = source(SCHEMA);
const SRC_CLAIM = source(CLAIM);

/**
 * Le bloc d'appel à `claimPrize` du formulaire, borné à sa construction.
 *
 * Non borné, il courrait jusqu'à la fin du fichier et attraperait le JSX —
 * la garde parlerait alors d'un envoi qui n'existe pas.
 */
function blocClaim(src: string): string {
  const debut = src.indexOf("result = await claimPrize({");
  expect(debut, "le formulaire n'appelle plus claimPrize").toBeGreaterThan(-1);
  const fin = src.indexOf("} catch {", debut);
  expect(fin, "l'appel à claimPrize n'est plus enveloppé").toBeGreaterThan(debut);
  return src.slice(debut, fin);
}

/**
 * Le nom du champ tel que le SUBMIT le lit — extrait, jamais recopié. C'est le
 * pivot de la garde 3 : si le submit change de nom, c'est ici que la nouvelle
 * valeur arrive, et c'est l'`<input>` qui rougit.
 */
const CHAMP_OPT_IN = (() => {
  const m = /form\.get\("(sms_[a-z_]+)"\) === "on"/.exec(blocClaim(SRC_FORM));
  expect(m, "le claim ne transporte plus de consentement SMS").not.toBeNull();
  return m![1];
})();

/**
 * Le nom du PARAMÈTRE serveur porteur du consentement, extrait de l'appel —
 * jamais recopié non plus. Il doit exister dans le schéma, sinon Zod le laisse
 * tomber en silence et la case ne consent à rien.
 */
const PARAM_OPT_IN = (() => {
  const m = new RegExp(`(\\w+): form\\.get\\("${CHAMP_OPT_IN}"\\)`).exec(
    blocClaim(SRC_FORM),
  );
  expect(m, "le consentement SMS n'est plus passé en paramètre").not.toBeNull();
  return m![1];
})();

/**
 * L'élément `<input …/>` qui porte ce champ, isolé. On remonte au `<input`
 * ouvrant et on descend au `/>` fermant plutôt que de prendre « N lignes
 * autour » : la garde reste insensible à la mise en forme.
 */
function inputPortant(src: string, champ: string): string {
  const cible = src.indexOf(`name="${champ}"`);
  expect(cible, `champ ${champ} introuvable dans ${FORMULAIRE}`).toBeGreaterThan(-1);
  const debut = src.lastIndexOf("<input", cible);
  const fin = src.indexOf("/>", cible);
  expect(debut, `aucun <input au-dessus de ${champ}`).toBeGreaterThan(-1);
  expect(fin, `<input ${champ} non refermé`).toBeGreaterThan(cible);
  return src.slice(debut, fin + 2);
}

/**
 * Le `<label>` qui enveloppe ce champ, COMMENTAIRES RETIRÉS.
 *
 * Le retrait n'est pas cosmétique : ce qui compte pour un consentement est ce
 * que la personne LIT. Un commentaire de code n'est pas affiché, et laisser la
 * garde le lire l'a effectivement fait rougir à sa première exécution — sur un
 * commentaire qui expliquait précisément la formule à ne pas écrire.
 */
function labelPortant(src: string, champ: string): string {
  const cible = src.indexOf(`name="${champ}"`);
  expect(cible, `champ ${champ} introuvable`).toBeGreaterThan(-1);
  const debut = src.lastIndexOf("<label", cible);
  const fin = src.indexOf("</label>", cible);
  expect(debut, `aucun <label autour de ${champ}`).toBeGreaterThan(-1);
  expect(fin, `<label de ${champ} non refermé`).toBeGreaterThan(cible);
  return src.slice(debut, fin).replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "");
}

describe("GARDE 1 — la case SMS n'est jamais pré-cochée", () => {
  it("l'input ne porte ni defaultChecked ni checked", () => {
    // ROUGE SI : quelqu'un pose `defaultChecked` « pour la conversion », ou
    // contrôle la case sur un état initialisé à `true`. Une case pré-cochée
    // n'est pas un consentement — en droit français, pas seulement en style.
    const input = inputPortant(SRC_FORM, CHAMP_OPT_IN);
    expect(input, "case SMS pré-cochée").not.toMatch(/\bdefaultChecked\b/);
    expect(input, "case SMS contrôlée : son état initial décide du coché")
      .not.toMatch(/\bchecked=/);
  });

  it("elle reste NON CONTRÔLÉE, donc vide au premier rendu", () => {
    // Corollaire du point ci-dessus, énoncé à part parce que c'est LUI qui
    // fait que l'absence vaut refus : un champ non contrôlé et non coché
    // n'est pas envoyé par le navigateur. L'action lit `=== "on"` et ne voit
    // rien — aucune écriture, et surtout aucun « a refusé » enregistré.
    const input = inputPortant(SRC_FORM, CHAMP_OPT_IN);
    expect(input).toContain('type="checkbox"');
    expect(input, "un onChange trahit une case contrôlée").not.toMatch(
      /\bonChange\b/,
    );
  });

  it("le submit ne traite l'absence du champ que comme un refus", () => {
    // L'autre bout de la même propriété. ROUGE SI le formulaire se met à
    // envoyer `true` sur une case absente : le serveur écrirait alors un
    // consentement que personne n'a donné.
    const claim = blocClaim(SRC_FORM);
    expect(claim).toMatch(new RegExp(`form\\.get\\("${CHAMP_OPT_IN}"\\) === "on"`));
    expect(claim).not.toMatch(/=== "off"|!== "on" \? true/);
  });

  it("le serveur n'écrit RIEN quand le consentement n'est pas donné", () => {
    // ── LA GARDE A SUIVI L'ÉCRITURE, ELLE N'A PAS ÉTÉ AFFAIBLIE ──
    //
    // Elle épinglait « l'appel `recordPrizeSmsConsent` est sous un `if` ».
    // Cet appel n'existe plus : le consentement voyage dans les arguments de
    // `claim_winning_spin` (`p_sms_opt_in`) pour être committé AVEC le gain
    // (migration 20261213120000) — il ne peut donc plus se perdre entre le
    // commit et l'envoi, ce qui coûtait le canal SMS entier au client.
    //
    // Ce qu'il faut encore prouver est identique : la valeur transmise est
    // DÉRIVÉE de la case, jamais posée à vrai.
    expect(
      SRC_CLAIM,
      "`p_sms_opt_in` n'est plus transmis à la réclamation",
    ).toMatch(/p_sms_opt_in:\s*\w/);
    expect(
      SRC_CLAIM,
      "le consentement est transmis sans jamais regarder la case",
    ).toMatch(new RegExp(`parsed\\.data\\.${PARAM_OPT_IN}`));
    // ROUGE SI : quelqu'un court-circuite la dérivation.
    expect(SRC_CLAIM, "consentement posé à vrai en dur").not.toMatch(
      /p_sms_opt_in:\s*true/,
    );
  });
});

describe("GARDE 2 — le consentement SMS n'est pas celui de l'e-mail", () => {
  it("ce sont deux champs distincts", () => {
    expect(SRC_FORM).toContain(`name="${CHAMP_OPT_IN}"`);
    expect(SRC_FORM).toContain('name="marketingOptIn"');
    expect(CHAMP_OPT_IN).not.toBe("marketingOptIn");
  });

  it("aucune des deux cases ne vit dans le label de l'autre", () => {
    // ROUGE SI : quelqu'un fond les deux en une case unique, ou glisse l'une
    // dans le libellé de l'autre. Le joueur cocherait alors un canal en
    // croyant en cocher un autre — et le consentement des deux tomberait.
    expect(labelPortant(SRC_FORM, CHAMP_OPT_IN)).not.toContain("marketingOptIn");
    expect(labelPortant(SRC_FORM, "marketingOptIn")).not.toContain(CHAMP_OPT_IN);
  });

  it("la case SMS n'est pas subordonnée à l'opt-in e-mail", () => {
    // Le bloc `{marketingOptIn && (…)}` porte l'anniversaire, qui EST une
    // sous-option de l'e-mail. Le SMS n'en est pas une : il doit être
    // cochable par quelqu'un qui refuse l'e-mail. On vérifie donc qu'il est
    // rendu AVANT ce bloc conditionnel, jamais dedans.
    const iSms = SRC_FORM.indexOf(`name="${CHAMP_OPT_IN}"`);
    const iBloc = SRC_FORM.indexOf("{marketingOptIn && (");
    expect(iBloc, "le bloc conditionnel de l'e-mail a disparu").toBeGreaterThan(-1);
    expect(iSms, "la case SMS est passée sous l'opt-in e-mail").toBeLessThan(iBloc);
  });

  it("les deux consentements restent DEUX paramètres, pas un seul", () => {
    // CETTE ASSERTION A ÉTÉ RETOURNÉE, et le motif compte plus que le
    // changement : elle exigeait auparavant que le SMS voyage dans un appel
    // SÉPARÉ du claim — « sinon il redeviendrait un drapeau parmi d'autres et
    // la version du texte ne serait plus archivée ». Mesuré, ce raisonnement
    // était faux sur les deux moitiés : la version EST archivée (la garde
    // voisine le vérifie sur `recordPrizeSmsConsent`), et la séparation des
    // appels garantissait surtout qu'aucun primo-gagnant ne reçoive jamais
    // son code, le dépôt SMS lisant `sms_consents` avant que le second appel
    // n'ait eu lieu.
    //
    // Ce qui doit rester vrai est ici : DEUX paramètres distincts dans la même
    // requête. ROUGE SI quelqu'un fond les deux canaux en un seul drapeau —
    // le joueur consentirait à l'e-mail en cochant le SMS, et réciproquement.
    const claim = blocClaim(SRC_FORM);
    expect(claim).toContain("marketingOptIn:");
    expect(claim).toMatch(new RegExp(`${PARAM_OPT_IN}: `));
    expect(PARAM_OPT_IN).not.toBe("marketingOptIn");
  });
});

describe("GARDE 3 — le formulaire parle bien au serveur", () => {
  it("le nom de la case est EXACTEMENT celui que le submit lit", () => {
    // ROUGE SI : l'`<input>` dit `smsOptIn` et le submit lit `sms_opt_in`.
    // La case s'affiche, se coche, et ne consent rien — sans une erreur, sans
    // un log, sans rien à l'écran.
    expect(CHAMP_OPT_IN).toBe("sms_opt_in");
    expect(inputPortant(SRC_FORM, CHAMP_OPT_IN)).toContain(
      `name="${CHAMP_OPT_IN}"`,
    );
  });

  it("le paramètre transporté EXISTE dans le schéma serveur", () => {
    // ROUGE SI : le formulaire envoie `smsOptIn` et `claimSchema` ne le
    // déclare pas. Zod ne lève pas sur une clé inconnue — il la SUPPRIME. La
    // case serait cochée, la requête partirait, et le serveur ne verrait
    // jamais le consentement : exactement le défaut que cette garde ferme,
    // dans une variante que rien d'autre n'attrape.
    expect(SRC_SCHEMA, `${PARAM_OPT_IN} absent de claimSchema`).toMatch(
      new RegExp(`^\\s*${PARAM_OPT_IN}: z\\.boolean\\(\\)`, "m"),
    );
  });

  it("l'organisation N'EST PAS envoyée depuis le client", () => {
    // Elle est résolue serveur, désormais depuis le SPIN désigné par le jeton
    // signé — plus strict encore que l'ancien slug de formulaire. L'envoyer
    // d'ici laisserait inscrire un numéro sur la liste de n'importe quel
    // commerce.
    expect(blocClaim(SRC_FORM)).not.toMatch(/organization/i);
    expect(SRC_ECRITURE).toContain("p_organization_id: params.organizationId");
  });

  it("le consentement entre dans la TRANSACTION du gain, jamais après", () => {
    // LE DÉFAUT LUI-MÊME, épinglé à la source — et il a changé de nature.
    //
    // Il fut un ORDRE : `enqueuePrizeRedeemSms` sort sur `if (!consent) return
    // false`, donc déposé avant l'écriture il ne composait rien, et au premier
    // gain d'un numéro aucun SMS ne partait. L'ordre a été corrigé, puis s'est
    // révélé insuffisant : les deux gestes restaient APRÈS le commit du gain,
    // et une invocation serverless morte entre les deux perdait le
    // consentement pour toujours. Pas un message — le CANAL, puisqu'un envoi
    // sans consentement échoue en silence.
    //
    // Le consentement est donc passé DANS la transaction (`p_sms_opt_in`,
    // migration 20261213120000). Cette garde nomme désormais cette
    // atomicité-là ; la preuve de comportement vit dans `play.test.ts`.
    const iOptIn = SRC_CLAIM.indexOf("p_sms_opt_in:");
    const iDepot = SRC_CLAIM.indexOf("enqueuePrizeRedeemSms(admin,");
    expect(iOptIn, "la réclamation ne porte plus le consentement").toBeGreaterThan(-1);
    expect(iDepot, "le claim ne dépose plus de SMS").toBeGreaterThan(-1);
    expect(iOptIn, "le consentement est transmis APRÈS le dépôt").toBeLessThan(
      iDepot,
    );
    // ROUGE SI : l'écriture ressort de la transaction dans un appel séparé.
    expect(
      SRC_CLAIM,
      "le consentement est de nouveau écrit hors de la transaction",
    ).not.toContain("recordPrizeSmsConsent(admin,");
  });
});

describe("le texte affiché est celui qui sera archivé", () => {
  it("le libellé est IMPORTÉ, jamais recopié", () => {
    // La preuve d'un consentement n'est pas « la case était cochée », c'est
    // « voici la phrase lue en la cochant ». Recopier la phrase dans le JSX,
    // c'est pouvoir la faire diverger de la version enregistrée — et ne plus
    // pouvoir dire à quoi les gens ont consenti.
    // `@/lib/claim-libelles` et non `@/lib/validations/sms` : le libellé est
    // le MÊME (les deux modules le partagent, voir claim-libelles.ts), mais la
    // moitié client est sans zod — `validations/sms` n'entrait dans le lot de
    // départ du parcours joueur que pour cette phrase.
    expect(SRC_FORM).toMatch(
      /import \{[^}]*\bsmsConsentLabel\b[^}]*\} from "@\/lib\/claim-libelles"/,
    );
    // L'assertion portait la forme EXACTE `{smsConsentText()}`, sans argument.
    // Elle est tombée le jour où le texte a reçu le NOM de l'établissement —
    // un changement qui RENFORCE la preuve de consentement, pas qui l'affaiblit.
    // Une garde qui rougit sur l'ajout d'un argument teste la mise en forme,
    // pas la propriété : ce qu'on veut savoir, c'est que la phrase VIENT de la
    // version archivée, quel que soit ce qu'on lui passe.
    expect(SRC_FORM).toMatch(/\{smsConsentLabel\(/);
    // Le vrai danger reste attrapé : la phrase recopiée en dur. On compare sur
    // le fragment INVARIANT du texte — celui qui ne porte ni marque ni nom —
    // sinon l'interpolation suffirait à passer sous le radar.
    expect(SRC_FORM, "phrase de consentement recopiée dans le JSX").not.toContain(
      "J'accepte de recevoir des offres et actualités",
    );
  });

  it("le serveur archive une VERSION, pas un booléen", () => {
    expect(SRC_ECRITURE).toContain("p_consent_version: SMS_CONSENT_VERSION");
    expect(smsConsentText(SMS_CONSENT_VERSION).length).toBeGreaterThan(40);
  });

  it("un numéro RETIRÉ n'est jamais réactivé par une case cochée", () => {
    // `record_sms_consent` lève sur un consentement retiré tant que `p_renew`
    // n'est pas vrai. Le passer ici annulerait silencieusement le STOP que la
    // personne a envoyé — le seul geste de sortie qu'elle possède.
    // Borné aux ARGUMENTS de l'appel, pas au fichier : le pavé qui explique
    // pourquoi `p_renew` n'est pas passé contient forcément ce mot, et une
    // garde qui rougit sur son propre commentaire d'explication ne mesure rien.
    const debut = SRC_ECRITURE.indexOf('admin.rpc("record_sms_consent", {');
    expect(debut, "l'écriture du consentement a disparu").toBeGreaterThan(-1);
    const fin = SRC_ECRITURE.indexOf("});", debut);
    expect(fin).toBeGreaterThan(debut);
    expect(
      SRC_ECRITURE.slice(debut, fin),
      "le claim réactive un numéro retiré",
    ).not.toContain("p_renew");
  });

  it("l'écran ne promet pas un STOP qui reviendrait chez le commerçant", () => {
    // FAIT TECHNIQUE : l'expéditeur est alphanumérique (nom du commerce, 11
    // caractères, AF2M) et un expéditeur alphanumérique NE PEUT PAS recevoir
    // de réponse. Le STOP part vers le numéro court de l'opérateur. Promettre
    // « répondez STOP à ce commerçant » serait une promesse non tenue, sur le
    // seul mécanisme de sortie que la personne possède.
    // L'assertion lisait le JSX. Elle a cessé d'avoir un sens le jour où la
    // mention du STOP est entrée dans le TEXTE VERSIONNÉ — c'est-à-dire là où
    // elle doit être : une phrase de consentement complétée par une note en
    // petit à côté est une phrase de consentement incomplète, et c'est la
    // PREMIÈRE qui est archivée comme preuve.
    //
    // On vérifie donc le texte archivé, pas son rendu. Le JSX ne fait plus que
    // l'interpoler, ce que la garde voisine contrôle déjà.
    const texte = smsConsentText();
    expect(texte, "le moyen de sortie n'est pas dit").toMatch(/STOP/);
    expect(texte, "le STOP est promis au commerçant").not.toMatch(
      /STOP\s+(à|au)\s+ce\s+commer/i,
    );
    expect(texte, "le destinataire réel du STOP n'est pas dit").toMatch(
      /numéro court|opérateur/i,
    );
    // Et l'écran ne doit pas rajouter une promesse contradictoire à côté.
    const label = labelPortant(SRC_FORM, CHAMP_OPT_IN);
    expect(label, "l'écran promet un STOP au commerçant").not.toMatch(
      /STOP\s+(à|au)\s+ce\s+commer/i,
    );
  });

  it("le texte versionné NOMME le responsable du traitement", () => {
    // Un consentement doit désigner À QUI on consent. « ce commerce » ne
    // permet pas, six mois plus tard, de dire qui était le responsable — et
    // c'est précisément ce qu'une preuve de consentement doit établir.
    // Le texte ARCHIVÉ garde sa marque : deux commerçants doivent avoir la
    // MÊME `sms.v1` au dossier, sinon la version ne prouve plus rien.
    expect(smsConsentText()).toContain(SMS_CONSENT_MERCHANT_TOKEN);
    // Le texte AFFICHÉ porte le nom, et n'a plus de marque : sans quoi le
    // joueur lirait une accolade.
    const rendu = smsConsentLabel("Boulangerie Dupont");
    expect(rendu).toContain("Boulangerie Dupont");
    expect(rendu).not.toContain(SMS_CONSENT_MERCHANT_TOKEN);
    // Sans nom connu, un repli lisible plutôt qu'une accolade.
    expect(smsConsentLabel(undefined)).not.toContain(SMS_CONSENT_MERCHANT_TOKEN);
  });
});

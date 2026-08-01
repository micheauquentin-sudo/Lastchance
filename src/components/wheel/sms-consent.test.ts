import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SMS_CONSENT_MERCHANT_TOKEN,
  SMS_CONSENT_VERSION,
  smsConsentLabel,
  smsConsentText,
} from "@/lib/validations/sms";

/**
 * GARDE DE SOURCE — la case de consentement SMS du parcours joueur.
 *
 * ── Pourquoi une garde de SOURCE ──
 *
 * Le projet n'a pas d'environnement de rendu React : un attribut JSX ne se
 * vérifie que par lecture du fichier, et c'est assumé — elle prouve la forme,
 * pas le pixel. Même parti pris que `destructive-confirm-coverage.test.ts` et
 * `weekly-digest-anchor.test.ts`.
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
 * 3. LE NOM DU CHAMP EST CELUI QUE L'ACTION LIT — sinon la case existe,
 *    se coche, et ne consent à rien. Rien ne rougit, rien ne s'affiche.
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
const ACTION = "src/actions/sms.ts";

const SRC_FORM = source(FORMULAIRE);
const SRC_ACTION = source(ACTION);

/**
 * Le corps d'UNE action du fichier.
 *
 * `src/actions/sms.ts` ne porte plus une seule action : les réglages
 * d'expéditeur (`requestSmsSender`) y vivent aussi, et leur
 * `formData.get("sender_id")` faisait rougir la garde des champs — à tort,
 * puisqu'il ne s'adresse pas à CE formulaire. La garde lit donc la fonction,
 * pas le fichier ; sa prémisse « ce fichier n'a qu'une action » ne tenait que
 * par accident de calendrier.
 */
function corpsAction(nom: string): string {
  const debut = SRC_ACTION.indexOf(`export async function ${nom}(`);
  expect(debut, `${nom} introuvable dans ${ACTION}`).toBeGreaterThan(-1);
  const suivante = SRC_ACTION.indexOf("\nexport async function ", debut + 1);
  return SRC_ACTION.slice(debut, suivante === -1 ? SRC_ACTION.length : suivante);
}

const SRC_CONSENT = corpsAction("submitSmsConsent");

/**
 * Le nom du champ tel que l'ACTION le lit — extrait, jamais recopié. C'est le
 * pivot de la garde 3 : si l'action change de nom, c'est ici que la nouvelle
 * valeur arrive, et c'est le formulaire qui rougit.
 */
const CHAMP_OPT_IN = (() => {
  const m = /formData\.get\("([a-z_]+)"\) === "on"/.exec(SRC_CONSENT);
  expect(m, "l'action ne lit plus de case à cocher").not.toBeNull();
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

/**
 * Le `FormData` du consentement, BORNÉ à sa construction et à son envoi. Non
 * borné, il courait jusqu'à la fin du fichier et attrapait `organizationName`
 * du JSX — la garde aurait accusé un envoi qui n'existe pas.
 */
function blocEnvoi(src: string): string {
  const debut = src.indexOf("const consent = new FormData()");
  expect(debut, "le formulaire ne construit plus de consentement").toBeGreaterThan(-1);
  const fin = src.indexOf("submitSmsConsent(null, consent)", debut);
  expect(fin, "le consentement construit n'est jamais envoyé").toBeGreaterThan(debut);
  return src.slice(debut, fin);
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

  it("l'action ne traite l'absence du champ que comme un refus", () => {
    // L'autre bout de la même propriété. ROUGE SI l'action se met à écrire
    // sur `false` : la case vide produirait alors une ligne en base.
    expect(SRC_ACTION).toMatch(/=== "on"/);
    expect(SRC_ACTION).not.toMatch(/=== "off"|!== "on" \? true/);
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

  it("les deux consentements partent par deux chemins différents", () => {
    // `claimPrize` porte `marketingOptIn` ; le SMS a son action dédiée. ROUGE
    // SI le SMS se met à voyager dans le payload du claim : il redeviendrait
    // un drapeau parmi d'autres, et la version du texte lue ne serait plus
    // archivée.
    expect(SRC_FORM).toContain("submitSmsConsent");
    const claim = SRC_FORM.slice(
      SRC_FORM.indexOf("result = await claimPrize({"),
      SRC_FORM.indexOf("} catch {"),
    );
    expect(claim, "le consentement SMS voyage dans le claim").not.toContain(
      CHAMP_OPT_IN,
    );
  });
});

describe("GARDE 3 — le formulaire parle bien à l'action", () => {
  it("le nom de la case est EXACTEMENT celui que l'action lit", () => {
    // ROUGE SI : le formulaire dit `smsOptIn` et l'action lit `sms_opt_in`.
    // La case s'affiche, se coche, et ne consent rien — sans une erreur, sans
    // un log, sans rien à l'écran.
    expect(CHAMP_OPT_IN).toBe("sms_opt_in");
    expect(inputPortant(SRC_FORM, CHAMP_OPT_IN)).toContain(
      `name="${CHAMP_OPT_IN}"`,
    );
  });

  it("les trois champs attendus sont posés à l'envoi", () => {
    // L'action lit `slug`, `phone` et la case. Les trois sont extraits d'elle
    // et cherchés dans le `FormData` que le formulaire construit.
    const lus = [...SRC_CONSENT.matchAll(/formData\.get\("([a-z_]+)"\)/g)].map(
      (m) => m[1],
    );
    expect(new Set(lus)).toEqual(new Set(["slug", "phone", CHAMP_OPT_IN]));
    const envoi = blocEnvoi(SRC_FORM);
    for (const champ of lus) {
      expect(envoi, `${champ} jamais posé sur le FormData`).toContain(
        `consent.set("${champ}"`,
      );
    }
  });

  it("l'organisation N'EST PAS envoyée depuis le client", () => {
    // Elle est résolue serveur depuis le slug. L'envoyer d'ici laisserait
    // inscrire n'importe quel numéro sur la liste de n'importe quel commerce.
    expect(blocEnvoi(SRC_FORM)).not.toMatch(/organization/i);
  });
});

describe("le texte affiché est celui qui sera archivé", () => {
  it("le libellé est IMPORTÉ, jamais recopié", () => {
    // La preuve d'un consentement n'est pas « la case était cochée », c'est
    // « voici la phrase lue en la cochant ». Recopier la phrase dans le JSX,
    // c'est pouvoir la faire diverger de la version enregistrée — et ne plus
    // pouvoir dire à quoi les gens ont consenti.
    expect(SRC_FORM).toMatch(
      /import \{[^}]*\bsmsConsentLabel\b[^}]*\} from "@\/lib\/validations\/sms"/,
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

  it("l'action archive une VERSION, pas un booléen", () => {
    expect(SRC_ACTION).toContain("p_consent_version: SMS_CONSENT_VERSION");
    expect(smsConsentText(SMS_CONSENT_VERSION).length).toBeGreaterThan(40);
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

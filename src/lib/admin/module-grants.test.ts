import { describe, expect, it } from "vitest";

import {
  calculerFenetres,
  DUREE_MAX_JOURS,
  estVivant,
  INDEX_RECURRENT_UNIQUE,
  LIBELLE_ETAT,
  LIBELLE_MODULE,
  messageCumulRecurrent,
  miroirsDeVitrine,
  MODULES_MIROIRS_VITRINE,
  ouvreLeModule,
  violeContrainte,
  type EtatOctroi,
  type OctroiCorrele,
} from "./module-grants";
import { formatDate } from "@/lib/utils";
import { GRANTABLE_MODULES } from "@/lib/subscription";

const MAINTENANT = new Date("2026-06-15T12:00:00Z");
const JOUR = 86_400_000;

function dans(jours: number): string {
  return new Date(MAINTENANT.getTime() + jours * JOUR).toISOString();
}

describe("calculerFenetres — un pass démarré tout de suite", () => {
  it("pose la fenêtre de jeu, et AUCUN délai d'activation", () => {
    const v = calculerFenetres(
      { module: "hunts", kind: "pass", demarrage: "maintenant", dureeJours: 30 },
      MAINTENANT,
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.fenetres.starts_at).toBe(MAINTENANT.toISOString());
    expect(v.fenetres.ends_at).toBe(dans(30));
    // Un octroi déjà démarré n'a plus de date limite de démarrage : la laisser
    // ferait croire à une contrainte qui ne décide plus rien.
    expect(v.fenetres.activate_by).toBeNull();
  });

  it("refuse une durée absente, nulle ou hors bornes", () => {
    for (const duree of [null, 0, -1, DUREE_MAX_JOURS + 1]) {
      const v = calculerFenetres(
        { module: "quiz", kind: "pass", demarrage: "maintenant", dureeJours: duree },
        MAINTENANT,
      );
      expect(v.ok, `durée ${duree}`).toBe(false);
    }
  });
});

describe("calculerFenetres — un pass acheté mais pas démarré", () => {
  it("ne pose QUE la date limite de démarrage", () => {
    const v = calculerFenetres(
      { module: "calendar", kind: "pass", demarrage: "a_activer", delaiActivationJours: 90 },
      MAINTENANT,
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    // Le point qui compte : ni début ni fin. C'est l'état `pending`, qui
    // n'ouvre rien — et la contrainte `grant_fin_apres_debut` refuserait de
    // toute façon une fin posée sans début.
    expect(v.fenetres.starts_at).toBeNull();
    expect(v.fenetres.ends_at).toBeNull();
    expect(v.fenetres.activate_by).toBe(dans(90));
  });

  it("refuse un délai hors bornes", () => {
    const v = calculerFenetres(
      { module: "calendar", kind: "pass", demarrage: "a_activer", delaiActivationJours: 0 },
      MAINTENANT,
    );
    expect(v.ok).toBe(false);
  });

  /* ── FAIBLE (revue L2) : L'OCTROI INDÉMARRABLE ─────────────
   *
   * « Acheté, pas démarré » suppose un écran où le commerçant appuie sur
   * départ : la section « Prêt à démarrer » de settings/modules, qui apparie
   * chaque octroi en attente à `ADDON_OFFERS.find(…)` et JETTE ceux qui n'y
   * trouvent rien. Un pass différé sur un module hors catalogue était donc payé
   * de la main de l'admin, invisible, et jamais démarrable.
   */
  it("REFUSE un pass différé sur un module sans offre au catalogue", () => {
    const v = calculerFenetres(
      // `wheel` ET NON `duo`, depuis DUO-2 : les deux salons sont entrés au
      // catalogue à 12 €, ils ont donc désormais une offre et un écran de
      // démarrage. `wheel` est ce qu'il reste — et il est le SEUL, ce que la
      // garde de cardinalité de `module-access-parity.test.ts` épingle par
      // l'autre bout (« un seul module sans colonne addon »). Le produit de
      // base n'a pas d'entrée au catalogue d'options et n'en aura jamais :
      // c'est l'abonnement lui-même. Un pass différé sur lui resterait donc
      // invisible à vie dans « Prêt à démarrer », qui apparie sur
      // `ADDON_OFFERS`.
      { module: "wheel", kind: "pass", demarrage: "a_activer", delaiActivationJours: 90 },
      MAINTENANT,
    );
    expect(v.ok).toBe(false);
    if (v.ok) return;
    // Le message NOMME le module comme le panneau juste au-dessus le nomme, et
    // dit la sortie — sans quoi l'admin recommence le même geste.
    // DÉRIVÉ de `LIBELLE_MODULE`, et non recopié : le littéral « Vitrine &
    // Réserver » épinglé ici a survécu à cinq surfaces livrées sous la même
    // clé, et il fallait le corriger à deux endroits au lieu d'un. Ce qui doit
    // rester vrai est « le message nomme le module COMME le panneau le nomme »,
    // pas la chaîne d'un jour.
    expect(v.erreur).toContain(LIBELLE_MODULE.wheel);
    expect(v.erreur).toContain("démarrage immédiat");
  });

  it("et les deux formes qui restent ouvertes le sont vraiment", () => {
    // Le témoin qui empêche le refus ci-dessus de devenir « on n'octroie plus
    // Vitrine du tout » : c'est la combinaison qui est refusée, pas le module.
    const immediat = calculerFenetres(
      { module: "vitrine", kind: "pass", demarrage: "maintenant", dureeJours: 30 },
      MAINTENANT,
    );
    expect(immediat.ok).toBe(true);
    const recurrent = calculerFenetres(
      { module: "vitrine", kind: "recurring", demarrage: "maintenant" },
      MAINTENANT,
    );
    expect(recurrent.ok).toBe(true);
  });

  it("TÉMOIN : un module du catalogue garde son pass différé", () => {
    // Sans lui, un prédicat inversé refuserait les huit add-ons vendus et le
    // test ci-dessus passerait quand même.
    for (const vendu of ["hunts", "calendar", "quiz", "events"] as const) {
      const v = calculerFenetres(
        { module: vendu, kind: "pass", demarrage: "a_activer", delaiActivationJours: 90 },
        MAINTENANT,
      );
      expect(v.ok, vendu).toBe(true);
    }
  });
});

describe("calculerFenetres — un droit récurrent", () => {
  it("court dès maintenant et n'a pas de terme", () => {
    const v = calculerFenetres(
      { module: "loyalty", kind: "recurring", demarrage: "maintenant" },
      MAINTENANT,
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.fenetres.starts_at).toBe(MAINTENANT.toISOString());
    expect(v.fenetres.ends_at).toBeNull();
    expect(v.fenetres.activate_by).toBeNull();
  });

  it("REFUSE un démarrage différé — il n'y a aucun compteur à déclencher", () => {
    // Ce n'est pas une coquetterie : un récurrent « à activer » produirait une
    // ligne `pending` qu'aucun geste ne pourrait jamais faire démarrer, donc
    // un droit payé et inatteignable.
    const v = calculerFenetres(
      { module: "loyalty", kind: "recurring", demarrage: "a_activer", delaiActivationJours: 90 },
      MAINTENANT,
    );
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.erreur).toContain("récurrent");
  });
});

describe("calculerFenetres — la jauge", () => {
  it("est reportée telle quelle quand elle est valide", () => {
    const v = calculerFenetres(
      { module: "events", kind: "pass", demarrage: "maintenant", dureeJours: 1, jauge: 30 },
      MAINTENANT,
    );
    expect(v.ok && v.fenetres.capacity).toBe(30);
  });

  it("refuse une jauge non entière ou hors bornes", () => {
    for (const jauge of [0, 501, 12.5]) {
      const v = calculerFenetres(
        { module: "events", kind: "pass", demarrage: "maintenant", dureeJours: 1, jauge },
        MAINTENANT,
      );
      expect(v.ok, `jauge ${jauge}`).toBe(false);
    }
  });

  it("absente, elle reste nulle plutôt que zéro", () => {
    // Zéro serait une jauge RÉELLE de zéro joueur, et le gel en base la
    // rendrait ensuite immodifiable.
    const v = calculerFenetres(
      { module: "events", kind: "pass", demarrage: "maintenant", dureeJours: 1 },
      MAINTENANT,
    );
    expect(v.ok && v.fenetres.capacity).toBeNull();
  });
});

describe("estVivant — port TypeScript de org_has_live_module_grant", () => {
  const base = { starts_at: dans(-1), ends_at: dans(29), revoked_at: null };

  it("vrai dans la fenêtre", () => {
    expect(estVivant(base, MAINTENANT)).toBe(true);
  });

  it("faux passé la fin — c'est la pause à l'échéance", () => {
    expect(estVivant({ ...base, ends_at: dans(-1) }, MAINTENANT)).toBe(false);
  });

  it("faux avant le début", () => {
    expect(estVivant({ ...base, starts_at: dans(1) }, MAINTENANT)).toBe(false);
  });

  it("faux si jamais démarré", () => {
    expect(estVivant({ ...base, starts_at: null }, MAINTENANT)).toBe(false);
  });

  it("faux si révoqué, MÊME dans sa fenêtre", () => {
    expect(estVivant({ ...base, revoked_at: dans(-0.5) }, MAINTENANT)).toBe(false);
  });

  it("vrai sans fin — un récurrent en cours", () => {
    expect(estVivant({ ...base, ends_at: null }, MAINTENANT)).toBe(true);
  });
});

describe("le vocabulaire affiché", () => {
  it("couvre les six états, et un seul ouvre le module", () => {
    const etats: EtatOctroi[] = [
      "live",
      "scheduled",
      "pending",
      "expired",
      "activation_expired",
      "revoked",
    ];
    for (const e of etats) {
      expect(LIBELLE_ETAT[e], e).toBeTruthy();
      // Le libellé dit la conséquence, pas l'état technique : aucun d'eux ne
      // doit être le mot de la base recopié.
      expect(LIBELLE_ETAT[e]).not.toBe(e);
    }
    expect(etats.filter(ouvreLeModule)).toEqual(["live"]);
  });

  it("nomme chacun des modules octroyables — la clé de base ne fuit pas", () => {
    // ROUGE SI : un module devient octroyable sans entrer au vocabulaire. Le
    // refus de cumul le nommerait alors `loyalty` pendant que la liste juste
    // au-dessus affiche « Passeport des habitués ».
    for (const m of GRANTABLE_MODULES) {
      expect(LIBELLE_MODULE[m], m).toBeTruthy();
      expect(LIBELLE_MODULE[m]).not.toBe(m);
    }
  });
});

describe("violeContrainte — reconnaître CE refus, et lui seul", () => {
  it("reconnaît le message RÉEL de Postgres, relevé sur la base", () => {
    // Les autres cas de ce bloc éprouvent des chaînes ÉCRITES À LA MAIN, donc
    // l'hypothèse qu'on se fait du format. Celle-ci a été relevée le
    // 2026-08-05 sur la base locale, en provoquant un vrai conflit :
    //
    //   insert … values (org, 'loyalty', 'recurring', …);   -- passe
    //   insert … values (org, 'loyalty', 'recurring', …);   -- 23505
    //
    // Une garde éprouvée seulement sur ses propres suppositions ne prouve rien
    // du monde réel — c'est la règle de ce dépôt, et elle vaut ici parce que
    // PostgREST ne transmet PAS `constraint_name` : tout repose sur ce texte.
    const reel =
      'duplicate key value violates unique constraint "organization_module_grants_recurrent_vivant_idx"';

    expect(violeContrainte({ code: "23505", message: reel }, INDEX_RECURRENT_UNIQUE)).toBe(
      true,
    );
  });

  // Les trois phrases que Postgres rend selon `lc_messages`. La phrase change,
  // ses délimiteurs changent, l'identifiant non — c'est tout le pari.
  const PHRASES = [
    `duplicate key value violates unique constraint "${INDEX_RECURRENT_UNIQUE}"`,
    `la valeur d'une clé dupliquée rompt la contrainte unique « ${INDEX_RECURRENT_UNIQUE} »`,
    `doppelter Schlüsselwert verletzt Unique-Constraint »${INDEX_RECURRENT_UNIQUE}«`,
  ];

  it("reconnaît l'index quel que soit la langue du serveur", () => {
    for (const message of PHRASES) {
      expect(
        violeContrainte({ code: "23505", message }, INDEX_RECURRENT_UNIQUE),
        message,
      ).toBe(true);
    }
  });

  it("REFUSE toute autre contrainte de la table", () => {
    // ROUGE SI : le rattrapage devient un `code === "23505"` en bloc. Il
    // traduirait alors n'importe quelle unicité future — dont celle du lot 4
    // sur la référence de paiement — en « vous avez déjà ce module », c'est-à-
    // dire un vrai défaut habillé en refus de produit.
    expect(
      violeContrainte(
        {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "organization_module_grants_stripe_ref_idx"',
        },
        INDEX_RECURRENT_UNIQUE,
      ),
    ).toBe(false);
  });

  it("REFUSE un nom dont le nôtre n'est qu'un morceau", () => {
    // Une `…_idx_v2` ou une `x_organization_module_grants_recurrent_vivant_idx`
    // ne sont pas la nôtre : la borne est un caractère non identifiant.
    for (const nom of [
      `${INDEX_RECURRENT_UNIQUE}_v2`,
      `x_${INDEX_RECURRENT_UNIQUE}`,
    ]) {
      expect(
        violeContrainte(
          { code: "23505", message: `duplicate key value violates unique constraint "${nom}"` },
          INDEX_RECURRENT_UNIQUE,
        ),
        nom,
      ).toBe(false);
    }
  });

  it("REFUSE tout ce qui n'est pas une violation d'unicité", () => {
    // Même nom cité, autre classe d'erreur : un refus RLS ou un trigger qui
    // parle de l'index ne dit rien du cumul.
    expect(
      violeContrainte(
        { code: "42501", message: INDEX_RECURRENT_UNIQUE },
        INDEX_RECURRENT_UNIQUE,
      ),
    ).toBe(false);
    expect(violeContrainte(null, INDEX_RECURRENT_UNIQUE)).toBe(false);
    expect(violeContrainte(undefined, INDEX_RECURRENT_UNIQUE)).toBe(false);
    expect(violeContrainte({ code: "23505" }, INDEX_RECURRENT_UNIQUE)).toBe(false);
  });
});

describe("messageCumulRecurrent — dire le refus, l'obstacle et la sortie", () => {
  const DEBUT = "2026-03-12T09:00:00.000Z";

  it("un octroi du back-office : il se révoque, et le message le dit", () => {
    expect(
      messageCumulRecurrent("loyalty", { starts_at: DEBUT, source: "backoffice" }),
    ).toBe(
      `« Passeport des habitués » a déjà un droit récurrent en cours depuis le ${formatDate(DEBUT)} : ` +
        "un seul est possible par module, ils ne se cumulent pas. " +
        "Révoquez-le dans la liste ci-dessus avant d'en accorder un nouveau.",
    );
  });

  it("un octroi Stripe : le message N'ENVOIE PAS révoquer ici", () => {
    // ROUGE SI : la sortie conseillée ignore la source. `revokeMerchantModuleGrant`
    // refuse les octrois `source = 'stripe'` et le panneau ne dessine même pas
    // le bouton pour ces lignes : l'admin chercherait un geste inexistant.
    const msg = messageCumulRecurrent("referral", {
      starts_at: DEBUT,
      source: "stripe",
    });
    expect(msg).toContain("« Bouche-à-oreille »");
    expect(msg).toContain("Stripe");
    expect(msg).not.toContain("Révoquez-le");
    expect(msg).toContain("résiliez l'abonnement");
  });

  it("obstacle introuvable : on renvoie à la liste, on n'invente pas", () => {
    const msg = messageCumulRecurrent("quiz", null);
    expect(msg).toContain("« Quiz express »");
    expect(msg).not.toContain("depuis le");
    expect(msg).toContain("Rechargez la page");
  });

  it("un module hors vocabulaire garde sa clé plutôt que de disparaître", () => {
    expect(messageCumulRecurrent("module_inconnu", null)).toContain(
      "« module_inconnu »",
    );
  });
});

describe("miroirsDeVitrine — ce qu'un seul geste doit refermer", () => {
  const DEBUT = "2026-03-12T09:00:00.000Z";
  const FIN = "2026-09-12T09:00:00.000Z";

  function octroi(over: Partial<OctroiCorrele> & { id: string }): OctroiCorrele {
    return {
      module: "vitrine",
      kind: "pass",
      source: "backoffice",
      resource_id: null,
      starts_at: DEBUT,
      ends_at: FIN,
      revoked_at: null,
      ...over,
    };
  }

  const CIBLE = octroi({ id: "cible" });
  const MIROIRS = [
    octroi({ id: "r", module: "reserver" }),
    octroi({ id: "d", module: "duo" }),
    octroi({ id: "b", module: "bande" }),
  ];

  function ids(cible: OctroiCorrele, tous: OctroiCorrele[]): string[] {
    return miroirsDeVitrine(cible, tous).map((l) => l.id);
  }

  it("rend les trois miroirs posés par la migration, jamais la cible", () => {
    // ROUGE SI : la corrélation change de clé. Le back-office ne révoque que
    // par `grantId` — sans ces trois lignes, couper « Vitrine publique »
    // laisserait Réserver vivant sous un commerçant révoqué.
    expect(ids(CIBLE, [CIBLE, ...MIROIRS])).toEqual(["r", "d", "b"]);
  });

  it("DEUX BORNES NULLES SONT ÉGALES — la leçon L17", () => {
    // Un droit récurrent n'a pas de terme, et ses miroirs non plus. Comparer
    // `null` par égalité stricte de dates les rendrait tous distincts, et le
    // groupement ne marcherait que pour les pass.
    const cible = octroi({ id: "cible", kind: "recurring", ends_at: null });
    const miroir = octroi({
      id: "r",
      module: "reserver",
      kind: "recurring",
      ends_at: null,
    });
    expect(ids(cible, [cible, miroir])).toEqual(["r"]);
  });

  it("le même instant écrit autrement reste le même instant", () => {
    // `+00:00` et `Z`, millisecondes présentes ou non : PostgREST peut rendre
    // l'une ou l'autre écriture selon la colonne et la version.
    const cible = octroi({ id: "cible", starts_at: "2026-03-12T09:00:00+00:00" });
    const miroir = octroi({ id: "r", module: "reserver", starts_at: DEBUT });
    expect(ids(cible, [cible, miroir])).toEqual(["r"]);
  });

  it("ne groupe RIEN quand la cible n'est pas `vitrine`", () => {
    // La révocation d'un module quelconque doit rester ce qu'elle était : une
    // ligne, une coupure.
    expect(ids(octroi({ id: "cible", module: "hunts" }), [...MIROIRS])).toEqual([]);
    expect(ids(octroi({ id: "cible", module: "reserver" }), [...MIROIRS])).toEqual(
      [],
    );
  });

  it("écarte ce qui n'est pas un miroir de CET octroi", () => {
    // Chaque ligne diffère de la cible par UN attribut de la clé de corrélation
    // — celle-là même que la migration a employée pour se dédupliquer.
    const voisins = [
      octroi({ id: "autre-kind", module: "reserver", kind: "recurring" }),
      octroi({ id: "autre-debut", module: "duo", starts_at: FIN }),
      octroi({ id: "autre-fin", module: "bande", ends_at: null }),
      octroi({ id: "autre-module", module: "quiz" }),
    ];
    expect(ids(CIBLE, [CIBLE, ...voisins])).toEqual([]);
  });

  it("laisse en paix un octroi DÉJÀ révoqué : son motif d'origine est le vrai", () => {
    const dejaFerme = octroi({
      id: "r",
      module: "reserver",
      revoked_at: "2026-04-01T10:00:00.000Z",
    });
    expect(ids(CIBLE, [CIBLE, dejaFerme])).toEqual([]);
  });

  it("laisse en paix un droit BORNÉ À UNE RESSOURCE", () => {
    // La migration ne les a pas recopiés (`resource_id is null` dans son
    // insert) : aucun n'est un miroir. Les emporter serait la sur-révocation
    // symétrique du défaut corrigé.
    const fin = octroi({ id: "r", module: "reserver", resource_id: "res-1" });
    expect(ids(CIBLE, [CIBLE, fin])).toEqual([]);
    // Et une cible elle-même bornée à une ressource ne porte pas le droit du
    // module entier : elle n'a pas de miroir à fermer.
    const cibleBornee = octroi({ id: "cible", resource_id: "res-1" });
    expect(ids(cibleBornee, [cibleBornee, ...MIROIRS])).toEqual([]);
  });

  it("laisse en paix un octroi d'origine STRIPE", () => {
    // Il n'en existe pas (la migration lève sur un `vitrine` Stripe), et le
    // geste juste resterait un remboursement côté Stripe. La garde est écrite
    // pour le jour où ce monde changerait.
    const stripe = octroi({ id: "r", module: "reserver", source: "stripe" });
    expect(ids(CIBLE, [CIBLE, stripe])).toEqual([]);
  });

  it("les trois clés détachées sont NOMMÉES, pas devinées", () => {
    // L'avertissement affiché à l'opérateur lit `LIBELLE_MODULE` : une clé sans
    // libellé s'y montrerait telle quelle, et personne ne saurait ce qui tombe.
    expect([...MODULES_MIROIRS_VITRINE]).toEqual(["reserver", "duo", "bande"]);
    for (const cle of MODULES_MIROIRS_VITRINE) {
      expect(LIBELLE_MODULE[cle], cle).toBeTruthy();
    }
  });
});

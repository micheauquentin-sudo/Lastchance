// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

/**
 * `/api/newsletter/unsubscribe` est ouverte à Internet et écrit avec la clé
 * de service (qui CONTOURNE la RLS) : le jeton signé est la seule chose qui
 * sépare une requête anonyme d'une écriture sur `newsletter_subscribers`.
 *
 * Ce fichier verrouille donc la charnière, pas la cryptographie (déjà
 * couverte par `src/lib/unsubscribe.test.ts`) : qu'aucun jeton refusé
 * n'atteigne la base, que l'écriture porte bien les DEUX filtres attendus,
 * et que rien de nominatif ne ressorte — ni dans la page, ni dans l'erreur.
 */

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));

// `@/lib/unsubscribe` n'est VOLONTAIREMENT pas simulé : les jetons du test
// sont de vrais jetons HMAC. Simuler la vérification reviendrait à tester
// un test — un jeton forgé passerait alors sans que rien ne rougisse.
import { signUnsubscribeToken } from "@/lib/unsubscribe";
import * as unsubscribeRoute from "./route";

const { POST } = unsubscribeRoute;

const ABONNE = "7f3c0d9e-1111-4222-8333-444455556666";
const URL_ROUTE = "https://app.example.com/api/newsletter/unsubscribe";
/** Secret FIXÉ par le test (voir beforeEach) — jamais celui de la machine. */
const SECRET_TEST = "secret-de-test-desinscription";

type Filtre = [methode: "eq" | "is", colonne: string, valeur: unknown];
type ResultatEcriture = { error: { message: string } | null };

interface Trace {
  table: string | null;
  valeurs: Record<string, unknown> | null;
  filtres: Filtre[];
}

/** Chaîne PostgREST attendue : from → update → eq → is, puis `await`. */
interface RequeteAbonnes extends PromiseLike<ResultatEcriture> {
  update(valeurs: Record<string, unknown>): RequeteAbonnes;
  eq(colonne: string, valeur: unknown): RequeteAbonnes;
  is(colonne: string, valeur: unknown): RequeteAbonnes;
}

/**
 * Constructeur « thenable » : chaque maillon retient ce qu'on lui a demandé
 * ET reste enchaînable, y compris dans un ordre différent. Un mock qui
 * casserait au premier maillon inattendu ferait passer un filtre disparu
 * pour une simple erreur de test — c'est justement le filtre qu'on surveille.
 */
function mockAbonnes(resultat: ResultatEcriture): Trace {
  const trace: Trace = { table: null, valeurs: null, filtres: [] };
  const builder: RequeteAbonnes = {
    update(valeurs) {
      trace.valeurs = valeurs;
      return builder;
    },
    eq(colonne, valeur) {
      trace.filtres.push(["eq", colonne, valeur]);
      return builder;
    },
    is(colonne, valeur) {
      trace.filtres.push(["is", colonne, valeur]);
      return builder;
    },
    then<TResult1 = ResultatEcriture, TResult2 = never>(
      onFulfilled?:
        | ((value: ResultatEcriture) => TResult1 | PromiseLike<TResult1>)
        | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(resultat).then(onFulfilled, onRejected);
    },
  };
  mocks.from.mockImplementation((table: string) => {
    trace.table = table;
    return builder;
  });
  return trace;
}

function requeteUrl(token?: string) {
  const url = new URL(URL_ROUTE);
  if (token !== undefined) url.searchParams.set("token", token);
  return new Request(url.toString(), { method: "POST" });
}

function requeteFormulaire(corps: string, token?: string) {
  const url = new URL(URL_ROUTE);
  if (token !== undefined) url.searchParams.set("token", token);
  return new Request(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: corps,
  });
}

/** Jeton signé par un secret étranger (rotation faite, ou tiers). */
function jetonSecretEtranger(abonneId: string) {
  process.env.UNSUBSCRIBE_TOKEN_SECRET = "secret-d-un-autre-deploiement";
  try {
    return signUnsubscribeToken(abonneId);
  } finally {
    // Le secret courant est rétabli AVANT la requête : la route vérifiera
    // donc avec la clé du jour, exactement comme après une rotation.
    process.env.UNSUBSCRIBE_TOKEN_SECRET = SECRET_TEST;
  }
}

/** Jeton signé par le BON secret mais dans l'espace de nom d'une autre famille. */
function jetonAutreFamille(abonneId: string, prefixe: string) {
  const body = Buffer.from(abonneId).toString("base64url");
  const sig = createHmac("sha256", SECRET_TEST)
    .update(`${prefixe}${body}`)
    .digest("base64url");
  return `${body}.${sig}`;
}

let secretOrigine: string | undefined;
let precedentsOrigine: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  secretOrigine = process.env.UNSUBSCRIBE_TOKEN_SECRET;
  precedentsOrigine = process.env.UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS;
  // Le secret est imposé par le test. Sans cela, une clé ambiante (.env
  // local, secrets de CI) ferait passer les cas « jeton étranger » aussi
  // bien pour la bonne raison que pour une mauvaise, et on ne saurait plus
  // laquelle. La liste de rotation est vidée pour la même raison : un
  // `_PREVIOUS` ambiant accepterait le secret étranger.
  process.env.UNSUBSCRIBE_TOKEN_SECRET = SECRET_TEST;
  delete process.env.UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS;
});

afterEach(() => {
  // Le pool de workers réutilise le même process entre fichiers de test :
  // ne pas rendre l'environnement laisserait ce secret à ceux d'après.
  if (secretOrigine === undefined) delete process.env.UNSUBSCRIBE_TOKEN_SECRET;
  else process.env.UNSUBSCRIBE_TOKEN_SECRET = secretOrigine;
  if (precedentsOrigine === undefined) {
    delete process.env.UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS;
  } else {
    process.env.UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS = precedentsOrigine;
  }
});

describe("POST /api/newsletter/unsubscribe — jetons refusés", () => {
  it.each([
    ["absent", undefined],
    ["vide", ""],
    ["sans séparateur", "pasunjeton"],
    ["sans corps", ".signatureseule"],
    ["à signature vide", `${Buffer.from(ABONNE).toString("base64url")}.`],
  ])("un jeton %s n'ouvre jamais la base", async (_cas, token) => {
    const response = await POST(requeteUrl(token));
    const body = await response.json();

    // Rougirait si la garde `if (!subscriberId)` sautait : la requête
    // atteindrait alors `newsletter_subscribers` avec la clé de service,
    // sans qu'aucune signature n'ait été présentée.
    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Lien de désinscription invalide" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("un jeton altéré d'un seul caractère est refusé", async () => {
    const valide = signUnsubscribeToken(ABONNE);
    const altere = valide.slice(0, -1) + (valide.endsWith("A") ? "B" : "A");

    const response = await POST(requeteUrl(altere));

    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("un identifiant réécrit sans re-signer est refusé", async () => {
    // Scénario concret de fuite inter-organisation : le porteur d'un lien
    // légitime remplace l'id encodé par celui d'un abonné d'un AUTRE
    // commerçant. La signature ne suit pas — sinon un seul lien reçu
    // permettrait de désabonner la base entière, organisation par
    // organisation, la clé de service ignorant la RLS.
    const valide = signUnsubscribeToken(ABONNE);
    const signature = valide.slice(valide.lastIndexOf(".") + 1);
    const autreOrg = Buffer.from("00000000-9999-4999-8999-999999999999")
      .toString("base64url");

    const response = await POST(requeteUrl(`${autreOrg}.${signature}`));

    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("un jeton signé par un autre secret est refusé", async () => {
    // Rougirait si `verificationSecrets` réintroduisait un repli permanent :
    // une clé compromise resterait acceptée pour toujours, aucune rotation
    // ne pouvant la retirer.
    const response = await POST(requeteUrl(jetonSecretEtranger(ABONNE)));

    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([
    ["sans espace de nom", ""],
    ["de la famille claim", "claim:"],
    ["de la famille invitation", "invite:"],
  ])("un jeton du BON secret mais %s est refusé", async (_cas, prefixe) => {
    // Toutes les familles partagent le repli SPIN_TOKEN_SECRET quand leur
    // clé dédiée n'est pas provisionnée. Le préfixe `unsub:` dans le
    // message signé est la SEULE chose qui empêche un jeton d'une autre
    // famille — un jeton de claim voyage en clair dans l'URL d'un gain —
    // de valoir désinscription. Rougirait si ce préfixe disparaissait.
    const response = await POST(requeteUrl(jetonAutreFamille(ABONNE, prefixe)));

    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("le message d'erreur ne renvoie ni le jeton ni un identifiant", async () => {
    const jeton = jetonSecretEtranger(ABONNE);

    const response = await POST(requeteUrl(jeton));
    const brut = JSON.stringify(await response.json());

    // Les liens de désinscription atterrissent dans les journaux de proxy
    // et les rapports d'erreur : y renvoyer le jeton en écho reviendrait à
    // l'y recopier une seconde fois, cette fois hors de l'email.
    expect(brut).not.toContain(jeton);
    expect(brut).not.toContain(ABONNE);
  });
});

describe("POST /api/newsletter/unsubscribe — jeton valide", () => {
  it("désabonne exactement l'abonné désigné, et lui seul", async () => {
    const trace = mockAbonnes({ error: null });
    const jeton = signUnsubscribeToken(ABONNE);

    const response = await POST(requeteUrl(jeton));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(trace.table).toBe("newsletter_subscribers");

    // LE filtre critique. Un `update` PostgREST sans clause porte sur
    // TOUTE la table : perdre ce `eq` transformerait un lien de
    // désinscription en désabonnement de tous les abonnés de toutes les
    // organisations — la clé de service ne s'y opposerait pas.
    expect(trace.filtres).toContainEqual(["eq", "id", ABONNE]);
    // L'id vient du jeton VÉRIFIÉ, jamais de la chaîne brute reçue.
    expect(trace.filtres.some(([, , valeur]) => valeur === jeton)).toBe(false);

    const horodatage = String(trace.valeurs?.unsubscribed_at);
    expect(Number.isNaN(Date.parse(horodatage))).toBe(false);
  });

  it("préserve la date de la PREMIÈRE désinscription (rejeu du lien)", async () => {
    const trace = mockAbonnes({ error: null });

    const response = await POST(requeteUrl(signUnsubscribeToken(ABONNE)));

    // `is(unsubscribed_at, null)` rend l'écriture idempotente : un lien
    // archivé rouvert six mois plus tard ne réécrit pas la date. Sans ce
    // filtre, la preuve RGPD du moment du retrait de consentement serait
    // écrasée à chaque clic — et un scanner de messagerie la repousserait
    // indéfiniment.
    expect(trace.filtres).toContainEqual(["is", "unsubscribed_at", null]);
    expect(response.status).toBe(200);
  });

  it("répond pareil que la ligne existe, soit déjà désinscrite, soit absente", async () => {
    // Aucun oracle d'existence : les trois cas donnent le même 200. Le
    // filtre `is(null)` fait qu'une ligne déjà désinscrite ne bouge pas, et
    // un id inconnu ne renvoie pas d'erreur PostgREST. Rougirait si la
    // route se mettait à distinguer « 0 ligne touchée » par un 404.
    mockAbonnes({ error: null });
    const premier = await POST(requeteUrl(signUnsubscribeToken(ABONNE)));
    const second = await POST(requeteUrl(signUnsubscribeToken(ABONNE)));
    const inconnu = await POST(
      requeteUrl(signUnsubscribeToken("11111111-2222-4333-8444-555555555555")),
    );

    expect(second.status).toBe(premier.status);
    expect(inconnu.status).toBe(premier.status);
    expect(await second.json()).toEqual(await premier.json());
    expect(await inconnu.json()).toEqual({ ok: true });
  });
});

describe("POST /api/newsletter/unsubscribe — désinscription en un clic (RFC 8058)", () => {
  it("accepte le POST des messageries : jeton dans l'URL, corps One-Click", async () => {
    const trace = mockAbonnes({ error: null });

    // Gmail et Yahoo POSTent le corps `List-Unsubscribe=One-Click` vers
    // l'URL de l'en-tête `List-Unsubscribe` — laquelle porte le jeton dans
    // sa QUERY, jamais dans le corps (cf. `unsubscribeHeaders` de
    // lib/resend.ts). Rougirait si la lecture du jeton basculait sur le
    // seul formulaire : la désinscription en un clic cesserait de
    // fonctionner et l'expéditeur perdrait sa conformité marketing.
    const response = await POST(
      requeteFormulaire("List-Unsubscribe=One-Click", signUnsubscribeToken(ABONNE)),
    );

    expect(response.status).toBe(200);
    expect(trace.filtres).toContainEqual(["eq", "id", ABONNE]);
  });

  it("accepte aussi le formulaire de confirmation (jeton dans le corps)", async () => {
    const trace = mockAbonnes({ error: null });
    const jeton = signUnsubscribeToken(ABONNE);

    const response = await POST(
      requeteFormulaire(`token=${encodeURIComponent(jeton)}`),
    );

    // C'est le chemin de la page /newsletter/unsubscribe, la seule porte
    // qui exige un geste humain explicite.
    expect(response.status).toBe(200);
    expect(trace.filtres).toContainEqual(["eq", "id", ABONNE]);
  });

  it("un jeton refusé sur le chemin FORMULAIRE ne rend jamais la page de succès", async () => {
    // Les douze cas de refus ci-dessus passent tous par le chemin JSON. Le
    // chemin formulaire est pourtant le seul que voit un HUMAIN : si la
    // garde de jeton passait APRÈS le branchement sur le content-type, la
    // page « Vous êtes désinscrit(e) » s'afficherait sans qu'aucune ligne
    // n'ait bougé — l'abonné croirait son consentement retiré et
    // continuerait de recevoir les emails, sans jamais recliquer.
    const response = await POST(requeteFormulaire("token=pasunjeton"));
    const corps = await response.text();

    expect(response.status).toBe(400);
    expect(corps).not.toContain("<html");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("une panne de base sur le chemin FORMULAIRE ne rend pas non plus la page de succès", async () => {
    mockAbonnes({ error: { message: "deadlock detected" } });

    const response = await POST(
      requeteFormulaire(`token=${encodeURIComponent(signUnsubscribeToken(ABONNE))}`),
    );
    const corps = await response.text();

    // La page HTML n'est rendue qu'APRÈS le contrôle d'erreur. Inverser les
    // deux blocs afficherait un accusé de désinscription sur une écriture
    // qui a échoué : le pire des deux mondes, l'utilisateur ne réessaie pas
    // et l'exploitant ne voit rien.
    expect(response.status).toBe(500);
    expect(corps).not.toContain("<html");
    expect(corps).not.toContain("deadlock");
  });

  it("la page de confirmation ne contient ni jeton ni identifiant", async () => {
    mockAbonnes({ error: null });
    const jeton = signUnsubscribeToken(ABONNE);

    const response = await POST(
      requeteFormulaire(`token=${encodeURIComponent(jeton)}`),
    );
    const html = await response.text();

    // Cette page s'ouvre depuis un poste partagé et reste dans l'historique
    // du navigateur : y réafficher le jeton en ferait un lien réutilisable
    // par le suivant, et y afficher l'email exposerait un client.
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(html).not.toContain(jeton);
    expect(html).not.toContain(ABONNE);
    expect(html).not.toContain("@");
  });
});

describe("POST /api/newsletter/unsubscribe — panne et surface", () => {
  it("une panne de base rend un message générique, jamais le détail PostgREST", async () => {
    mockAbonnes({
      error: { message: 'permission denied for relation "newsletter_subscribers"' },
    });

    const response = await POST(requeteUrl(signUnsubscribeToken(ABONNE)));
    const brut = JSON.stringify(await response.json());

    // Rougirait si `error.message` était relayé : un endpoint anonyme
    // décrirait alors le schéma (noms de tables, colonnes, droits) à qui
    // le demande.
    expect(response.status).toBe(500);
    expect(brut).toBe(
      JSON.stringify({ error: "Désinscription temporairement impossible" }),
    );
    expect(brut).not.toContain("permission denied");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("n'expose que POST", () => {
    // Rougirait si un GET était ajouté. Les antivirus de messagerie, les
    // aperçus de lien et les préchargements suivent l'URL de l'en-tête
    // `List-Unsubscribe` sans qu'aucun humain n'ait cliqué : un GET
    // écrivant en base désabonnerait des destinataires à leur insu. C'est
    // exactement la raison d'être de la page de confirmation.
    const surface = unsubscribeRoute as unknown as Record<string, unknown>;
    for (const verbe of ["GET", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
      expect(surface[verbe], verbe).toBeUndefined();
    }
    expect(typeof surface.POST).toBe("function");
  });

  it("reste dynamique", () => {
    // Une réponse mise en cache servirait « vous êtes désinscrit » sans
    // qu'aucune écriture n'ait lieu : le destinataire continuerait de
    // recevoir les emails en croyant s'être désinscrit.
    expect(unsubscribeRoute.dynamic).toBe("force-dynamic");
  });
});

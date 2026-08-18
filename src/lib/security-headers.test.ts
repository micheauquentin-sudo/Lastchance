import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  buildCspReportOnlyPolicy,
  buildPermissionsPolicy,
  buildReportingEndpointsHeader,
  cspSurfaceForPath,
  PUBLIC_NONCE_PREFIXES,
  SENSITIVE_PREFIXES,
} from "./security-headers";

/** Extrait une directive d'une politique assemblée. */
function directive(policy: string, name: string): string | undefined {
  return policy.split("; ").find((d) => d.startsWith(`${name} `) || d === name);
}

describe("Content Security Policy", () => {
  it("retire unsafe-inline des scripts avec un nonce", () => {
    const policy = buildContentSecurityPolicy({
      surface: "sensitive",
      nonce: "nonce-test",
    });
    const script = directive(policy, "script-src");
    expect(script).toContain("'nonce-nonce-test'");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'");
  });

  it("conserve une politique statique compatible avec l'ISR public", () => {
    expect(buildContentSecurityPolicy()).toContain("script-src 'self' 'unsafe-inline'");
  });

  it("n'autorise PLUS la compilation WebAssembly sur aucune surface (MORT-2)", () => {
    // `'wasm-unsafe-eval'` n'a jamais eu qu'une raison d'être : le décodeur
    // meshopt de la mascotte Lumoz, supprimée avec ses dépendances. Plus rien
    // dans `src/` ni `e2e/` ne compile de WebAssembly — la roue est du canvas
    // 2D. Une permission dont le motif est parti reste une permission ouverte,
    // ici jusque sur la surface `sensitive` du back-office.
    const policies = [
      buildContentSecurityPolicy(),
      buildContentSecurityPolicy({ surface: "sensitive", nonce: "n" }),
      buildContentSecurityPolicy({ surface: "public", nonce: "n" }),
    ];
    for (const policy of policies) {
      expect(directive(policy, "script-src")).not.toContain("'wasm-unsafe-eval'");
    }
  });

  it("interdit les scripts en ligne sur les expériences publiques à nonce", () => {
    const script = directive(
      buildContentSecurityPolicy({ surface: "public", nonce: "abc123" }),
      "script-src",
    );
    expect(script).toContain("'nonce-abc123'");
    expect(script).not.toContain("'unsafe-inline'");
  });

  it("garde la liste d'hôtes active sur les expériences publiques", () => {
    // Sans 'strict-dynamic', le navigateur consulte encore la liste
    // d'hôtes : c'est ce qui laisse Turnstile s'injecter lui-même
    // (createElement dans turnstile-widget.tsx) et PostHog charger son
    // bundle. Régression = challenge invisible et jeu bloqué en boutique.
    const script = directive(
      buildContentSecurityPolicy({ surface: "public", nonce: "abc123" }),
      "script-src",
    );
    expect(script).not.toContain("'strict-dynamic'");
    expect(script).toContain("https://challenges.cloudflare.com");
    expect(script).toContain("posthog.com");
  });

  it("laisse le back-office sur strict-dynamic", () => {
    const script = directive(
      buildContentSecurityPolicy({ surface: "sensitive", nonce: "abc123" }),
      "script-src",
    );
    expect(script).toContain("'strict-dynamic'");
  });

  it("ne change rien aux directives hors script-src", () => {
    const statique = buildContentSecurityPolicy();
    const publique = buildContentSecurityPolicy({ surface: "public", nonce: "n" });
    for (const name of [
      "default-src", "style-src", "font-src", "img-src", "connect-src",
      "frame-src", "worker-src", "object-src", "base-uri", "form-action",
      "frame-ancestors",
    ]) {
      expect(directive(publique, name)).toBe(directive(statique, name));
    }
    expect(statique).toContain("upgrade-insecure-requests");
  });
});

describe("Régime CSP par chemin", () => {
  it("classe le back-office et l'authentification en sensible", () => {
    for (const prefix of SENSITIVE_PREFIXES) {
      expect(cspSurfaceForPath(prefix)).toBe("sensitive");
      expect(cspSurfaceForPath(`${prefix}/quelque-chose`)).toBe("sensitive");
    }
  });

  it("classe les expériences publiques dynamiques en public", () => {
    for (const prefix of PUBLIC_NONCE_PREFIXES) {
      expect(cspSurfaceForPath(prefix)).toBe("public");
      expect(cspSurfaceForPath(`${prefix}/abc`)).toBe("public");
    }
  });

  it("laisse /play, /pronos et les pages statiques en régime statique", () => {
    for (const pathname of ["/", "/play/demo", "/pronos/demo", "/legal", "/privacy"]) {
      expect(cspSurfaceForPath(pathname)).toBe("static");
    }
  });

  it("ne déborde pas sur un chemin qui partage seulement le début", () => {
    // /eventuel n'est pas /event : un préfixe ne doit pas s'étendre à un
    // segment plus long, sinon une route future hériterait d'un nonce
    // qu'elle ne peut pas honorer.
    expect(cspSurfaceForPath("/eventuel")).toBe("static");
    expect(cspSurfaceForPath("/dashboard-public")).toBe("static");
  });
});

describe("Collecteur de violations", () => {
  afterEach(() => {
    delete process.env.CSP_REPORT_URI;
  });

  it("n'émet aucune directive de rapport par défaut", () => {
    delete process.env.CSP_REPORT_URI;
    const policy = buildContentSecurityPolicy();
    expect(policy).not.toContain("report-uri");
    expect(policy).not.toContain("report-to");
    expect(buildReportingEndpointsHeader()).toBeUndefined();
    expect(buildCspReportOnlyPolicy()).toBeUndefined();
  });

  it("émet report-uri et report-to quand un collecteur est configuré", () => {
    process.env.CSP_REPORT_URI = "https://collecte.example/csp";
    const policy = buildContentSecurityPolicy();
    expect(policy).toContain("report-uri https://collecte.example/csp");
    expect(policy).toContain("report-to csp-endpoint");
    expect(buildReportingEndpointsHeader()).toBe(
      'csp-endpoint="https://collecte.example/csp"',
    );
  });

  it("refuse une destination non HTTPS, à identifiants ou à séparateur", () => {
    // Cette valeur part dans un en-tête public : des identifiants y
    // seraient exfiltrés à chaque réponse, et un ';' y injecterait une
    // directive CSP arbitraire.
    for (const value of [
      "http://collecte.example/csp",
      "https://user:motdepasse@collecte.example/csp",
      "https://collecte.example/csp; script-src *",
      "pas-une-url",
      "   ",
    ]) {
      process.env.CSP_REPORT_URI = value;
      expect(buildContentSecurityPolicy()).not.toContain("report-uri");
      expect(buildReportingEndpointsHeader()).toBeUndefined();
      expect(buildCspReportOnlyPolicy()).toBeUndefined();
    }
  });

  it("mesure la politique candidate sans nonce ni unsafe-inline", () => {
    process.env.CSP_REPORT_URI = "https://collecte.example/csp";
    const policy = buildCspReportOnlyPolicy();
    expect(policy).toBeDefined();
    const script = directive(policy!, "script-src");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'nonce-");
    expect(script).toContain("'self'");
    // Ignoré par la spec en Report-Only : le garder ne produirait que
    // des rapports trompeurs.
    expect(policy).not.toContain("upgrade-insecure-requests");
    expect(policy).toContain("report-uri https://collecte.example/csp");
  });
});

describe("Permissions-Policy", () => {
  it("autorise la caméra sur notre origine (scanner de QR en caisse)", () => {
    // Régression : camera=() bloquait getUserMedia en production et le
    // scanner échouait après accord de l'utilisateur.
    expect(buildPermissionsPolicy()).toContain("camera=(self)");
  });

  it("interdit tout le reste, iframes comprises", () => {
    const policy = buildPermissionsPolicy();
    for (const feature of [
      "microphone", "geolocation", "payment", "usb",
      "magnetometer", "gyroscope", "accelerometer", "browsing-topics",
    ]) {
      expect(policy).toContain(`${feature}=()`);
    }
    // Une seule directive caméra, et jamais en libre accès.
    expect(policy).not.toContain("camera=()");
    expect(policy).not.toContain("camera=*");
  });
});

/**
 * Un nonce n'a de sens que si la page est rendue à chaque requête et si
 * le proxy la traverse. Ces deux conditions vivent dans d'autres
 * fichiers que security-headers.ts : sans ces tests, un futur
 * `revalidate` sur /quiz ou un ajout au matcher servirait un nonce
 * périmé et bloquerait tous les scripts de la page.
 */
describe("Invariants des expériences publiques à nonce", () => {
  const root = process.cwd();

  function routeFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...routeFiles(full));
      else if (entry === "page.tsx" || entry === "route.ts") out.push(full);
    }
    return out;
  }

  it("rend chaque route à la requête (force-dynamic)", () => {
    for (const prefix of PUBLIC_NONCE_PREFIXES) {
      // Les sept préfixes vivent sous le groupe `(player)`, qui ne consomme
      // aucun segment d'URL : le chemin disque porte le groupe, pas l'URL.
      const files = routeFiles(path.join(root, "src", "app", "(player)", prefix));
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        expect(
          readFileSync(file, "utf8"),
          `${path.relative(root, file)} doit être force-dynamic pour porter un nonce`,
        ).toContain('export const dynamic = "force-dynamic"');
      }
    }
  });

  it("laisse chaque route traverser le proxy", () => {
    const proxy = readFileSync(path.join(root, "src", "proxy.ts"), "utf8");
    const excluded = proxy.match(/\(\?!([^)]*)/)?.[1] ?? "";
    expect(excluded).not.toBe("");
    for (const prefix of PUBLIC_NONCE_PREFIXES) {
      expect(
        excluded.split("|"),
        `${prefix} ne doit pas être exclu du matcher du proxy`,
      ).not.toContain(prefix.slice(1));
    }
  });

  it("rend à la requête les deux pages d'authentification prérendables", () => {
    // /forgot-password et /update-password n'ont aucune dépendance à la
    // session : Next les prérendait au build, donc sans nonce, alors que
    // le proxy leur imposait une CSP à nonce + strict-dynamic — sous
    // laquelle 'self' ne s'applique plus. Tous leurs scripts étaient
    // bloqués et les formulaires ne s'hydrataient jamais.
    for (const route of ["forgot-password", "update-password"]) {
      expect(cspSurfaceForPath(`/${route}`)).toBe("sensitive");
      const page = readFileSync(
        path.join(root, "src", "app", "(auth)", route, "page.tsx"),
        "utf8",
      );
      expect(page, `/${route} doit être force-dynamic pour porter un nonce`)
        .toContain('export const dynamic = "force-dynamic"');
    }
  });

  // TEST-2 (audit p2-fond) : la branche `statSync` échouée s'auto-satisfaisait
  // par un `return` muet — invisible dans le rapport, indistinguable d'un vrai
  // passage — et la boucle `htmlFiles` ne réclamait aucun fichier : un dossier
  // `.next/server/app` vide aurait aussi rendu ce test vert sans avoir rien
  // vérifié. `skipIf` rend le premier cas VISIBLE dans le rapport (skipped, pas
  // passed) ; le second est fermé en exigeant `> 0` fichiers HTML dès que le
  // dossier existe.
  const prerendered = path.join(root, ".next", "server", "app");
  let buildPresent = false;
  try {
    buildPresent = statSync(prerendered).isDirectory();
  } catch {
    buildPresent = false;
  }

  it.skipIf(!buildPresent)(
    "ne prérend aucune route porteuse de nonce (sortie de build)",
    () => {
      // Contrôle général contre la sortie réelle du build : un .html dans
      // .next/server/app = HTML figé au build, donc sans nonce.
      function htmlFiles(dir: string): string[] {
        const out: string[] = [];
        for (const entry of readdirSync(dir)) {
          const full = path.join(dir, entry);
          if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
          else if (entry.endsWith(".html")) out.push(full);
        }
        return out;
      }
      const files = htmlFiles(prerendered);
      expect(
        files.length,
        "dossier de build présent mais aucun .html trouvé : le contrôle ci-dessous n'aurait rien vérifié",
      ).toBeGreaterThan(0);
      for (const file of files) {
        const route = `/${path
          .relative(prerendered, file)
          .replaceAll(path.sep, "/")
          .replace(/\.html$/, "")}`;
        expect(
          cspSurfaceForPath(route),
          `${route} est prérendue : elle ne peut pas porter de nonce`,
        ).toBe("static");
      }
    },
  );

  it("garde /play hors du nonce tant qu'elle est en ISR", () => {
    // Contre-épreuve du choix documenté : /play est mise en cache, un
    // nonce par requête y serait servi périmé.
    const page = readFileSync(
      path.join(root, "src", "app", "(player)", "play", "[slug]", "page.tsx"),
      "utf8",
    );
    expect(page).toContain("export const revalidate");
    expect(cspSurfaceForPath("/play/demo")).toBe("static");
  });
});

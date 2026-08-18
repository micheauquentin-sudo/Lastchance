import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { authorizeCronRequest, timingSafeEquals } from "./timing-safe";

describe("timingSafeEquals", () => {
  it("accepte deux chaînes identiques", () => {
    expect(timingSafeEquals("secret-de-cron", "secret-de-cron")).toBe(true);
  });

  it("refuse deux chaînes de même longueur mais différentes", () => {
    expect(timingSafeEquals("secret-de-cron", "secret-de-crox")).toBe(false);
  });

  it("refuse SANS LEVER sur des longueurs différentes", () => {
    // `timingSafeEqual` de node:crypto lève sur des tailles inégales : sans le
    // test de longueur en amont, une entrée trop courte produirait une
    // exception 500 au lieu d'un refus 401.
    expect(() => timingSafeEquals("court", "beaucoup-plus-long")).not.toThrow();
    expect(timingSafeEquals("court", "beaucoup-plus-long")).toBe(false);
    expect(timingSafeEquals("", "x")).toBe(false);
  });

  it("accepte deux chaînes vides", () => {
    expect(timingSafeEquals("", "")).toBe(true);
  });
});

const cronRequest = (authorization?: string) =>
  new Request("https://app.example.com/api/cron/jobs", {
    headers: authorization ? { authorization } : {},
  });

describe("authorizeCronRequest", () => {
  it("accepte le porteur exact", () => {
    expect(authorizeCronRequest(cronRequest("Bearer s3cr3t"), "s3cr3t")).toBe(true);
  });

  it("refuse un secret erroné, un préfixe absent, un en-tête manquant", () => {
    expect(authorizeCronRequest(cronRequest("Bearer autre"), "s3cr3t")).toBe(false);
    expect(authorizeCronRequest(cronRequest("s3cr3t"), "s3cr3t")).toBe(false);
    expect(authorizeCronRequest(cronRequest(), "s3cr3t")).toBe(false);
  });
});

async function routeFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await routeFiles(absolute)));
    else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.includes(".test."))
      files.push(absolute);
  }
  return files;
}

describe("aucune comparaison de secret en temps variable dans src/app/api", () => {
  it("interdit `!== `Bearer ${secret}`` et ses variantes", async () => {
    // Le fan-out vaut par son exhaustivité : une onzième route cron écrite
    // demain avec un `!==` ordinaire rouvrirait le canal auxiliaire que ce lot
    // ferme, et aucun test de comportement ne le verrait — les deux formes
    // rendent le même 401.
    const files = await routeFiles(path.resolve(__dirname, "../app/api"));
    const coupables: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (
        /!==\s*`Bearer \$\{secret\}`/.test(source)
        || /get\("authorization"\)\s*!==/.test(source)
        || /\bsecret\s*!==/.test(source)
      ) {
        coupables.push(path.relative(path.resolve(__dirname, ".."), file));
      }
    }
    expect(coupables).toEqual([]);
  });
});

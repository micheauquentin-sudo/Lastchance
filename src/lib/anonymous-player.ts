import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { requiredEnv } from "@/lib/env";

const COOKIE_NAME = "lc-anonymous-player";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Identifiant aléatoire de navigateur, sans email, téléphone, nom, IP ou
 * compte. Le cookie est inaccessible à JavaScript et ne sert qu'aux limites
 * de jeu. Le joueur peut l'effacer : Turnstile et la limite réseau restent la
 * défense contre l'automatisation distribuée.
 */
export async function anonymousPlayerKey(): Promise<string> {
  const store = await cookies();
  let id = store.get(COOKIE_NAME)?.value;
  if (!id || !UUID_RE.test(id)) {
    id = randomUUID();
    store.set(COOKIE_NAME, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      priority: "high",
    });
  }
  return createHash("sha256")
    .update(`${requiredEnv("PLAYER_KEY_SALT")}:anonymous-device:${id}`)
    .digest("hex");
}


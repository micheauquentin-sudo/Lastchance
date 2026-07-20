/**
 * Stubs d'API externes pour les E2E — lancés par le job CI à côté de
 * l'app (node e2e/api-stubs.mjs &). L'app les atteint via
 * STRIPE_API_BASE / RESEND_BASE_URL, jamais définis en production.
 *
 *  :12111  Stripe — GET /v1/subscriptions/:id (le webhook re-vérifie
 *          chaque abonnement à la source avant d'appliquer)
 *  :12112  Resend — POST /emails/batch (envoi de newsletter par lots)
 */
import { createServer } from "node:http";

/* ── Stripe : abonnements de test connus du seed ─────────────── */
const SUBSCRIPTIONS = {
  sub_e2e_active: { status: "active", customer: "cus_e2e_stripe", trial_end: null },
  sub_e2e_canceled: { status: "canceled", customer: "cus_e2e_stripe", trial_end: null },
  // Client Stripe inconnu de la base : la RPC doit refuser (500 attendu).
  sub_e2e_ghost: { status: "active", customer: "cus_e2e_ghost", trial_end: null },
};

createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  const match = /^\/v1\/subscriptions\/([^/?]+)/.exec(req.url ?? "");
  const sub = match && SUBSCRIPTIONS[match[1]];
  if (req.method === "GET" && sub) {
    res.end(JSON.stringify({ id: match[1], object: "subscription", ...sub }));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: { type: "invalid_request_error", message: `stub: ${req.method} ${req.url} inconnu` } }));
}).listen(12111, () => console.log("[stub stripe] :12111"));

/* ── Resend : accepte les lots et confirme chaque email ──────── */
createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");
    let items = [];
    try {
      const parsed = JSON.parse(body || "[]");
      items = Array.isArray(parsed) ? parsed : [];
    } catch {
      /* corps illisible → lot vide */
    }
    res.end(JSON.stringify({ data: items.map((_, i) => ({ id: `email_e2e_${i}` })) }));
  });
}).listen(12112, () => console.log("[stub resend] :12112"));

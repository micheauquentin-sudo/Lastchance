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

/* ── Resend : accepte lots et envois simples, mémorise le courrier ──
   GET /_last renvoie les derniers envois (les specs y lisent le lien
   magique de récupération, comme une boîte mail de test). */
const sentEmails = [];

createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET" && req.url?.startsWith("/_last")) {
    res.end(JSON.stringify(sentEmails.slice(-10)));
    return;
  }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let parsed = null;
    try {
      parsed = JSON.parse(body || "null");
    } catch {
      /* corps illisible → rien à mémoriser */
    }
    const items = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    for (const item of items) {
      sentEmails.push({ path: req.url ?? "", to: item?.to ?? null, subject: item?.subject ?? null, html: item?.html ?? null });
    }
    if (sentEmails.length > 50) sentEmails.splice(0, sentEmails.length - 50);
    res.end(JSON.stringify({ data: items.map((_, i) => ({ id: `email_e2e_${i}` })) }));
  });
}).listen(12112, () => console.log("[stub resend] :12112"));

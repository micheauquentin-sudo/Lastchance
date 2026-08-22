"use client";

import { useState } from "react";
import {
  grantMerchantModule,
  revokeMerchantModuleGrant,
} from "@/app/admin/(protected)/merchants/actions";
import {
  estVivant,
  LIBELLE_ETAT,
  LIBELLE_MODULE,
  miroirsDeVitrine,
  type EtatOctroi,
} from "@/lib/admin/module-grants";
import { GRANTABLE_MODULES } from "@/lib/subscription";
import { useActionForm } from "@/lib/use-action-form";
import { formatDate } from "@/lib/utils";
import type { ActionResult } from "@/lib/utils";

type FdAction = (fd: FormData) => Promise<ActionResult>;
const adapt = (fn: FdAction) => (_prev: ActionResult | null, fd: FormData) => fn(fd);

export interface OctroiLigne {
  id: string;
  module: string;
  kind: string;
  source: string;
  /** Distingue un miroir de `vitrine` d'un droit borné à une ressource. */
  resource_id: string | null;
  source_reference: string | null;
  purchased_at: string;
  activate_by: string | null;
  starts_at: string | null;
  ends_at: string | null;
  capacity: number | null;
  revoked_at: string | null;
  revoked_reason: string | null;
}

/**
 * L'état d'une ligne, calculé ICI et non lu de la base.
 *
 * `org_module_grant_state` ne rend que l'octroi le PLUS FAVORABLE d'un module,
 * parce que c'est ce dont une garde a besoin. Cet écran, lui, liste toutes les
 * lignes — il lui faut donc l'état de chacune. Les deux calculs suivent la
 * même règle et ne peuvent pas diverger sur ce qui compte : `estVivant` est le
 * port de `org_has_live_module_grant`, éprouvé dans module-grants.test.ts.
 *
 * Et ceci ne décide RIEN : c'est un affichage. Le droit se tranche en base.
 */
function etatDe(l: OctroiLigne, maintenant: Date): EtatOctroi {
  if (l.revoked_at) return "revoked";
  if (estVivant(l, maintenant)) return "live";
  if (!l.starts_at) {
    return l.activate_by && new Date(l.activate_by) <= maintenant
      ? "activation_expired"
      : "pending";
  }
  return new Date(l.starts_at) > maintenant ? "scheduled" : "expired";
}

const TON: Record<EtatOctroi, string> = {
  live: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  scheduled: "bg-sky-500/10 text-sky-300 ring-sky-500/30",
  pending: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  expired: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/30",
  activation_expired: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/30",
  revoked: "bg-red-500/10 text-red-300 ring-red-500/30",
};

const champ =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-violet-400/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30";

export function ModuleGrantsPanel({
  organizationId,
  grants,
}: {
  organizationId: string;
  grants: OctroiLigne[];
}) {
  const maintenant = new Date();
  const [kind, setKind] = useState<"pass" | "recurring">("pass");
  const [demarrage, setDemarrage] = useState<"maintenant" | "a_activer">("maintenant");

  const { state, pending, onSubmit } = useActionForm(adapt(grantMerchantModule), {
    resetOnSuccess: true,
    // Famille « insertion → doublon » : l'octroi créé n'apparaît que dans la
    // liste rendue par le serveur ci-dessous. Sans rechargement, l'admin ne
    // voit rien, refait le geste, et accorde DEUX droits payants.
    reloadOnSuccess: true,
  });

  // Un récurrent n'a pas de démarrage différé (module pur : `calculerFenetres`
  // le refuse). L'écran ne propose donc pas un choix que le serveur rejettera.
  const differable = kind === "pass";

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-white">Octrois de modules</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Un octroi vivant ouvre son module <strong>et</strong> le socle commun,
          sans abonnement. À l&apos;échéance, le module se met en pause : rien
          n&apos;est supprimé, et rien ne se prolonge tout seul.
        </p>
      </div>

      {grants.length === 0 ? (
        <p className="text-sm text-zinc-500">Aucun octroi.</p>
      ) : (
        <ul className="space-y-2">
          {grants.map((g) => {
            const etat = etatDe(g, maintenant);
            return (
              <li
                key={g.id}
                className="rounded-lg border border-white/10 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      {LIBELLE_MODULE[g.module] ?? g.module}
                      <span className="ml-2 text-xs font-normal text-zinc-500">
                        {g.kind === "pass" ? "achat unique" : "récurrent"}
                        {g.source === "stripe" && " · Stripe"}
                        {g.capacity !== null && ` · ${g.capacity} joueurs`}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {g.starts_at
                        ? `du ${formatDate(g.starts_at)}${g.ends_at ? ` au ${formatDate(g.ends_at)}` : " — sans terme"}`
                        : g.activate_by
                          ? `à démarrer avant le ${formatDate(g.activate_by)}`
                          : "sans fenêtre"}
                      {g.source_reference && ` · réf. ${g.source_reference}`}
                    </p>
                    {g.revoked_reason && (
                      <p className="mt-0.5 text-xs text-red-300">
                        Révoqué : {g.revoked_reason}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${TON[etat]}`}
                    >
                      {LIBELLE_ETAT[etat]}
                    </span>
                    {!g.revoked_at && g.source !== "stripe" && (
                      <RevokeForm
                        organizationId={organizationId}
                        grantId={g.id}
                        // MÊME RELEVÉ QUE LE SERVEUR. L'action révoque le
                        // groupe rendu par `miroirsDeVitrine` : le lui faire
                        // recalculer ici sur les mêmes lignes est ce qui
                        // garantit que l'avertissement nomme exactement ce qui
                        // va tomber, ni plus ni moins.
                        aussi={miroirsDeVitrine(g, grants)}
                      />
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-white/10 p-3">
        <input type="hidden" name="organizationId" value={organizationId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              Module
            </span>
            <select name="module" className={champ} defaultValue="hunts">
              {GRANTABLE_MODULES.map((m) => (
                <option key={m} value={m} className="bg-zinc-900">
                  {LIBELLE_MODULE[m] ?? m}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              Type
            </span>
            <select
              name="kind"
              className={champ}
              value={kind}
              onChange={(e) => {
                const v = e.target.value as "pass" | "recurring";
                setKind(v);
                if (v === "recurring") setDemarrage("maintenant");
              }}
            >
              <option value="pass" className="bg-zinc-900">Achat unique (durée fixe)</option>
              <option value="recurring" className="bg-zinc-900">Récurrent (sans terme)</option>
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              Démarrage
            </span>
            <select
              name="demarrage"
              className={champ}
              value={demarrage}
              disabled={!differable}
              onChange={(e) =>
                setDemarrage(e.target.value as "maintenant" | "a_activer")
              }
            >
              <option value="maintenant" className="bg-zinc-900">Tout de suite</option>
              <option value="a_activer" className="bg-zinc-900">À activer plus tard</option>
            </select>
            {!differable && (
              <span className="mt-1 block text-xs text-zinc-500">
                Un droit récurrent court dès qu&apos;il est accordé.
              </span>
            )}
          </label>
          {kind === "pass" && demarrage === "maintenant" && (
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
                Durée (jours)
              </span>
              <input name="dureeJours" type="number" min={1} max={366} className={champ} />
            </label>
          )}
          {kind === "pass" && demarrage === "a_activer" && (
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
                À démarrer sous (jours)
              </span>
              <input
                name="delaiActivationJours"
                type="number"
                min={1}
                max={366}
                className={champ}
              />
            </label>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              Jauge (facultatif)
            </span>
            <input name="jauge" type="number" min={1} max={500} className={champ} />
            <span className="mt-1 block text-xs text-zinc-500">
              Gelée dès l&apos;enregistrement : elle ne pourra plus être modifiée.
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">
              Référence (facultatif)
            </span>
            <input name="reference" maxLength={255} className={champ} />
          </label>
        </div>

        <div className="flex items-center justify-between gap-3">
          {state && !state.ok ? (
            <p role="alert" className="text-xs text-red-400">{state.error}</p>
          ) : (
            <span />
          )}
          <button
            disabled={pending}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
          >
            {pending ? "…" : "Accorder"}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Le bouton de révocation, et l'AVERTISSEMENT qui va avec.
 *
 * Un octroi `vitrine` traîne trois octrois miroirs (`reserver`, `duo`,
 * `bande`) que l'opérateur n'a jamais créés — `20261020120000` les a posés. Le
 * serveur les révoque avec lui, sans quoi un commerçant coupé continuerait de
 * prendre des réservations. Mais un geste qui ferme silencieusement quatre
 * droits quand on en désignait un serait le symétrique du défaut corrigé : la
 * liste est donc NOMMÉE, au moment où l'opérateur s'apprête à confirmer.
 */
function RevokeForm({
  organizationId,
  grantId,
  aussi,
}: {
  organizationId: string;
  grantId: string;
  aussi: OctroiLigne[];
}) {
  const [ouvert, setOuvert] = useState(false);
  const { state, pending, onSubmit } = useActionForm(
    adapt(revokeMerchantModuleGrant),
    {
      // Même famille : la ligne ne change d'état que par le rendu serveur.
      // Sans rechargement, l'admin croit la révocation échouée et recommence,
      // et le second essai répond « déjà révoqué » — un échec après une
      // réussite, sur un droit payant.
      reloadOnSuccess: true,
    },
  );

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="text-xs text-zinc-400 underline underline-offset-2 hover:text-red-300"
      >
        {aussi.length > 0 ? `Révoquer (${aussi.length + 1} droits)` : "Révoquer"}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {aussi.length > 0 && (
        <p className="max-w-xs text-right text-xs text-amber-300">
          Ferme aussi, aux mêmes dates et sous le même motif :{" "}
          <strong className="font-medium">
            {aussi.map((m) => LIBELLE_MODULE[m.module] ?? m.module).join(", ")}
          </strong>
          .
        </p>
      )}
      <form onSubmit={onSubmit} className="flex items-center gap-1.5">
        <input type="hidden" name="organizationId" value={organizationId} />
        <input type="hidden" name="grantId" value={grantId} />
        <input
          name="reason"
          required
          minLength={3}
          maxLength={300}
          placeholder="Motif (obligatoire)"
          aria-label="Motif de révocation"
          className="w-44 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white"
        />
        <button
          disabled={pending}
          className="rounded-lg bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-300 ring-1 ring-inset ring-red-500/30 disabled:opacity-60"
        >
          {pending ? "…" : "Confirmer"}
        </button>
        {state && !state.ok && (
          <span className="text-xs text-red-400">{state.error}</span>
        )}
      </form>
    </div>
  );
}

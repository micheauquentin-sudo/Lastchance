import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { can } from "@/lib/admin/rbac";
import { getMerchantDetail } from "@/lib/admin/data";
import { PLANS } from "@/lib/stripe";
import { formatDate } from "@/lib/utils";
import { EmptyState, Panel, StatusBadge } from "@/components/admin/ui";
import {
  CompAccessControl,
  DeleteMerchantControl,
  EventsAddonControl,
  HuntsAddonControl,
  JackpotAddonControl,
  LoyaltyAddonControl,
  NoteForm,
  PlanControl,
  PronosticsAddonControl,
  StatusControl,
} from "@/components/admin/merchant-controls";

export const metadata: Metadata = { title: "Fiche commerçant · Back-office", robots: { index: false } };

export default async function MerchantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin("merchants.view");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const detail = await getMerchantDetail(id);
  if (!detail) notFound();
  const { org, members, counts, notes } = detail;

  const canEdit = can(admin.role, "merchants.edit");
  const canCompAccess = can(admin.role, "merchants.comp_access");
  const canSuspend = can(admin.role, "merchants.suspend");
  const canDelete = can(admin.role, "merchants.delete");
  const canNote = can(admin.role, "support.reply");

  const compActive =
    org.comp_access &&
    (!org.comp_access_until || new Date(org.comp_access_until) > new Date());

  const kpis: [string, number][] = [
    ["Campagnes", counts.campaigns],
    ["Tours joués", counts.spins],
    ["Participations", counts.participations],
    ["QR codes", counts.qrCodes],
  ];

  return (
    <div>
      <Link href="/admin/merchants" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white">
        ← Commerçants
      </Link>

      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">{org.name}</h1>
          <p className="mt-1 font-mono text-sm text-zinc-500">{org.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={org.subscription_status} />
          <span className="rounded-md bg-white/5 px-2 py-0.5 text-xs capitalize text-zinc-300 ring-1 ring-inset ring-white/10">
            {org.plan}
          </span>
          {compActive && (
            <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
              Accès offert
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map(([label, value]) => (
          <Panel key={label} className="p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{value.toLocaleString("fr-FR")}</p>
          </Panel>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-white">Informations</h2>
          <dl className="space-y-2.5 text-sm">
            <Row label="Inscription" value={formatDate(org.created_at)} />
            <Row label="Fin d'essai" value={formatDate(org.trial_ends_at)} />
            <Row label="Client Stripe" value={org.stripe_customer_id ?? "—"} mono />
            <Row
              label="Impayé depuis"
              value={org.past_due_since ? formatDate(org.past_due_since) : "—"}
            />
            <Row label="Membres" value={String(members.length)} />
          </dl>
        </Panel>

        <Panel className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-white">Abonnement</h2>
          {canSuspend || canEdit || canCompAccess ? (
            <div className="space-y-5">
              {canSuspend && (
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Statut</p>
                  <StatusControl organizationId={org.id} current={org.subscription_status} />
                </div>
              )}
              {canEdit && (
                <>
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Plan</p>
                    <PlanControl
                      organizationId={org.id}
                      current={org.plan}
                      plans={PLANS.map((p) => ({ id: p.id, name: p.name }))}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
                      Addon Pronostics
                    </p>
                    <PronosticsAddonControl
                      organizationId={org.id}
                      enabled={org.addon_pronostics}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
                      Addon Chasse au trésor
                    </p>
                    <HuntsAddonControl
                      organizationId={org.id}
                      enabled={org.addon_hunts}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
                      Addon Passeport de fidélité
                    </p>
                    <LoyaltyAddonControl
                      organizationId={org.id}
                      enabled={org.addon_loyalty}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
                      Addon Jackpot collectif
                    </p>
                    <JackpotAddonControl
                      organizationId={org.id}
                      enabled={org.addon_jackpot}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
                      Addon Mode événement en direct
                    </p>
                    <EventsAddonControl
                      organizationId={org.id}
                      enabled={org.addon_events}
                    />
                  </div>
                </>
              )}
              {canCompAccess && (
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
                    Accès offert (premium sans paiement)
                  </p>
                  <CompAccessControl
                    organizationId={org.id}
                    enabled={org.comp_access}
                    until={org.comp_access_until}
                    note={org.comp_access_note}
                    addonPronostics={org.addon_pronostics}
                    addonHunts={org.addon_hunts}
                    addonLoyalty={org.addon_loyalty}
                    addonJackpot={org.addon_jackpot}
                  />
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              Lecture seule — votre rôle ne permet pas de modifier l&apos;abonnement.
            </p>
          )}
        </Panel>
      </div>

      <Panel className="mt-6 p-5">
        <h2 className="mb-4 text-sm font-semibold text-white">Notes internes</h2>
        {canNote && (
          <div className="mb-5">
            <NoteForm organizationId={org.id} />
          </div>
        )}
        {notes.length === 0 ? (
          <EmptyState title="Aucune note" hint="Ajoutez un premier commentaire de suivi." />
        ) : (
          <ul className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <p className="text-sm text-zinc-200">{n.body}</p>
                <p className="mt-1.5 text-xs text-zinc-500">
                  {n.author_email} · {formatDate(n.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {canDelete && (
        <div className="mt-6">
          <DeleteMerchantControl
            organizationId={org.id}
            slug={org.slug}
            name={org.name}
          />
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className={`text-right text-zinc-200 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import {
  ApplyTemplateButton,
  DeleteTemplateButton,
} from "@/components/dashboard/campaign-template-actions";
import {
  summarizeBlueprint,
  type TemplatePromises,
} from "@/components/dashboard/campaign-template-preview";
import { listCampaignTemplates } from "@/lib/campaign-templates";
import { formatDate } from "@/lib/utils";

/**
 * Place de marché de campagnes — GALERIE (composant serveur).
 *
 * Deux sources, jamais mélangées visuellement :
 *  • « Modèles Lastchance » — le catalogue en code (`listCampaignTemplates`) ;
 *  • « Mes modèles » — les modèles PRIVÉS de l'organisation active, lus par
 *    la page (RLS membre + filtre `organization_id` explicite) et passés en
 *    props. Ils ne sont JAMAIS présentés comme un catalogue commun : le
 *    sous-titre le dit, ils n'appartiennent qu'à cette organisation.
 *
 * Le blueprint ne quitte pas le serveur : les vignettes sont rendues ici,
 * seuls les boutons (appliquer / supprimer) sont des composants clients.
 */

/** Modèle privé tel que lu par la page des campagnes. */
export interface PrivateTemplateRow {
  id: string;
  name: string;
  description: string | null;
  /** jsonb — forme validée à l'application, lue défensivement à l'affichage. */
  blueprint: unknown;
  created_at: string;
}

/** La promesse centrale du produit — répétée, jamais implicite. */
const DRAFT_PROMISE =
  "Appliquer un modèle crée une campagne en brouillon, déjà configurée. Rien n'est publié, aucun email n'est envoyé : vous relisez tout, puis vous l'activez vous-même.";

function PromiseRow({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <dt className="flex w-28 shrink-0 items-start gap-1.5 text-zinc-500">
        <span aria-hidden="true">{icon}</span>
        <span>{label}</span>
      </dt>
      <dd className="min-w-0 flex-1 text-k-ink">{children}</dd>
    </div>
  );
}

/** Les sept promesses d'un modèle, en une liste synthétique. */
function TemplatePromiseList({ promises }: { promises: TemplatePromises }) {
  return (
    <dl className="mt-4 space-y-1.5 text-xs">
      <PromiseRow icon="🎨" label="Visuel">
        {promises.visual}
      </PromiseRow>
      <PromiseRow icon="🎯" label="Jeu">
        {promises.game}
      </PromiseRow>
      <PromiseRow icon="✍️" label="Textes">
        <span className="italic">« {promises.texts} »</span>
      </PromiseRow>
      <PromiseRow icon="🎁" label="Lots suggérés">
        {promises.prizes}
        {promises.prizeLabels.length > 0 && (
          <span className="block text-zinc-500">
            {promises.prizeLabels.join(" · ")}
            {promises.prizeOverflow > 0 && ` · +${promises.prizeOverflow}`}
          </span>
        )}
      </PromiseRow>
      <PromiseRow icon="✉️" label="Emails">
        {promises.emails}
        {promises.emailCount > 0 && (
          <span className="block font-semibold text-zinc-500">
            Fournis en texte, non activés — vous choisirez de les envoyer ou non.
          </span>
        )}
      </PromiseRow>
      <PromiseRow icon="📅" label="Durée">
        {promises.duration}
      </PromiseRow>
      <PromiseRow icon="⚙️" label="Règles">
        <span className="flex flex-wrap gap-1">
          {promises.rules.map((rule) => (
            <span
              key={rule}
              className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5"
            >
              {rule}
            </span>
          ))}
        </span>
      </PromiseRow>
    </dl>
  );
}

function TemplateCard({
  emoji,
  title,
  description,
  meta,
  promises,
  actions,
}: {
  emoji: string;
  title: string;
  description: string | null;
  meta?: string;
  promises: TemplatePromises | null;
  actions: ReactNode;
}) {
  return (
    <li>
      <Card className="flex h-full flex-col">
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none" aria-hidden="true">
            {emoji}
          </span>
          <div className="min-w-0">
            <h4 className="font-bold text-k-ink">{title}</h4>
            {meta && <p className="mt-0.5 text-xs text-zinc-500">{meta}</p>}
          </div>
        </div>

        {description && (
          <p className="mt-2 text-sm text-zinc-600">{description}</p>
        )}

        {promises ? (
          <TemplatePromiseList promises={promises} />
        ) : (
          <p className="mt-4 text-xs font-semibold text-red-600">
            Ce modèle est illisible. Enregistrez-le à nouveau depuis une
            campagne.
          </p>
        )}

        <div className="mt-auto pt-4">{actions}</div>
      </Card>
    </li>
  );
}

export function CampaignTemplateGallery({
  privateTemplates,
  defaultOpen = false,
}: {
  privateTemplates: PrivateTemplateRow[];
  /** Ouverte d'emblée quand le commerçant n'a encore aucune campagne. */
  defaultOpen?: boolean;
}) {
  const catalogue = listCampaignTemplates();

  return (
    <details
      open={defaultOpen}
      className="mb-8 rounded-2xl border-2 border-k-ink bg-white shadow-[4px_4px_0_rgba(33,29,22,0.9)]"
    >
      <summary className="cursor-pointer rounded-2xl px-5 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink">
        <span className="font-bold text-k-ink">
          Partir d&apos;un modèle{" "}
          <span className="font-normal text-zinc-500">
            ({catalogue.length} modèles Lastchance
            {privateTemplates.length > 0 &&
              ` · ${privateTemplates.length} à vous`}
            )
          </span>
        </span>
      </summary>

      <div className="border-t-2 border-k-ink px-5 py-5">
        <p className="rounded-xl border-2 border-k-ink bg-k-yellow/30 px-4 py-3 text-sm font-semibold text-k-ink">
          <span aria-hidden="true">📝</span> {DRAFT_PROMISE}
        </p>

        {/* ── Le catalogue Lastchance ── */}
        <section className="mt-6" aria-labelledby="templates-catalogue">
          <h3 id="templates-catalogue" className="font-bold text-k-ink">
            Modèles Lastchance
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            Des jeux prêts à l&apos;emploi pour les temps forts de l&apos;année.
            Tout reste modifiable ensuite.
          </p>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {catalogue.map((template) => (
              <TemplateCard
                key={template.key}
                emoji={template.emoji}
                title={template.label}
                description={template.description}
                promises={summarizeBlueprint(template.blueprint)}
                actions={
                  <>
                    <ApplyTemplateButton
                      templateKey={template.key}
                      name={template.label}
                    />
                    <p className="mt-2 text-xs text-zinc-500">
                      Crée un brouillon — rien n&apos;est publié ni envoyé.
                    </p>
                  </>
                }
              />
            ))}
          </ul>
        </section>

        {/* ── La bibliothèque privée de l'organisation ── */}
        <section className="mt-8" aria-labelledby="templates-private">
          <h3 id="templates-private" className="font-bold text-k-ink">
            Mes modèles
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            Vos campagnes enregistrées comme modèles. Elles ne sont visibles que
            par votre équipe.
          </p>
          {privateTemplates.length === 0 ? (
            <p className="mt-4 rounded-xl border-2 border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500">
              Aucun modèle pour l&apos;instant. Ouvrez une campagne qui vous
              plaît et choisissez «&nbsp;Enregistrer comme modèle&nbsp;» pour la
              rejouer plus tard.
            </p>
          ) : (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {privateTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  emoji="⭐"
                  title={template.name}
                  description={template.description}
                  meta={`Enregistré le ${formatDate(template.created_at)}`}
                  promises={summarizeBlueprint(template.blueprint)}
                  actions={
                    <>
                      <ApplyTemplateButton
                        templateId={template.id}
                        name={template.name}
                      />
                      <p className="mt-2 text-xs text-zinc-500">
                        Crée un brouillon — rien n&apos;est publié ni envoyé.
                      </p>
                      <div className="mt-2">
                        <DeleteTemplateButton
                          id={template.id}
                          name={template.name}
                        />
                      </div>
                    </>
                  }
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </details>
  );
}

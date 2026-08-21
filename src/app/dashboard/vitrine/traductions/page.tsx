import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import {
  loadVitrineDashboardContext,
  loadVitrineTraductions,
} from "@/lib/vitrine-context";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import {
  JaugeTraductions,
  TraductionsEditeur,
} from "@/components/vitrine/traductions-editeur";

export const metadata: Metadata = { title: "Traductions" };

/**
 * L'ÉCRAN DE TRADUCTION (VIT-5 / L15) — l'anglais de la vitrine, champ à champ.
 *
 * ── UNE PAGE À PART, ET NON UNE SECTION DE PLUS ──
 *
 * L'écran Vitrine porte déjà les réglages, « À la une », l'import, le catalogue
 * et les QR. Y empiler la traduction de CHAQUE champ de CHAQUE fiche aurait
 * doublé la hauteur d'une page déjà longue, pour un geste qui n'a rien à voir
 * avec les autres : on traduit une fois, à froid, pas à chaque service.
 *
 * ── LA MÊME GARDE D'AFFICHAGE QUE LA PAGE PARENTE ──
 *
 * `capacitesDuModule("vitrine")` — le même argument, le même entitlement : le
 * module « vitrine » couvre les trois capacités serveur (migration
 * 20261001120000), et la traduction n'en est pas une quatrième. Découvrir reste
 * ouvert à tous (cahier §3) : l'écran se rend, l'encart d'offre explique, et
 * `canEditDraft` décide seul de la présence des boutons. La garde RÉELLE est
 * dans les actions et dans la RPC, pas ici.
 *
 * ── DEUX LECTURES, ET AUCUNE N'EST DE TROP ──
 *
 * `loadVitrineTraductions` rend l'état des champs — c'est la matière de l'écran.
 * `loadVitrineDashboardContext` rend le CATALOGUE, et il sert à une seule chose :
 * remettre les cibles dans l'ordre du menu. La RPC de traduction ne porte aucun
 * lien de parenté (elle rend un tableau plat trié par identifiant, voir
 * `TraductionsEditeur`), et il n'y a pas d'autre source de l'arbre. Reconstruire
 * la hiérarchie sans elle aurait demandé d'ajouter les parents au contrat
 * serveur — c'est-à-dire de faire porter à la base une décision de rendu que sa
 * migration refuse explicitement de prendre.
 */
export default async function VitrineTraductionsPage() {
  const capacites = await capacitesDuModule("vitrine");
  if (!capacites.canExplore) notFound();

  const [ctx, traductions] = await Promise.all([
    loadVitrineDashboardContext(),
    loadVitrineTraductions(),
  ]);

  const cartes = ctx.ok ? ctx.cartes : [];
  const settings = ctx.ok ? ctx.settings : null;
  const etat = traductions.ok ? traductions.etat : null;

  return (
    <div>
      <PageHeader
        surtitre="Vos animations"
        titre="Traductions (anglais)"
        sousTitre="Vos visiteurs étrangers lisent votre carte dans leur langue. Chaque champ garde son français à côté : vous traduisez en le regardant."
        retour={{ href: "/dashboard/vitrine", label: "Vitrine" }}
      />

      <ModuleCapabilityNotice capacites={capacites} entitlement="vitrine">
        L&apos;anglais de votre vitrine, champ par champ — et la mesure honnête
        de ce qui est à jour.
      </ModuleCapabilityNotice>

      {/* MÊME PREMIER PAS QUE LA PAGE PARENTE : sans adresse, il n'y a pas de
          vitrine, donc rien à traduire. Le dire ici évite un écran vide dont la
          cause serait à chercher un cran plus haut. */}
      {!settings ? (
        <Card className="py-10 text-center">
          <p className="text-sm font-semibold text-k-body">
            Choisissez d&apos;abord l&apos;adresse de votre vitrine, puis
            revenez traduire.
          </p>
        </Card>
      ) : /* LE REFUS DU CHARGEUR EST DIT, PAS REMPLACÉ PAR UN ÉCRAN VIDE.
             `loadVitrineTraductions` refuse pour une raison nommée (session,
             rôle, droit) ; rendre une jauge à 0 sur 0 aurait fait lire au
             commerçant « rien à traduire » là où il faut lire « on n'a pas pu
             lire ». Les deux se ressemblent à l'écran et n'appellent pas le
             même geste. */
      etat === null ? (
        <Card className="py-10 text-center">
          <p className="text-sm font-semibold text-k-body">
            {traductions.ok ? null : traductions.error}
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          <JaugeTraductions resume={etat.resume} />
          <TraductionsEditeur
            etat={etat}
            cartes={cartes}
            peutEditer={capacites.canEditDraft}
          />
        </div>
      )}
    </div>
  );
}

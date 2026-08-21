import Link from "next/link";
import type {
  LangueVitrine,
  PortesVitrineView,
} from "@/lib/vitrine";
import { TEXTES_VITRINE } from "@/components/vitrine/langue";
import { FenetreOffre } from "@/components/vitrine/fenetre-offre";

/**
 * LES PORTES DES MODULES (VIT-3 / L13) — l'annuaire que la Vitrine devient.
 *
 * ── CE QUE CES DEUX BLOCS RÉPARENT ──
 *
 * Les trois pages publiques de Réserver et le quiz public n'avaient AUCUN
 * annuaire : ils ne se joignaient que par une adresse déjà connue — un QR
 * imprimé, un lien collé. Un client attablé qui voulait retenir une table
 * n'avait aucun chemin depuis la carte qu'il était en train de lire.
 *
 * ── DES LIENS, ET RIEN QUE DES LIENS ──
 *
 * Le parcours est carte → Réserver → jeu, à LANCEMENT VOLONTAIRE. Aucune
 * redirection, aucun compte à rebours, aucun encart qui s'ouvre tout seul :
 * ces blocs ne font que dire ce qui est ouvert, et le visiteur décide. Un jeu
 * qui démarre sans qu'on l'ait demandé, sur la page qu'on consulte pendant son
 * repas, se ferme — et la porte est perdue pour de bon.
 *
 * ── LES NOMS SONT EN FRANÇAIS, MÊME SUR `/en` ──
 *
 * `portes` ne porte AUCUN champ traduisible (décision de la migration
 * 20261014120000) : les faire entrer dans la couverture aurait fait retomber
 * toute vitrine traduite sous le seuil de 95 % du sélecteur de langue le jour
 * de la livraison. Seul le CHROME — les trois intitulés de groupe — suit la
 * langue de la page, et il vient de `langue.ts`.
 *
 * ── UN BLOC VIDE N'EST PAS RENDU ──
 *
 * La base rend les six listes TOUJOURS, éventuellement vides : « elle rend ce
 * qui est ouvert, elle ne met pas en page ». La décision d'affichage est donc
 * ici, et elle est simple — pas une seule porte, pas de titre, pas d'ancre. Un
 * « Réserver » suivi de rien est un commerce qui a l'air fermé.
 */

/**
 * Les deux moitiés de l'annuaire, prises DIRECTEMENT à la vue de
 * `@/lib/vitrine` : aucune forme n'est redéclarée ici. Un champ qui change
 * là-bas fait rougir la compilation ici, ce qu'une interface recopiée — même
 * exacte le jour où on l'écrit — n'aurait jamais fait.
 */
export function BlocReserver({
  portes,
  lang,
}: {
  portes: PortesVitrineView["reserver"];
  lang: LangueVitrine;
}) {
  const t = TEXTES_VITRINE[lang];
  const { activites, files, offres } = portes;

  if (
    activites.length === 0 &&
    files.length === 0 &&
    offres.length === 0
  ) {
    return null;
  }

  return (
    // L'ANCRE EST STABLE ET SANS IDENTIFIANT : `#bloc-reserver` est ce qu'un QR
    // imprimé (VIT-2) peut viser sans dépendre d'une activité qui, elle, peut
    // être coupée par le commerçant le lendemain de l'impression.
    <section
      id="bloc-reserver"
      className="mb-10 scroll-mt-4"
      aria-labelledby="bloc-reserver-titre"
    >
      <TitreBloc id="bloc-reserver-titre">{t.reserverTitre}</TitreBloc>

      <GroupePortes titre={t.reserverActivites} vide={activites.length === 0}>
        {activites.map((a) => (
          <CarteLien key={a.id} href={`/reserver/${a.id}`} nom={a.nom} />
        ))}
      </GroupePortes>

      <GroupePortes titre={t.reserverFiles} vide={files.length === 0}>
        {files.map((f) => (
          <CarteLien key={f.id} href={`/reserver/file/${f.id}`} nom={f.nom} />
        ))}
      </GroupePortes>

      <GroupePortes titre={t.reserverOffres} vide={offres.length === 0}>
        {offres.map((o) => (
          <CarteLien key={o.id} href={`/reserver/stock/${o.id}`} nom={o.nom}>
            {/* LES DEUX BORNES OU RIEN : une fenêtre à moitié dite (« à partir
                de 14 h », sans fin) se lit comme une offre sans limite, ce
                qu'aucune offre à stock n'est. */}
            {o.windowStartsAt && o.windowEndsAt ? (
              <FenetreOffre
                debut={o.windowStartsAt}
                fin={o.windowEndsAt}
                lang={lang}
              />
            ) : null}
          </CarteLien>
        ))}
      </GroupePortes>
    </section>
  );
}

export function BlocExperiences({
  portes,
  lang,
}: {
  portes: PortesVitrineView["experiences"];
  lang: LangueVitrine;
}) {
  const t = TEXTES_VITRINE[lang];
  if (portes.quiz.length === 0) return null;

  return (
    <section
      id="bloc-experiences"
      className="mb-10 scroll-mt-4"
      aria-labelledby="bloc-experiences-titre"
    >
      <TitreBloc id="bloc-experiences-titre">{t.experiencesTitre}</TitreBloc>
      {/* LA MENTION DIT QUE RIEN NE PART TOUT SEUL. Elle n'est pas décorative :
          c'est la promesse produit du lancement volontaire, écrite là où le
          visiteur hésite. */}
      <p className="mb-3 text-sm text-[var(--vitrine-sur-secondary)]/70">
        {t.experiencesInvite}
      </p>
      <ul className="space-y-2">
        {portes.quiz.map((q) => (
          <CarteLien key={q.slug} href={`/quiz/${q.slug}`} nom={q.titre} />
        ))}
      </ul>
    </section>
  );
}

function TitreBloc({ id, children }: { id: string; children: string }) {
  return (
    <h2
      id={id}
      className="mb-3 font-[family-name:var(--vitrine-titre)] text-lg font-bold uppercase tracking-[0.12em] text-[var(--vitrine-primary)]"
    >
      {children}
    </h2>
  );
}

/**
 * Un groupe de portes — muet quand il n'a rien à montrer.
 *
 * Le titre du groupe est un `<h3>` SOUS le `<h2>` du bloc : les trois familles
 * (table, file, offre) sont des sous-parties de « Réserver », et les mettre au
 * même rang aurait donné trois blocs indépendants au lecteur d'écran pour un
 * seul point de repère à l'œil.
 */
function GroupePortes({
  titre,
  vide,
  children,
}: {
  titre: string;
  vide: boolean;
  children: React.ReactNode;
}) {
  if (vide) return null;
  return (
    <div className="mb-5 last:mb-0">
      <h3 className="mb-2 text-sm font-semibold text-[var(--vitrine-sur-secondary)]/80">
        {titre}
      </h3>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

/**
 * UNE PORTE — sobre, et large sous le pouce.
 *
 * `min-h-14` (56 px) plutôt que les 44 px minimaux des pastilles de liens : ces
 * cartes portent deux lignes sur les offres, et la cible doit rester la même
 * qu'elle en porte une ou deux. Les couleurs viennent des variables CSS du
 * thème — aucune classe ne peut être compilée pour une couleur venue de la base.
 *
 * `<Link>` et non `<a>` : ce sont des routes INTERNES, et la navigation client
 * évite un rechargement complet de la page depuis un téléphone en salle.
 */
function CarteLien({
  href,
  nom,
  children,
}: {
  href: string;
  nom: string;
  children?: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-[var(--vitrine-primary)]/25 px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vitrine-primary)]"
      >
        <span className="min-w-0">
          <span className="block font-semibold leading-tight">{nom}</span>
          {children}
        </span>
        {/* Décoratif : le nom du lien EST son intitulé accessible, et faire lire
            « flèche vers la droite » après chaque porte n'ajouterait rien. */}
        <span
          aria-hidden
          className="shrink-0 text-lg text-[var(--vitrine-primary)]"
        >
          →
        </span>
      </Link>
    </li>
  );
}

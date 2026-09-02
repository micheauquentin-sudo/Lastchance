import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  altPhotoVitrine,
  sourcesPhotoVitrine,
  srcSetPhotoVitrine,
} from "@/lib/vitrine-photo";
import type {
  HorairesVitrine,
  LangueVitrine,
  VitrineLiensView,
} from "@/lib/vitrine";
import type { AllureResolue } from "@/components/vitrine/theme";
import { PastilleOuverture } from "@/components/vitrine/studio/horaires-badge";
import { PastilleHoraires } from "@/components/vitrine/studio/horaires-pastille";

/**
 * LE HERO — la première chose que voit le client qui vient de scanner.
 *
 * ── PLEINE LARGEUR, ET NON UNE VIGNETTE ARRONDIE ──
 *
 * La couverture occupe toute la largeur et toute la hauteur réglée, avec le nom
 * du commerce POSÉ DESSUS. C'est la mise en page de la maquette de référence, et
 * ce n'est pas qu'une question de goût : une photo de plat réduite à une carte
 * de 16/9 avec des marges se lit comme une illustration d'article, alors qu'une
 * photo pleine largeur avec le nom dessus se lit comme l'entrée d'un lieu.
 *
 * ── LE VOILE EST UN DÉGRADÉ EN TROIS TEMPS, PAS UN GRIS UNIFORME ──
 *
 * Sombre en haut (le sélecteur de langue doit se lire), clair au milieu (la
 * photo doit se voir, c'est tout ce qu'elle a à faire), sombre en bas (le nom
 * du commerce doit se lire sur n'importe quelle photo, y compris un plat
 * blanc). Un voile uniforme assez sombre pour tenir le nom aurait éteint la
 * photo ; assez clair pour la montrer aurait rendu le nom illisible une fois
 * sur deux.
 *
 * Le commerçant règle son intensité (`hero_voile`), y compris à zéro. Les
 * éléments POSÉS dessus portent donc leur propre fond — voir le sélecteur de
 * langue et le badge : ils restent lisibles même sans voile.
 *
 * ── SANS COUVERTURE, LE HERO EXISTE QUAND MÊME ──
 *
 * Il rend un aplat d'accent très dilué. Une vitrine sans photo doit rester
 * belle — c'est la contrainte du produit depuis VIT-1 — et faire disparaître le
 * hero aurait donné deux mises en page à tenir au lieu d'une.
 */
export function HeroVitrine({
  nom,
  logoUrl,
  couverture,
  couvertureAlt,
  accroche,
  badgeOuverture,
  horaires = null,
  timezone = null,
  lang = "fr",
  allure,
  liens,
  avisGoogle,
  selecteurLangue,
}: {
  nom: string;
  logoUrl: string | null;
  /** Chemin Storage de la couverture (VIT-7), ou `null`. */
  couverture: string | null;
  couvertureAlt: string | null;
  /** L'accroche du commerçant, en sous-titre. */
  accroche: string | null;
  /** « Ouvert · 12h–23h », écrit à la main. `null` retire la pastille. */
  badgeOuverture: string | null;
  /**
   * VIT-31c : la semaine STRUCTURÉE, quand le commerçant l'a saisie.
   *
   * Elle est FACULTATIVE, et son absence est le cas normal : toute vitrine
   * publiée avant ce lot vaut `null` ici, et le hero rend alors exactement ce
   * qu'il rendait — la pastille écrite à la main, sans une ligne de JavaScript
   * de plus. C'est le repli, pas une dégradation.
   */
  horaires?: HorairesVitrine | null;
  /** Le fuseau du COMMERCE. Sans lui, rien ne se calcule : on retombe. */
  timezone?: string | null;
  /** La langue de la page, pour « ferme à » / « closes at ». */
  lang?: LangueVitrine;
  allure: AllureResolue;
  liens: VitrineLiensView;
  avisGoogle: string;
  /** Le lien de changement de langue, posé en haut à droite du hero. */
  selecteurLangue: ReactNode;
}) {
  const cover = sourcesPhotoVitrine(couverture);
  const monogramme = nom.trim().charAt(0).toUpperCase() || "·";
  const carteInfos = allure.carteInfos !== "masquee";

  return (
    <header className="mb-6">
      <div
        style={{ height: "var(--vitrine-hero-h)" }}
        className="relative overflow-hidden bg-[var(--vitrine-accent-10)]"
      >
        {cover ? (
          // `eager` et `fetchPriority="high"` : c'est la première image de la
          // page, celle que le visiteur voit en arrivant, et la retarder ferait
          // clignoter le haut de l'écran. La hauteur est réservée par le
          // conteneur, donc rien ne saute quand elle se pose.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover.grande}
            srcSet={srcSetPhotoVitrine(couverture)}
            sizes="(max-width: 480px) 100vw, 480px"
            alt={altPhotoVitrine(couvertureAlt)}
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 size-full object-cover"
          />
        ) : null}

        {/* `pointer-events-none` : le voile couvre toute la surface, et sans
            cela il intercepterait le doigt du visiteur avant le sélecteur de
            langue qui se trouve dessous dans l'ordre de pile. */}
        <div
          aria-hidden
          style={{ background: "var(--vitrine-voile)" }}
          className="pointer-events-none absolute inset-0"
        />

        {/* LE SÉLECTEUR DE LANGUE PORTE SON PROPRE FOND. Le voile est réglable
            jusqu'à zéro : du blanc sur une photo claire serait alors illisible,
            et c'est le seul CONTRÔLE du hero — le rendre inatteignable enferme
            le visiteur étranger sur une page qu'il ne lit pas. */}
        <div className="absolute right-3 top-3 z-10">{selecteurLangue}</div>

        <div
          style={{ bottom: "var(--vitrine-hero-bas)" }}
          className="absolute inset-x-0 px-5 text-center"
        >
          {logoUrl ? (
            // Le logo DÉJÀ RÉGLÉ par le commerçant (`organizations.logo_url`) :
            // aucune seconde identité à tenir d'accord avec celle de la roue.
            // `<img>` nu et non `next/image`, comme les dix autres parcours
            // joueur : l'URL vient d'un bucket dont l'hôte n'est pas déclaré
            // dans `remotePatterns`, et l'optimiseur refuserait de la servir.
            // `alt=""` — le nom est juste en dessous, en toutes lettres.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              width={56}
              height={56}
              className="mx-auto mb-2 size-14 rounded-full border border-white/30 bg-white object-cover"
            />
          ) : (
            // LE MONOGRAMME NE REMPLACE PAS LE LOGO, il comble son absence —
            // et il est `aria-hidden` : il ne répète que la première lettre
            // d'un nom écrit en toutes lettres juste en dessous.
            <p
              aria-hidden
              className="text-[10px] font-semibold uppercase leading-none tracking-[0.34em] text-white/70"
            >
              {monogramme}
            </p>
          )}

          <h1
            style={{ fontSize: "var(--vitrine-hero-nom)" }}
            className="mt-2 font-[family-name:var(--vitrine-titre)] font-normal leading-none text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.35)]"
          >
            {nom}
          </h1>

          <div aria-hidden className="mx-auto mt-3 h-px w-[52px] bg-white/50" />

          {accroche ? (
            // `line-clamp-2` : l'accroche va jusqu'à 200 caractères, et une
            // phrase longue en capitales très espacées mangerait le hero
            // entier. Elle est tronquée à l'œil, jamais en base.
            <p className="mx-auto mt-3 line-clamp-2 max-w-[36ch] text-[8px] font-medium uppercase leading-[1.5] tracking-[0.26em] text-white/80">
              {accroche}
            </p>
          ) : null}

          {/* LA PASTILLE CALCULÉE NE PREND LA PLACE DE L'AUTRE QUE SI ELLE A
              DE QUOI (VIT-31c). Sans horaires structurés ou sans fuseau, on
              rend le `<p>` d'avant, au serveur, sans frontière client : une
              vitrine qui n'a rien saisi ne doit pas payer un composant client
              pour afficher la phrase qu'elle affichait déjà. */}
          {horaires && timezone ? (
            <PastilleHoraires
              horaires={horaires}
              timezone={timezone}
              repli={badgeOuverture}
              lang={lang}
            />
          ) : badgeOuverture ? (
            <PastilleOuverture texte={badgeOuverture} />
          ) : null}
        </div>
      </div>

      {carteInfos ? (
        <CarteInfos liens={liens} avisGoogle={avisGoogle} />
      ) : null}
    </header>
  );
}

/**
 * LA CARTE D'INFOS — les liens sortants, remontés sous le hero.
 *
 * ── ELLE CHEVAUCHE LA PHOTO, ET C'EST CE QUI L'ANCRE ──
 *
 * `--vitrine-infos-mt` vaut `-38px` par défaut : la carte mord sur le bas du
 * hero. C'est ce qui fait lire le hero et la carte comme un seul objet plutôt
 * que comme deux bandes empilées. Le commerçant peut la poser dessous, ou la
 * masquer — auquel cas la page rend les liens dans le bloc « Nous suivre »,
 * comme avant.
 *
 * ── « AVIS GOOGLE » EST NEUTRE, ET C'EST UNE OBLIGATION ──
 *
 * Le libellé dit où mène le lien, il ne demande rien : ni « laissez-nous 5
 * étoiles », ni « aidez-nous ». Solliciter un avis positif depuis la page que
 * le client consulte pendant son repas est précisément ce que les plateformes
 * d'avis interdisent, et ce qui rend un lieu suspect quand cela se voit.
 *
 * « Instagram » et « TikTok » sont des NOMS PROPRES et ne se traduisent pas.
 * Leurs pastilles portent une abréviation VISIBLE et un nom ACCESSIBLE complet :
 * « IG » se lit à l'œil, mais s'entend « i g » au lecteur d'écran.
 */
function CarteInfos({
  liens,
  avisGoogle,
}: {
  liens: VitrineLiensView;
  avisGoogle: string;
}) {
  const reseaux = [
    { href: liens.instagram_url, court: "IG", nom: "Instagram" },
    { href: liens.tiktok_url, court: "TT", nom: "TikTok" },
  ].filter((e): e is { href: string; court: string; nom: string } =>
    Boolean(e.href?.trim()),
  );
  const avis = liens.google_review_url?.trim() ? liens.google_review_url : null;

  // La base rend `''` pour un lien non renseigné et non `null` — « c'est
  // l'écran qui décide de ne rien afficher ». Rien à afficher : rien du tout,
  // et surtout pas une carte vide qui chevaucherait la photo pour ne rien dire.
  if (reseaux.length === 0 && !avis) return null;

  return (
    <div
      style={{
        marginTop: "var(--vitrine-infos-mt)",
        borderRadius: "var(--vitrine-rad)",
        background: "var(--vitrine-carte-fond)",
        boxShadow: "var(--vitrine-ombre)",
      }}
      className="relative z-[2] mx-3 flex items-center gap-2 p-[13px]"
    >
      {reseaux.length > 0 ? (
        <ul className="flex gap-[7px]">
          {reseaux.map((r) => (
            <li key={r.nom}>
              <a
                href={r.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={r.nom}
                className="flex size-[34px] items-center justify-center rounded-full bg-[var(--vitrine-accent-10)] text-[10.5px] font-semibold text-[var(--vitrine-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vitrine-primary)]"
              >
                <span aria-hidden>{r.court}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {avis ? (
        <a
          href={avis}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex h-[34px] min-w-0 flex-1 items-center justify-center gap-[7px] whitespace-nowrap rounded-full border-[1.5px] border-[var(--vitrine-primary)] px-3 text-[11px] font-semibold text-[var(--vitrine-primary)]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vitrine-primary)]",
          )}
        >
          <span aria-hidden>★</span>
          {avisGoogle}
        </a>
      ) : null}
    </div>
  );
}

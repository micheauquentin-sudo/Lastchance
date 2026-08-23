import { cn } from "@/lib/utils";
import { PorteVitrine } from "@/components/vitrine/porte-vitrine";
import type { ActionVitrine } from "@/lib/vitrine";
import {
  altPhotoVitrine,
  sourcesPhotoVitrine,
  srcSetPhotoVitrine,
} from "@/lib/vitrine-photo";
import {
  libelleAllergene,
  libelleBadge,
  type LangueVitrine,
  type StyleCartesVitrine,
  type VitrineFicheView,
} from "@/lib/vitrine";
import { TEXTES_VITRINE } from "@/components/vitrine/langue";

/**
 * UNE FICHE DE CARTE — un plat, une boisson, une prestation.
 *
 * ── CE LOT NE MONTE AUCUNE PHOTO, ET LA FICHE DOIT ÊTRE BELLE QUAND MÊME ──
 *
 * C'est la contrainte de départ, pas un repli : la référence du marché publie
 * une « carte sans photos » à côté de ses cartes illustrées, et c'est souvent
 * celle qu'un restaurateur garde. Ce qui tient une carte sans images, c'est la
 * TYPOGRAPHIE : un nom en police de titre, un prix aligné à droite, et un filet
 * pointillé entre les deux qui fait lire la ligne d'un bout à l'autre — la
 * mise en page d'un menu imprimé, pas celle d'une liste de produits.
 *
 * Le seul « placeholder » est un MONOGRAMME, et seulement dans les styles
 * `grille` et `magazine`, où la mise en page réserve une place visuelle qui
 * serait autrement un trou. Il est en couleur d'accent très diluée : il occupe
 * l'espace sans jamais prétendre être une image. En style `liste`, il n'y a
 * aucune place à combler, donc aucun monogramme — un carré gris par ligne
 * serait exactement le bruit que le mot « discret » exclut.
 *
 * ── L'INDISPONIBLE EST GRISÉ, JAMAIS RETIRÉ ──
 *
 * La base rend délibérément les fiches indisponibles avec leur drapeau : « la
 * retirer ferait disparaître un plat de la carte au lieu de le montrer épuisé ».
 * L'opacité seule ne suffirait pas — elle ne se lit pas au lecteur d'écran et
 * pas du tout en plein soleil sur un téléphone — d'où la mention textuelle, qui
 * est la vraie information.
 *
 * ── LES ALLERGÈNES SONT REPLIÉS, ET C'EST UN `<details>` ──
 *
 * Quatorze valeurs possibles sur chaque ligne noieraient la carte ; les cacher
 * serait pire, c'est le seul champ où se tromper compte vraiment. Un `<details>`
 * natif règle les deux : replié par défaut, ouvrable au clic ET au clavier,
 * annoncé comme un groupe par les lecteurs d'écran, et il fonctionne même si
 * aucun JavaScript ne s'exécute.
 *
 * ── DEUX LANGUES, DEUX ORIGINES ──
 *
 * `fiche.nom` et `fiche.description` arrivent DÉJÀ dans la langue servie : le
 * SQL a superposé le calque de traduction champ par champ, avec repli français
 * pour ce qui manque ou a vieilli. Les BADGES et les ALLERGÈNES, eux, sont du
 * vocabulaire de plateforme et se traduisent ici (`@/components/vitrine/langue`)
 * — les faire passer par le calque aurait fait traduire « Gluten » une fois par
 * commerçant.
 */
export function FicheVitrine({
  fiche,
  styleCartes,
  lang,
  portesOuvertes,
}: {
  fiche: VitrineFicheView;
  styleCartes: StyleCartesVitrine;
  lang: LangueVitrine;
  /**
   * VIT-10 : les modules qui ont vraiment quelque chose d'ouvert.
   *
   * Un tableau et non un prédicat — voir `catalogue-vitrine.tsx` : une
   * fonction ne traverse pas la frontière serveur → client.
   */
  portesOuvertes: readonly ActionVitrine[];
}) {
  const t = TEXTES_VITRINE[lang];
  const indisponible = !fiche.disponible;
  const monogramme = styleCartes !== "liste";
  const photo = sourcesPhotoVitrine(fiche.photo_path);
  const magazine = styleCartes === "magazine";
  const titreId = `fiche-titre-${fiche.id}`;

  return (
    <article
      /**
       * L'ANCRE STABLE DE LA FICHE — ce que vise un QR contextuel.
       *
       * `#fiche-{id}` N'ATTEINT JAMAIS LE SERVEUR : un fragment n'est pas
       * envoyé dans la requête HTTP. Le QR imprimé sur un chevalet pointe donc
       * sur la MÊME url mise en cache que tous les autres — aucune entrée de
       * cache ISR supplémentaire, aucun basculement en rendu dynamique, ce
       * qu'un `?fiche=…` aurait provoqué. C'est `catalogue-vitrine.tsx` qui lit
       * le fragment à l'ouverture, sélectionne la bonne carte et défile.
       *
       * L'identifiant du TITRE porte donc désormais `fiche-titre-…` : deux
       * éléments ne peuvent pas partager un `id`, et c'est l'article — la fiche
       * entière — qui est la cible d'un défilement.
       */
      id={`fiche-${fiche.id}`}
      aria-labelledby={titreId}
      className={cn(
        "scroll-mt-4 rounded-2xl border border-black/10 bg-white/70 p-4",
        magazine && "p-5",
        // `opacity` sur le conteneur ET une mention en clair : le gris seul
        // n'est pas une information.
        indisponible && "opacity-70",
      )}
    >
      <div className={cn(magazine ? "space-y-3" : "space-y-2")}>
        {/* LA PHOTO PREND LA PLACE DU MONOGRAMME, elle ne s'y ajoute pas :
            l'initiale existe précisément pour tenir la mise en page quand il
            n'y a pas d'image. Les deux ensemble auraient donné deux objets
            décoratifs empilés au-dessus du nom. */}
        {photo ? (
          <PhotoFiche
            chemin={fiche.photo_path}
            photo={photo}
            alt={altPhotoVitrine(fiche.photo_alt)}
            grand={magazine}
          />
        ) : monogramme ? (
          <Monogramme nom={fiche.nom} grand={magazine} />
        ) : null}

        {/* NOM ── FILET ── PRIX. Le filet est `aria-hidden` : il fait lire la
            ligne à l'œil, il n'a rien à dire à l'oreille. */}
        <div className="flex items-baseline gap-2">
          <h3
            id={titreId}
            className={cn(
              "font-[family-name:var(--vitrine-titre)] font-bold leading-tight text-[var(--vitrine-sur-secondary)]",
              magazine ? "text-xl" : "text-base",
            )}
          >
            {fiche.nom}
          </h3>
          {fiche.prix_affiche ? (
            <>
              <span
                aria-hidden
                className="min-w-4 flex-1 translate-y-[-0.2em] border-b border-dotted border-current opacity-30"
              />
              <p className="shrink-0 font-bold tabular-nums text-[var(--vitrine-primary)]">
                {fiche.prix_affiche}
              </p>
            </>
          ) : null}
        </div>

        {fiche.description ? (
          <p
            className={cn(
              "font-[family-name:var(--vitrine-texte)] leading-relaxed text-[var(--vitrine-sur-secondary)]/80",
              magazine ? "text-base" : "text-sm",
            )}
          >
            {fiche.description}
          </p>
        ) : null}

        {indisponible ? (
          <p className="text-sm font-semibold text-[var(--vitrine-sur-secondary)]">
            {t.indisponible}
          </p>
        ) : null}

        {fiche.badges.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {fiche.badges.map((badge) => (
              <li
                key={badge}
                className="rounded-full border border-[var(--vitrine-primary)]/25 px-2 py-0.5 text-xs font-semibold text-[var(--vitrine-primary)]"
              >
                {libelleBadge(badge, lang)}
              </li>
            ))}
          </ul>
        ) : null}

        {/* LA PORTE, SOUS LA FICHE ET APRÈS LES BADGES : elle vient après ce
            qui décrit le plat, jamais avant. Une fiche indisponible n'en porte
            pas — proposer de réserver ce que la cuisine n'a plus serait la
            seule chose pire que de ne rien proposer. */}
        {!indisponible && fiche.action ? (
          <PorteVitrine
            action={fiche.action}
            ouverte={portesOuvertes.includes(fiche.action)}
          />
        ) : null}

        {fiche.allergenes.length > 0 ? (
          <details className="group">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md text-xs font-semibold text-[var(--vitrine-sur-secondary)]/70 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vitrine-primary)]">
              {t.allergenes}
              <span aria-hidden className="transition-transform group-open:rotate-180">
                ⌄
              </span>
            </summary>
            <p className="mt-1 text-xs leading-relaxed text-[var(--vitrine-sur-secondary)]/80">
              {fiche.allergenes
                .map((allergene) => libelleAllergene(allergene, lang))
                .join(" · ")}
            </p>
          </details>
        ) : null}
      </div>
    </article>
  );
}

/**
 * Le monogramme : première lettre du nom, en accent très dilué.
 *
 * `aria-hidden` — il ne répète que la première lettre d'un titre déjà lu juste
 * en dessous, et l'annoncer ferait entendre « T, Tarte aux pommes ».
 */
function Monogramme({ nom, grand }: { nom: string; grand: boolean }) {
  const lettre = nom.trim().charAt(0).toUpperCase() || "·";
  return (
    <div
      aria-hidden
      className={cn(
        "flex items-center justify-center rounded-xl bg-[var(--vitrine-primary)]/10 font-[family-name:var(--vitrine-titre)] font-bold text-[var(--vitrine-primary)]/25",
        grand ? "h-28 text-5xl" : "h-16 text-3xl",
      )}
    >
      {lettre}
    </div>
  );
}

/**
 * La photo d'une fiche — deux sources, et la petite d'abord pour un téléphone.
 *
 * `loading="lazy"` et `decoding="async"` : une carte de soixante plats porte
 * soixante images, dont deux sont visibles au chargement. Les charger toutes
 * d'un coup ferait payer au visiteur la carte entière pour lire l'entrée.
 *
 * `aspect-[4/3]` avec `object-cover` : le cadre est STABLE avant même que
 * l'image n'arrive, donc la page ne saute pas sous le pouce au moment où elle
 * se pose. Le recadrage est celui du navigateur, centré — le serveur, lui, ne
 * recadre jamais : il réduit, et n'ampute aucun plat d'autorité.
 */
function PhotoFiche({
  chemin,
  photo,
  alt,
  grand,
}: {
  chemin: string | null;
  photo: { grande: string; mobile: string };
  alt: string;
  grand: boolean;
}) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- Storage public, hors
       du domaine servi par l'optimiseur : `next/image` exigerait de déclarer le
       hôte distant pour un gain nul sur un webp déjà dimensionné par le serveur. */
    <img
      src={photo.grande}
      srcSet={srcSetPhotoVitrine(chemin)}
      sizes="(max-width: 640px) 100vw, 480px"
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn(
        "w-full rounded-xl border border-black/10 object-cover",
        grand ? "aspect-[4/3]" : "aspect-[16/9]",
      )}
    />
  );
}

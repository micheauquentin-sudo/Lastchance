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
import type { AllureResolue } from "@/components/vitrine/theme";
import { textesVitrine } from "@/components/vitrine/langue";
import type { SecteurVitrine } from "@/lib/vitrine";

/**
 * UNE FICHE DE CARTE — un plat, une coupe, un bouquet, une chambre, un soin.
 *
 * ── LA FICHE DOIT ÊTRE BELLE SANS PHOTO ──
 *
 * C'est la contrainte de départ, pas un repli : la référence du marché publie
 * une « carte sans photos » à côté de ses cartes illustrées, et c'est souvent
 * celle qu'un commerçant garde. Ce qui tient une carte sans images, c'est la
 * TYPOGRAPHIE : un nom en couleur d'accent, une description sobre, un prix qui
 * se détache. Le monogramme ne comble un vide que là où la mise en page en
 * réserve un.
 *
 * ── TROIS STYLES DE PRIX, ET LE PREMIER EST L'ANCIENNE CARTE (VIT-13) ──
 *
 * `simple` garde la ligne « NOM ── filet pointillé ── PRIX » : la mise en page
 * d'un menu imprimé, celle que cette fiche rendait avant l'allure. Elle n'a pas
 * été retirée, elle est devenue un CHOIX — c'est le seul des trois qui fasse
 * lire la ligne d'un bout à l'autre, et une carte de vins sans photo ne
 * ressemble à rien d'autre.
 *
 * `accent` (le défaut) et `pastille` posent le prix SOUS la description, comme
 * la maquette de référence : dès qu'il y a une photo latérale, le filet n'a
 * plus la largeur qu'il lui faut pour relier quoi que ce soit.
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
 * vocabulaire de plateforme et se traduisent ici.
 */
export function FicheVitrine({
  fiche,
  styleCartes,
  lang,
  secteur,
  allure,
  portesOuvertes,
  favori,
  onBasculerFavori,
}: {
  fiche: VitrineFicheView;
  styleCartes: StyleCartesVitrine;
  lang: LangueVitrine;
  secteur: SecteurVitrine;
  allure: AllureResolue;
  /**
   * VIT-10 : les modules qui ont vraiment quelque chose d'ouvert.
   *
   * Un tableau et non un prédicat — voir `catalogue-vitrine.tsx` : une
   * fonction ne traverse pas la frontière serveur → client.
   */
  portesOuvertes: readonly ActionVitrine[];
  favori: boolean;
  /**
   * `null` quand les favoris sont éteints par l'allure. Un booléen séparé
   * aurait laissé passer l'état « allumé mais sans gestionnaire », c'est-à-dire
   * un cœur qui ne fait rien.
   */
  onBasculerFavori: ((id: string) => void) | null;
}) {
  const t = textesVitrine(lang, secteur);
  const indisponible = !fiche.disponible;
  const magazine = styleCartes === "magazine";
  const titreId = `fiche-titre-${fiche.id}`;

  const photo =
    allure.photoTaille === "sans" ? null : sourcesPhotoVitrine(fiche.photo_path);
  // Le monogramme ne comble QUE le vide laissé par une photo attendue. En style
  // `liste` sans photo, il n'y a aucune place à combler : un carré par ligne
  // serait exactement le bruit que « discret » exclut.
  const monogramme =
    !photo &&
    allure.monogramme &&
    allure.photoTaille !== "sans" &&
    (styleCartes !== "liste" || allure.photoPosition === "pleine");

  const prixEnLigne = allure.stylePrix === "simple" && Boolean(fiche.prix_affiche);
  const prixDessous = allure.stylePrix !== "simple" && Boolean(fiche.prix_affiche);
  const coeur = onBasculerFavori !== null && !indisponible;

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
       */
      id={`fiche-${fiche.id}`}
      aria-labelledby={titreId}
      style={{
        background: "var(--vitrine-carte-fond)",
        borderWidth: "var(--vitrine-carte-bord)",
        boxShadow: "var(--vitrine-carte-ombre)",
        borderRadius: "var(--vitrine-rad)",
        padding: "var(--vitrine-pad)",
        flexDirection: "var(--vitrine-carte-flex)" as never,
      }}
      className={cn(
        "scroll-mt-4 flex gap-3 overflow-hidden border-solid border-[var(--vitrine-accent-25)]",
        // `items-start` : la photo se cale en haut de la fiche, pas au milieu.
        // Centrée, elle flotterait au milieu d'une description longue.
        "items-start",
        // `opacity` sur le conteneur ET une mention en clair : le gris seul
        // n'est pas une information.
        indisponible && "opacity-70",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline gap-2">
          <h3
            id={titreId}
            style={{
              textTransform: "var(--vitrine-caps)" as never,
              fontSize: `calc(${magazine ? 19 : 15}px * var(--vitrine-fsx))`,
            }}
            className="min-w-0 flex-1 font-[family-name:var(--vitrine-titre)] font-bold leading-tight tracking-[0.02em] text-[var(--vitrine-primary)]"
          >
            {fiche.nom}
          </h3>

          {/* LE PRIX « SIMPLE » — l'ancienne mise en page, conservée. Le filet
              est `aria-hidden` : il fait lire la ligne à l'œil, il n'a rien à
              dire à l'oreille. */}
          {prixEnLigne ? (
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

          {/* LE CŒUR EN LIGNE — seulement là où aucune photo ne peut le
              porter. Sur une photo, il est posé DANS l'image, comme la
              maquette : deux cœurs à deux endroits selon la fiche feraient
              chercher le geste. */}
          {coeur && !photo ? (
            <BoutonFavori
              actif={favori}
              nom={fiche.nom}
              lang={lang}
              onBasculer={() => onBasculerFavori(fiche.id)}
              className="size-[30px] shrink-0 rounded-full border border-[var(--vitrine-accent-25)]"
            />
          ) : null}
        </div>

        {fiche.badges.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {fiche.badges.map((badge) => (
              <li
                key={badge}
                className="rounded-full bg-[var(--vitrine-accent-10)] px-2 py-0.5 text-[8.5px] font-semibold uppercase leading-[1.3] tracking-[0.08em] text-[var(--vitrine-primary)]"
              >
                {libelleBadge(badge, lang)}
              </li>
            ))}
          </ul>
        ) : null}

        {fiche.description ? (
          <p
            style={{
              textTransform: "var(--vitrine-caps-desc)" as never,
              fontSize: `calc(${magazine ? 13 : 11.5}px * var(--vitrine-fsx))`,
            }}
            className="font-[family-name:var(--vitrine-texte)] leading-[1.55] text-[var(--vitrine-sur-secondary)]/85 text-pretty"
          >
            {fiche.description}
          </p>
        ) : null}

        {indisponible ? (
          <p className="text-sm font-semibold text-[var(--vitrine-sur-secondary)]">
            {t.indisponible}
          </p>
        ) : null}

        {prixDessous ? <Prix valeur={fiche.prix_affiche!} allure={allure} /> : null}

        {/* LA PORTE, SOUS LA FICHE ET APRÈS LE PRIX : elle vient après ce qui
            décrit et chiffre la prestation, jamais avant. Une fiche
            indisponible n'en porte pas — proposer de réserver ce que la cuisine
            n'a plus serait la seule chose pire que de ne rien proposer. */}
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

      {photo ? (
        <div
          style={{
            width: "var(--vitrine-photo-l)",
            height: "var(--vitrine-photo-h)",
            borderRadius: "var(--vitrine-rad-photo)",
            background: "var(--vitrine-accent-08)",
          }}
          className="relative shrink-0 overflow-hidden"
        >
          <PhotoFiche
            chemin={fiche.photo_path}
            photo={photo}
            alt={altPhotoVitrine(fiche.photo_alt)}
          />
          {coeur ? (
            <BoutonFavori
              actif={favori}
              nom={fiche.nom}
              lang={lang}
              onBasculer={() => onBasculerFavori(fiche.id)}
              className="absolute right-[7px] top-[7px] size-[30px] rounded-full bg-white/95 shadow-[0_2px_8px_rgba(0,0,0,0.18)]"
            />
          ) : null}
        </div>
      ) : monogramme ? (
        <Monogramme nom={fiche.nom} />
      ) : null}
    </article>
  );
}

/**
 * LE PRIX, SOUS LA DESCRIPTION — deux styles.
 *
 * `tabular-nums` dans les deux : une colonne de prix dont les chiffres n'ont
 * pas la même largeur se lit de travers, et c'est la seule information de la
 * fiche qu'on compare d'une ligne à l'autre.
 */
function Prix({ valeur, allure }: { valeur: string; allure: AllureResolue }) {
  if (allure.stylePrix === "pastille") {
    return (
      <p
        style={{ fontSize: "calc(12.5px * var(--vitrine-fsx))" }}
        className="mt-0.5 self-start rounded-full bg-[var(--vitrine-primary)] px-3 py-1.5 font-semibold tabular-nums leading-none text-[var(--vitrine-sur-primary)]"
      >
        {valeur}
      </p>
    );
  }
  return (
    <p
      style={{ fontSize: "calc(16px * var(--vitrine-fsx))" }}
      className="mt-0.5 font-bold tabular-nums leading-none text-[var(--vitrine-primary)]"
    >
      {valeur}
    </p>
  );
}

/**
 * LE CŒUR.
 *
 * ── LE NOM DE LA FICHE EST DANS L'ÉTIQUETTE, ET C'EST OBLIGATOIRE ──
 *
 * Une carte porte trente boutons identiques. « Ajouter aux favoris », répété
 * trente fois, ne dit rien à un lecteur d'écran qui parcourt les contrôles :
 * l'étiquette doit nommer CE plat. `aria-pressed` porte l'état, ce qui évite
 * d'avoir à changer le libellé selon qu'il est mis ou retiré — le lecteur
 * annonce « activé » tout seul.
 *
 * Le glyphe est `aria-hidden` : un cœur plein et un cœur vide se prononcent de
 * la même façon, et l'état est déjà dit.
 */
function BoutonFavori({
  actif,
  nom,
  lang,
  onBasculer,
  className,
}: {
  actif: boolean;
  nom: string;
  lang: LangueVitrine;
  onBasculer: () => void;
  className?: string;
}) {
  const etiquette = lang === "en" ? `Favourite: ${nom}` : `Favori : ${nom}`;
  return (
    <button
      type="button"
      onClick={onBasculer}
      aria-pressed={actif}
      aria-label={etiquette}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center p-0 text-[14px] leading-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vitrine-primary)]",
        className,
      )}
    >
      <span aria-hidden className={actif ? "text-[var(--vitrine-primary)]" : "text-[#b9b3ab]"}>
        {actif ? "♥" : "♡"}
      </span>
    </button>
  );
}

/**
 * Le monogramme : première lettre du nom, en accent très dilué.
 *
 * `aria-hidden` — il ne répète que la première lettre d'un titre déjà lu juste
 * à côté, et l'annoncer ferait entendre « T, Tarte aux pommes ».
 */
function Monogramme({ nom }: { nom: string }) {
  const lettre = nom.trim().charAt(0).toUpperCase() || "·";
  return (
    <div
      aria-hidden
      style={{
        width: "var(--vitrine-photo-l)",
        height: "var(--vitrine-photo-h)",
        borderRadius: "var(--vitrine-rad-photo)",
        background: "var(--vitrine-accent-10)",
      }}
      className="flex shrink-0 items-center justify-center font-[family-name:var(--vitrine-titre)] text-3xl font-bold text-[var(--vitrine-accent-25)]"
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
 * Le CADRE est posé par le parent (`--vitrine-photo-l/h`) et l'image le remplit
 * en `object-cover` : la page ne saute donc pas sous le pouce au moment où
 * l'image se pose. Le recadrage est celui du navigateur, centré — le serveur,
 * lui, ne recadre jamais : il réduit, et n'ampute aucun plat d'autorité.
 *
 * `sizes` annonce la largeur RÉELLE la plus grande qu'occupe cette image : en
 * pleine largeur elle fait toute la carte, sinon 152 px au maximum
 * (`PHOTO_LATERALE.grande`). Annoncer `100vw` dans les deux cas aurait fait
 * télécharger la grande source pour une vignette de 88 px.
 */
function PhotoFiche({
  chemin,
  photo,
  alt,
}: {
  chemin: string | null;
  photo: { grande: string; mobile: string };
  alt: string;
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
      className="size-full object-cover"
    />
  );
}

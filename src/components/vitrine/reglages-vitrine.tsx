"use client";

import { useState } from "react";
import { FONT_LIST } from "@/lib/fonts";
import type { ActionResult } from "@/lib/utils";
import { useActionForm } from "@/lib/use-action-form";
import {
  VITRINE_ACCROCHE_MAX,

  VITRINE_HISTOIRE_MAX,
  VITRINE_HORAIRES_MAX,
  VITRINE_BLOCS,
  VITRINE_SLUG_MAX,
  VITRINE_SLUG_MIN,
  VITRINE_STYLES_CARTES,
  VITRINE_SECTEURS,
  VITRINE_BADGE_OUVERTURE_MAX,

  cheminVitrine,
  estSlugVitrineReserve,
  formeSlugVitrineValide,
  libelleBloc,
  libelleSecteur,
  libelleStyleCartes,
  normaliserSlugVitrine,
  urlVitrine,
  type BlocVitrine,
  type VitrineSettingsView,
} from "@/lib/vitrine";
import {
  publishVitrine,
  saveVitrineSettings,
  setVitrineSlug,
  unpublishVitrine,
} from "@/actions/vitrine";
import { Button } from "@/components/ui/button";
import { PhotoChamp } from "@/components/vitrine/photo-champ";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { resoudreThemeVitrine } from "@/components/vitrine/theme";
import { AllureEditeur } from "@/components/vitrine/allure-editeur";

/**
 * `publishVitrine` et `unpublishVitrine` NE PRENNENT AUCUNE ENTRÉE — l'objet
 * publié est celui de la session, et rien d'autre n'est décidable. Elles ne
 * portent donc pas la signature `(prev, formData)` d'`useActionForm`, d'où ces
 * deux adaptateurs : le formulaire reste un vrai `<form>` (donc un bouton
 * soumettable au clavier, et un état de chargement partagé), sans qu'aucun
 * champ n'ait à être inventé pour satisfaire une signature.
 *
 * ── ELLES RECHARGENT ──
 *
 * La publication est l'état que la surface PUBLIQUE lit aussitôt. C'est la
 * famille de `use-action-form-bascule` : sans rechargement, un
 * rafraîchissement manqué laisse « Non publiée » à l'écran sur une vitrine
 * en ligne — et le bouton suivant repart de la même prop périmée.
 */
const publierAction = (): Promise<ActionResult<{ published: boolean }>> =>
  publishVitrine();

const depublierAction = (): Promise<ActionResult<{ published: boolean }>> =>
  unpublishVitrine();

const textareaClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

/**
 * LES RÉGLAGES DE LA VITRINE : l'adresse, l'identité, le thème, la publication.
 *
 * ── L'ADRESSE EST LE PREMIER PAS, ET ELLE EST SEULE SUR SON FORMULAIRE ──
 *
 * `vitrine_dashboard_state` rend `settings = null` — et non un objet vide —
 * tant qu'aucune adresse n'a été choisie, précisément pour que l'écran rende
 * « choisissez votre adresse » plutôt qu'un formulaire complet qui laisserait
 * croire qu'il suffit d'enregistrer. Cet écran suit cette décision : sans
 * adresse, il n'y a rien d'autre à régler.
 *
 * Elle reste ensuite sur SON formulaire, parce qu'elle n'est pas un champ comme
 * les autres : la changer casse les QR déjà imprimés, et `set_vitrine_slug`
 * l'inscrit au journal d'audit. Un « Enregistrer » commun l'aurait fait changer
 * en même temps qu'une virgule dans l'histoire du lieu.
 */
export function ReglagesVitrine({
  settings,
  appUrl,
  peutEditer,
  peutPublier,
}: {
  settings: VitrineSettingsView | null;
  appUrl: string;
  /** Préparer : créer et modifier, sans jamais exposer (cahier §3). */
  peutEditer: boolean;
  /** Rendre la vitrine atteignable. Payant, toujours. */
  peutPublier: boolean;
}) {
  return (
    <div className="space-y-6">
      <AdresseForm
        slug={settings?.slug ?? null}
        appUrl={appUrl}
        peutEditer={peutEditer}
      />
      {settings ? (
        <>
          <IdentiteEtThemeForm settings={settings} peutEditer={peutEditer} />
          <PublicationCard
            settings={settings}
            appUrl={appUrl}
            peutPublier={peutPublier}
          />
        </>
      ) : null}
    </div>
  );
}


function AdresseForm({
  slug,
  appUrl,
  peutEditer,
}: {
  slug: string | null;
  appUrl: string;
  peutEditer: boolean;
}) {
  const [saisie, setSaisie] = useState(slug ?? "");
  const { state, pending, onSubmit } = useActionForm(setVitrineSlug, {
    networkError: "Enregistrement impossible, réessayez.",
  });

  const normalise = normaliserSlugVitrine(saisie);
  // MÊME FORME QUE LE `check` DE LA TABLE et que la RPC : trois refus distincts
  // existent côté serveur (forme, vocabulaire réservé, adresse prise) et seul
  // le premier est vérifiable ici. Les deux autres sont RENDUS PAR L'ACTION —
  // les deviner côté client aurait produit un second jeu de règles à tenir
  // d'accord avec la base.
  const formeValide = formeSlugVitrineValide(normalise);
  const reserve = formeValide && estSlugVitrineReserve(normalise);

  return (
    <Card>
      <h2>Adresse publique</h2>
      <p className="mb-4 mt-2 text-sm text-zinc-500">
        C&apos;est l&apos;adresse imprimée sur vos QR codes. La changer plus tard
        rendra muets les QR déjà posés — choisissez-la comme un nom d&apos;enseigne.
      </p>

      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="vitrine-slug">Adresse</Label>
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="shrink-0 text-sm font-semibold text-zinc-500"
            >
              /v/
            </span>
            <Input
              id="vitrine-slug"
              name="slug"
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              required
              minLength={VITRINE_SLUG_MIN}
              maxLength={VITRINE_SLUG_MAX}
              disabled={!peutEditer}
              placeholder="le-comptoir-du-marche"
              aria-describedby="vitrine-slug-aide"
            />
          </div>
          <p id="vitrine-slug-aide" className="mt-2 text-sm text-zinc-500">
            Lettres sans accent, chiffres et tirets, de 3 à 60 caractères.
            {normalise && formeValide ? (
              <>
                {" "}
                Votre vitrine sera à l&apos;adresse{" "}
                <span className="font-semibold text-k-ink">
                  {urlVitrine(normalise, appUrl)}
                </span>
                .
              </>
            ) : null}
          </p>
          {/* DEUX REFUS DITS AVANT LE CLIC, et un troisième que seul le serveur
              connaît. La forme et le vocabulaire réservé se vérifient ici — la
              liste vient de `@/lib/vitrine`, miroir de `is_reserved_vitrine_slug`.
              « Adresse déjà prise » exige de connaître les autres commerces :
              elle reste au serveur, qui la rend en clair. */}
          {normalise && !formeValide ? (
            <p className="mt-2 text-sm font-semibold text-red-600">
              Cette adresse contient des caractères qui ne passent pas : accents,
              espaces ou ponctuation.
            </p>
          ) : null}
          {reserve ? (
            <p className="mt-2 text-sm font-semibold text-red-600">
              Cette adresse est réservée par la plateforme. Choisissez-en une
              autre — par exemple le nom de votre enseigne.
            </p>
          ) : null}
        </div>

        {state && !state.ok ? <FieldError message={state.error} /> : null}
        {state?.ok ? (
          <p className="text-sm font-semibold text-green-700">Adresse enregistrée.</p>
        ) : null}

        {peutEditer ? (
          <Button type="submit" disabled={pending || !formeValide || reserve}>
            {pending
              ? "Enregistrement…"
              : slug
                ? "Changer l'adresse"
                : "Choisir cette adresse"}
          </Button>
        ) : null}
      </form>
    </Card>
  );
}

function IdentiteEtThemeForm({
  settings,
  peutEditer,
}: {
  settings: VitrineSettingsView;
  peutEditer: boolean;
}) {
  const theme = resoudreThemeVitrine(settings.theme, settings.secteur);
  const { state, pending, onSubmit } = useActionForm(saveVitrineSettings, {
    networkError: "Enregistrement impossible, réessayez.",
    toastOnSuccess: "Enregistré.",
  });

  /**
   * L'ORDRE DES BLOCS, ET CE QU'ON MONTRE.
   *
   * `ordre_blocs` est une permutation PARTIELLE : masquer un bloc, c'est
   * l'omettre. Deux contrôles séparés — une case « afficher » et deux flèches —
   * disent exactement cela, là où une liste réordonnable seule aurait laissé le
   * commerçant chercher comment retirer « Notre histoire » qu'il n'a pas écrite.
   *
   * L'état est LOCAL et part dans un champ caché à l'enregistrement : ce n'est
   * pas un geste isolé comme le réordonnancement d'une carte, c'est un brouillon
   * de formulaire. Aucun aller-retour par flèche, donc aucun ordre optimiste à
   * faire périmer.
   */
  const [blocs, setBlocs] = useState<BlocVitrine[]>(theme.blocs);

  const masques = VITRINE_BLOCS.filter((bloc) => !blocs.includes(bloc));

  const deplacer = (index: number, direction: -1 | 1) => {
    const cible = index + direction;
    if (cible < 0 || cible >= blocs.length) return;
    const copie = [...blocs];
    [copie[index], copie[cible]] = [copie[cible], copie[index]];
    setBlocs(copie);
  };

  return (
    <Card>
      <h2>Identité et style</h2>
      <p className="mb-5 mt-2 text-sm text-zinc-500">
        Le nom et le logo de votre établissement viennent de vos réglages
        généraux — ils ne sont saisis qu&apos;une fois.
      </p>

      {/* HORS DU FORMULAIRE, ET PAS PAR MISE EN PAGE : la couverture a ses
          propres actions, donc ses propres <form>, et un formulaire imbriqué
          n'est pas du HTML valide — le navigateur le déplierait en silence. */}
      <div className="mb-6">
        <PhotoChamp
          cible="couverture"
          chemin={settings.cover_path}
          alt={settings.cover_alt}
          peutEditer={peutEditer}
          titre="Couverture du lieu"
        />
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <div>
          <Label htmlFor="vitrine-secteur">Votre métier</Label>
          <select
            id="vitrine-secteur"
            name="secteur"
            defaultValue={settings.secteur}
            disabled={!peutEditer}
            className="w-full max-w-xs rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm font-semibold text-k-ink disabled:bg-zinc-100"
          >
            {VITRINE_SECTEURS.map((secteur) => (
              <option key={secteur} value={secteur}>
                {libelleSecteur(secteur)}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-zinc-500">
            Il choisit les mots que lisent vos clients — « Nos cartes » chez un
            restaurant, « Nos prestations » chez un coiffeur — et une palette de
            départ. Il ne change pas la mise en page, et vos couleurs restent
            les vôtres si vous en avez choisi.
          </p>
        </div>

        <div>
          <Label htmlFor="vitrine-badge">Pastille d&apos;ouverture</Label>
          <Input
            id="vitrine-badge"
            name="badge_ouverture"
            defaultValue={settings.badge_ouverture ?? ""}
            maxLength={VITRINE_BADGE_OUVERTURE_MAX}
            disabled={!peutEditer}
            placeholder="Ouvert · 12h–23h"
          />
          <p className="mt-1.5 text-xs text-zinc-500">
            Affichée sur la photo d&apos;en-tête. Elle est écrite à la main et
            n&apos;est jamais calculée : laissez-la vide plutôt que d&apos;annoncer
            une ouverture dont vous n&apos;êtes pas sûr.
          </p>
        </div>

        <div>
          <Label htmlFor="vitrine-accroche">Accroche</Label>
          <Input
            id="vitrine-accroche"
            name="accroche"
            defaultValue={settings.accroche ?? ""}
            maxLength={VITRINE_ACCROCHE_MAX}
            disabled={!peutEditer}
            placeholder="Cuisine de marché, tous les jours."
          />
          <p className="mt-1.5 text-xs text-zinc-500">200 caractères au plus.</p>
        </div>

        <div>
          <Label htmlFor="vitrine-histoire">Votre histoire</Label>
          <textarea
            id="vitrine-histoire"
            name="histoire"
            defaultValue={settings.histoire ?? ""}
            maxLength={VITRINE_HISTOIRE_MAX}
            rows={5}
            disabled={!peutEditer}
            className={textareaClass}
            placeholder="Ce que vous faites, depuis quand, avec qui."
          />
        </div>

        <div>
          <Label htmlFor="vitrine-horaires">Horaires</Label>
          <textarea
            id="vitrine-horaires"
            name="horaires_texte"
            defaultValue={settings.horaires_texte ?? ""}
            maxLength={VITRINE_HORAIRES_MAX}
            rows={4}
            disabled={!peutEditer}
            className={textareaClass}
            placeholder={"Lundi — fermé\nMardi à samedi — 12h/14h et 19h/22h"}
          />
          <p className="mt-1.5 text-xs text-zinc-500">
            Une ligne par jour : les retours à la ligne sont conservés à
            l&apos;affichage.
          </p>
        </div>

        <fieldset className="border-t-2 border-dashed border-zinc-200 pt-5">
          <legend className="px-2 text-sm font-black uppercase tracking-[0.14em] text-k-orange-text">
            Couleurs
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <ChampCouleur
              id="vitrine-couleur-primary"
              name="couleur_primary"
              label="Couleur principale"
              aide="Titres, prix, boutons."
              valeur={theme.primary}
              disabled={!peutEditer}
            />
            <ChampCouleur
              id="vitrine-couleur-secondary"
              name="couleur_secondary"
              label="Couleur de fond"
              aide="Le papier de votre carte."
              valeur={theme.secondary}
              disabled={!peutEditer}
            />
          </div>
        </fieldset>

        <fieldset className="border-t-2 border-dashed border-zinc-200 pt-5">
          <legend className="px-2 text-sm font-black uppercase tracking-[0.14em] text-k-orange-text">
            Polices
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="vitrine-police-heading">Police des titres</Label>
              <ChoixPolice
                id="vitrine-police-heading"
                name="police_heading"
                valeur={theme.heading}
                disabled={!peutEditer}
              />
            </div>
            <div>
              <Label htmlFor="vitrine-police-body">Police du texte</Label>
              <ChoixPolice
                id="vitrine-police-body"
                name="police_body"
                valeur={theme.body}
                disabled={!peutEditer}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Seule la police choisie est téléchargée par le téléphone de vos
            clients — en choisir une ne ralentit pas la page.
          </p>
        </fieldset>

        <div>
          <Label htmlFor="vitrine-style-cartes">Présentation des fiches</Label>
          <select
            id="vitrine-style-cartes"
            name="style_cartes"
            defaultValue={theme.styleCartes}
            disabled={!peutEditer}
            className="w-full max-w-xs rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm font-semibold text-k-ink disabled:bg-zinc-100"
          >
            {VITRINE_STYLES_CARTES.map((style) => (
              <option key={style} value={style}>
                {libelleStyleCartes(style)}
              </option>
            ))}
          </select>
        </div>

        <AllureEditeur allure={theme.allure} disabled={!peutEditer} />

        <fieldset className="border-t-2 border-dashed border-zinc-200 pt-5">
          <legend className="px-2 text-sm font-black uppercase tracking-[0.14em] text-k-orange-text">
            Ordre des blocs
          </legend>
          <p className="mb-3 text-sm text-zinc-500">
            Ce que vos clients lisent, et dans quel ordre. Un bloc décoché
            n&apos;apparaît pas.
          </p>
          <input type="hidden" name="ordre_blocs" value={JSON.stringify(blocs)} />
          <ol className="space-y-2">
            {blocs.map((bloc, index) => (
              <li
                key={bloc}
                className="flex items-center gap-2 rounded-xl border-2 border-k-ink/15 bg-white px-3 py-2"
              >
                <span className="min-w-0 flex-1 text-sm font-bold text-k-ink">
                  {libelleBloc(bloc)}
                </span>
                <button
                  type="button"
                  onClick={() => deplacer(index, -1)}
                  disabled={index === 0 || !peutEditer}
                  aria-label={`Monter « ${libelleBloc(bloc)} »`}
                  className="rounded-md border border-zinc-200 px-2 py-1 text-k-ink hover:bg-zinc-50 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => deplacer(index, 1)}
                  disabled={index === blocs.length - 1 || !peutEditer}
                  aria-label={`Descendre « ${libelleBloc(bloc)} »`}
                  className="rounded-md border border-zinc-200 px-2 py-1 text-k-ink hover:bg-zinc-50 disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => setBlocs(blocs.filter((b) => b !== bloc))}
                  disabled={!peutEditer}
                  className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-bold text-k-body hover:bg-zinc-50 disabled:opacity-30"
                >
                  Masquer
                </button>
              </li>
            ))}
          </ol>
          {masques.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-zinc-500">Masqués :</span>
              {masques.map((bloc) => (
                <button
                  key={bloc}
                  type="button"
                  onClick={() => setBlocs([...blocs, bloc])}
                  disabled={!peutEditer}
                  className="rounded-full border-2 border-k-ink bg-white px-3 py-1 text-xs font-bold text-k-ink hover:bg-k-yellow/30 disabled:opacity-40"
                >
                  + {libelleBloc(bloc)}
                </button>
              ))}
            </div>
          ) : null}
        </fieldset>

        {state && !state.ok ? <FieldError message={state.error} /> : null}
        {state?.ok ? (
          <p className="text-sm font-semibold text-green-700">Enregistré.</p>
        ) : null}

        {peutEditer ? (
          <Button type="submit" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        ) : null}
      </form>
    </Card>
  );
}

/**
 * Un sélecteur de couleur DOUBLÉ d'un champ texte.
 *
 * Le `<input type="color">` seul n'est pas saisissable au clavier autrement que
 * par la palette du système, et il ne se lit pas : un commerçant qui a une
 * charte connaît son `#8a5a2b` et doit pouvoir le taper. Les deux champs
 * pilotent la même valeur ; seul le champ texte porte le `name`, pour qu'un
 * seul couple clé/valeur parte au serveur.
 */
function ChampCouleur({
  id,
  name,
  label,
  aide,
  valeur,
  disabled,
}: {
  id: string;
  name: string;
  label: string;
  aide: string;
  valeur: string;
  disabled: boolean;
}) {
  const [couleur, setCouleur] = useState(valeur);
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={couleur}
          onChange={(e) => setCouleur(e.target.value)}
          disabled={disabled}
          aria-label={`${label} — nuancier`}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border-2 border-k-ink bg-white p-1 disabled:opacity-50"
        />
        <Input
          id={id}
          name={name}
          value={couleur}
          onChange={(e) => setCouleur(e.target.value)}
          disabled={disabled}
          pattern="#[0-9a-fA-F]{6}"
          maxLength={7}
          className="font-mono"
        />
      </div>
      <p className="mt-1.5 text-xs text-zinc-500">{aide}</p>
    </div>
  );
}

function ChoixPolice({
  id,
  name,
  valeur,
  disabled,
}: {
  id: string;
  name: string;
  valeur: string;
  disabled: boolean;
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={valeur}
      disabled={disabled}
      className="w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm font-semibold text-k-ink disabled:bg-zinc-100"
    >
      {FONT_LIST.map((police) => (
        <option key={police.key} value={police.key}>
          {police.label}
        </option>
      ))}
    </select>
  );
}

/**
 * PUBLIER — et montrer l'adresse, pas une promesse.
 *
 * ── LA PHRASE D'ATTENTE EST MORTE (L11) ──
 *
 * Cet encart a porté pendant tout L10 un avertissement : « l'adresse ne répond
 * pas encore — n'imprimez pas vos QR codes tout de suite ». C'était vrai tant
 * que `VITRINE_PUBLIQUE_OUVERTE` valait faux ; ça ne l'est plus, et une
 * consigne d'attente qui survit à la fin de l'attente est pire qu'une absence
 * de consigne : le commerçant n'imprime toujours pas ses QR, et personne ne
 * saura dire pourquoi son module ne sert à rien.
 *
 * À la place, la seule chose qu'il ait besoin de voir : L'ADRESSE, en clair et
 * cliquable, pour qu'il l'ouvre sur son téléphone avant de la faire imprimer.
 *
 * ── LE LIEN N'EST CLIQUABLE QUE PUBLIÉE ──
 *
 * Non publiée, `/v/{slug}` rend 404 — indistinctement d'une adresse inconnue,
 * c'est la doctrine de la page publique. Offrir le lien quand même aurait fait
 * découvrir une page introuvable à celui qui vient de la préparer. L'adresse
 * reste donc affichée — il la choisit, il doit la lire — mais en texte, et la
 * phrase dit ce qui manque : publier.
 */
function PublicationCard({
  settings,
  appUrl,
  peutPublier,
}: {
  settings: VitrineSettingsView;
  appUrl: string;
  peutPublier: boolean;
}) {
  const publier = useActionForm(publierAction, {
    networkError: "Publication impossible, réessayez.",
    reloadOnSuccess: true,
  });
  const depublier = useActionForm(depublierAction, {
    networkError: "Dépublication impossible, réessayez.",
    reloadOnSuccess: true,
  });
  const state = settings.published ? depublier.state : publier.state;

  return (
    <Card>
      <h2>Publication</h2>

      <div className="mt-3 rounded-xl border-2 border-k-ink/15 bg-white p-4">
        <p className="text-sm font-black text-k-ink">
          {settings.published ? "Publiée" : "Non publiée"}
        </p>
        <p className="mt-1 text-sm text-k-body">
          {settings.published
            ? "Votre vitrine est en ligne. Ouvrez l'adresse ci-dessous sur votre téléphone avant de la faire imprimer sur vos QR codes."
            : "Publiez pour ouvrir l'adresse. Vous seul la voyez : tant qu'elle n'est pas publiée, elle ne répond pas à vos clients."}
        </p>
        <p className="mt-2 text-sm">
          {settings.published ? (
            <a
              href={cheminVitrine(settings.slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-k-ink underline underline-offset-2 hover:text-k-orange-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-yellow"
            >
              {urlVitrine(settings.slug, appUrl)}
            </a>
          ) : (
            <span className="font-semibold text-zinc-500">
              {urlVitrine(settings.slug, appUrl)}
            </span>
          )}
        </p>
      </div>

      {state && !state.ok ? (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-600">
          {state.error}
        </p>
      ) : null}

      <div className="mt-4">
        {settings.published ? (
          <form onSubmit={depublier.onSubmit}>
            {/* Dépublier n'est JAMAIS gardé — ni en base (le trigger ne garde
                que la transition vers `true`), ni ici : on ne bloque pas
                quelqu'un qui veut retirer sa carte. */}
            <Button type="submit" variant="secondary" disabled={depublier.pending}>
              {depublier.pending ? "Retrait…" : "Dépublier"}
            </Button>
          </form>
        ) : (
          <form onSubmit={publier.onSubmit}>
            <Button type="submit" disabled={!peutPublier || publier.pending}>
              {publier.pending ? "Publication…" : "Publier la vitrine"}
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}

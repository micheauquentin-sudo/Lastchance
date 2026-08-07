/**
 * LAVIS DE FOND — la couleur de page de chaque thème.
 *
 * ── Le défaut que ce fichier corrige ──
 *
 * Les onze thèmes joueur peignaient TOUS le même fond : `var(--color-k-bg)`,
 * le crème du site. Seul un motif à ~14 % d'alpha variait, ce qui, à l'écran,
 * ne se voit pas. Un commerçant qui choisissait « Noël » obtenait la page
 * qu'il aurait eue en choisissant « Soldes ». Le thème ne changeait rien de ce
 * qu'un client voit en arrivant.
 *
 * Chaque thème pose donc maintenant SA couleur. Les valeurs sont des lavis —
 * des teintes très claires de la palette Kermesse — et pas des aplats saturés,
 * pour une raison mesurée, pas décorative : voir ci-dessous.
 *
 * ── Le contrat de lisibilité, et comment il a été vérifié ──
 *
 * Deux textes des pages joueur ne sont PAS encartés et reposent donc
 * directement sur ce lavis : l'en-tête (nom du commerce en `text-k-body`,
 * titre en `text-k-ink`) et le pied de page (`text-k-body`). Tout le reste
 * vit sur des cartes blanches opaques.
 *
 * Chaque lavis a été mesuré contre ces deux encres, ET contre le pire pixel du
 * motif qui le recouvre (la rayure ou le pois, fondu à son alpha) — c'est ce
 * pixel-là, pas la couleur de base, qui décide du cas défavorable :
 *
 *   thème            fond      pire pixel   k-ink   k-body
 *   neutre           #fdf6e3   #f3ead3      14,0    9,7
 *   noel             #e6f2e6   #bcd9c6      11,1    7,7
 *   saint_valentin   #fdeaf0   #f7c0c6      10,6    7,4
 *   anniversaire     #fdf1d8   #f9cece      11,8    8,2
 *   soldes           #fdeadb   #fbcfb5      11,7    8,1
 *   festival         #e7edfb   #d0ddf9      12,3    8,5
 *   gourmand         #fbecd4   #fad3b2      12,0    8,3
 *   degustation      #f6e2e8   #e1c1cb      10,1    7,0
 *   culture          #e8eef9   #d0def8      12,4    8,6
 *   produit          #fdf2cd   #fde099      13,0    9,0
 *   sport            #e4f1e6   #bedac9      11,2    7,8
 *   entreprise       #eceff5   #d6e0f5      12,7    8,8
 *
 * Le seuil AA du texte courant est 4,5:1. Le pire cas relevé est 7,0:1 — le
 * corps de texte garde plus d'une fois et demie la marge exigée sur TOUS les
 * thèmes. `k-muted` et `k-orange-text`, qui descendraient plus bas, ne sont
 * employés sur aucune de ces quatre surfaces (vérifié par grep) ; s'ils y
 * arrivaient un jour, c'est le lavis qu'il faudrait éclaircir, pas le texte
 * qu'il faudrait assombrir.
 *
 * `neutre` garde le crème exact du site : c'est le thème par défaut, celui
 * qu'un commerçant n'a pas choisi, et il doit rester l'univers Lastchance.
 */

/** Crème du site — la valeur littérale de `--color-k-bg`. */
const CREME = "#fdf6e3";

/** Lavis des six thèmes saisonniers (calendrier ET pronostics : même enum SQL,
 *  même saison, donc même fond — un client ne peut pas voir deux « Noël »
 *  différents selon le module). */
export const LAVIS_SAISON = {
  neutre: CREME,
  noel: "#e6f2e6",
  saint_valentin: "#fdeaf0",
  anniversaire: "#fdf1d8",
  soldes: "#fdeadb",
  festival: "#e7edfb",
} as const;

/** Lavis des sept habillages de quiz. */
export const LAVIS_QUIZ = {
  neutre: CREME,
  gourmand: "#fbecd4",
  degustation: "#f6e2e8",
  culture: "#e8eef9",
  produit: "#fdf2cd",
  sport: "#e4f1e6",
  entreprise: "#eceff5",
} as const;

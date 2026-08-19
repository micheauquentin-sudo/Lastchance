# Benchmark Mennoo — train « Réserver & Vitrine », lot L1 (2026-08-19)

> Lecture seule, ressources publiques uniquement (mennoo.gr FR/EN, démos
> publiques mennoo.app, sources tierces pour la traduction). Aucun
> contournement, aucune API privée. Les inférences sont marquées **[INF]**.
> Prérequis dur levé avant tout code Vitrine (directive du 2026-08-18).

## 1. Traduction — le cœur

Faits observés :

- Le modèle économique tarife **à la langue** : 6 forfaits annuels, chaque
  langue supplémentaire coûte +50 €/an (199 € = 1 langue → 449 € = 6 langues).
  Source : https://www.mennoo.gr/en/paketa/.
- La FAQ dit « le système peut prendre en charge toutes les langues », **sans
  préciser qui produit la traduction**. Le slug FR de la FAQ est lui-même une
  mistraduction machine (« /sexe-erotique/ » pour « συχνές ερωτήσεις »).
- Bascule visiteur : sélecteur à drapeaux + **paramètre d'URL
  `?lang=el|en|fr|de|it|he|zh`** — la démo restaurant expose 7 langues.
  Source : https://mennoo.app/b/167026e5, /c/391cb0dd?lang=fr.
- Le contenu FR de la démo présente des artefacts typiques de TA non relue
  (« Crème d'œufs de poisson) À base », « IA, dis-moi plus ! »).
- Fonction « **AI Tell Me More** » : bouton par produit générant une
  présentation IA du plat, multilingue.
  Source : https://www.mennoo.gr/en/ai-tell-me-more/.

**[INF]** La traduction est **stockée par langue** (servie par `?lang=`,
facturée par langue, produite à la saisie du catalogue), vraisemblablement de
la TA non relue ; ce n'est **pas** de la traduction à la volée par visiteur.

## 2. Catalogue (démo restaurant)

- **Page commerce** (`/b/`) : logo, WiFi (identifiants affichés), liens
  Instagram/TikTok/Facebook/Google Maps + **lien avis Google**, téléphone,
  email.
- **Multi-cartes par lieu** (`/c/`) : 7 listes distinctes (Menu, Fruits de
  mer, Livraison, Desserts, Vins, Boissons, « Menu sans photos »), chacune
  avec sous-catégories.
- **Fiche produit** : nom (bilingue), description courte, prix, **badges**
  (Épicé, Végétarien, Végétalien, Traditionnel, Option saine, Grillé),
  **allergènes** (+ disclaimer en pied de page), options par plat, bouton IA,
  photo optionnelle. Filtres par cuisson/régime/ingrédients ; favoris légers
  (pas de commande).
- **12 démos par métier** : restaurant, café, hôtel/resort, spa, beach bar,
  shisha, italien, mexicain, sushi, chinois, wine bar, cocktail bar.
  Source : https://www.mennoo.gr/en/demo/.
- Back-office commerçant **étroit** (activer/désactiver produits, prix,
  photos) ; le reste passe par l'équipe Mennoo (téléphone/email/Viber).

## 3. QR et supports

QR table/entrée ; formats : **stickers**, présentoirs minimalistes,
**supports bois ou imprimés 3D** ; NFC mentionné. Inclusion/surcoût non
précisés publiquement.

## 4. Import / onboarding

- **Service intégral « on crée votre carte »** : envoi PDF/Word/photo par
  email/Viber, saisie par l'équipe Mennoo (« setup, formatting, completion »),
  « d'une valeur de 99 € » offerte. Modifications illimitées par
  téléphone/email/Viber/WhatsApp.
- Aucun délai de mise en route annoncé. **[INF]** Modèle « service géré »,
  pas self-onboarding — l'inverse du self-service LastChance.

## 5. Offre commerciale

- 6 plans **annuels** différenciés **uniquement par le nombre de langues** :
  199→449 € HT (1→6 langues) ; « populaires » : 3 et 6 langues. Contenus
  illimités partout. **Pas d'essai gratuit, pas de plan mensuel.**
- CGU : abonnement d'un an ; **aucun remboursement une fois le catalogue
  créé** ; sort des données au non-renouvellement non spécifié ; le
  commerçant seul responsable du contenu ; pas de SLA.

## 6. Capacité de traduction gratuite pour LastChance

Volume mesuré sur la démo publique : ~60–80 fiches/commerce, ≈ 80
caractères/fiche → carte complète ≈ 7–8 k caractères, carte française
« bavarde » ≈ 15–20 k. **Base de calcul : 12 k caractères/langue/carte.**
Badges/allergènes = vocabulaire fixe plateforme, traduit une fois pour
toutes, coût nul par commerce. Les prix ne se traduisent pas.

Sous l'hypothèse DeepL API Free (500 k caractères/mois) : ~41
commerces/mois vers 1 langue en première traduction ; en régime établi avec
**cache par version de fiche** (~1–3 k/commerce/mois), ~450 commerces
entretenus à 1 langue, ~165 à 3 langues.

**⚠️ Caveat majeur (2026)** : selon plusieurs sources concordantes
(l'officielle rend un 403), **DeepL API Free 500 k/mois récurrent est fermé
aux nouvelles inscriptions depuis ~juillet 2026**, remplacé par « Developer »
= **1 M de caractères au total, une seule fois** (~28 onboardings à
3 langues, puis payant ~5,49 $/M). La décision propriétaire du 2026-08-19
d'**écarter DeepL** est confirmée a posteriori. Compte : carte bancaire
exigée à l'inscription.

Alternatives gratuites / auto-hébergées :

1. **LibreTranslate** (AGPL, moteurs Argos/OPUS-MT) : Docker CPU, 1–2 Go RAM
   par couple de langues, VPS ~5–12 €/mois, illimité. Qualité FR→EN correcte
   sur descriptions factuelles, **faible sur noms de plats idiomatiques**.
   Non hébergeable sur Vercel serverless (conteneur persistant requis) ;
   AGPL sans risque en service séparé appelé en HTTP.
2. **Argos/OPUS-MT en direct** : mêmes modèles en job batch, coût marginal
   nul ; pas de glossaire natif — placeholders sur les noms propres.
3. **NLLB-200 distillé (Meta)** : meilleure qualité mais **CC-BY-NC,
   inutilisable commercialement — écarté**.
4. **Filet à coût zéro** : traduction native du navigateur sur une page
   publique bien balisée (`lang` correct, `translate="no"` sur noms de
   marque/plats signature). Gratuit, sans infra, qualité non maîtrisée.

## Implications pour VIT-1/VIT-2

- **Le différenciateur est le self-service** : onboarding autonome < 30 min
  avec import assisté = avantage frontal sur le modèle géré de Mennoo.
- **Traduction = asset stocké et versionné par langue**, servi par `?lang=` ;
  jamais de TA à la volée par visiteur ; cache par hash de fiche ;
  prix/nombres exclus du pipeline.
- **Vocabulaire plateforme pré-traduit humainement** (badges régime,
  allergènes UE-14, libellés UI) : coût nul par commerce, qualité garantie
  sur les champs sensibles.
- **Ne pas traduire les noms de plats par défaut** (champ traduisible à la
  demande ; description = TA) — c'est là que Mennoo se ridiculise.
- **V1 sans aucune IA payante** : balisage navigateur + vocabulaire
  plateforme (décision A-traduction, ADR-109) ; V1.1 : LibreTranslate
  auto-hébergé (~10 €/mois) pour des traductions stockées et contrôlées.
- **Abstraction `TranslationProvider`** (DeepL / LibreTranslate / navigateur
  seul) choisie par config — ne rien câbler sur une offre DeepL mouvante.
- **Structure catalogue cible** (parité Mennoo) : commerce → N cartes →
  sous-catégories → fiches {nom, description, prix, photo optionnelle,
  badges, allergènes, options, disponibilité} ; page commerce : WiFi,
  réseaux sociaux, lien avis Google.
- **QR multi-supports dès VIT-1** : gabarits imprimables sticker + chevalet
  (la chaîne affiche A4 existe déjà).
- **La tarification à la langue est un levier éprouvé** : langues
  supplémentaires = marge pure ou différenciateur « incluses illimitées ».

Limites : pas d'accès au back-office Mennoo (conforme à la directive) ;
démos à prix 0,00 € ; page officielle des plans DeepL en 403 — à re-vérifier
au moment d'un éventuel abonnement.

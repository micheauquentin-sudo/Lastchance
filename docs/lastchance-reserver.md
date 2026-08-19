# LastChance Réserver — périmètre de développement validé

> Statut : décision produit validée le 2026-08-17. Aucun code, commit, déploiement ou migration distante n'est autorisé par ce document seul.

## Promesse

**« Prendre un créneau, rejoindre la file, récupérer une place. »**

LastChance Réserver est un socle commun de réservation pour les commerçants : activité à capacité limitée, file virtuelle, liste prioritaire, invitation privée et retrait temporairement réservé. Il ne s'agit pas de construire plusieurs calendriers ni un CRM/POS. **L'agenda de réservation est réservé aux organisations disposant de l'offre Vitrine active.**

Le Mode Attente active est une couche facultative : une fois dans la file ou après confirmation d'un créneau, le client peut choisir une animation courte. Elle améliore l'expérience sans modifier l'ordre de passage.

## Parcours à couvrir

| Produit | Promesse commerçant | Parcours client |
| --- | --- | --- |
| Rendez-vous Express | Remplir un créneau sans logiciel de réservation. | QR → activité → créneau → confirmation → arrivée validée par le staff. |
| File sereine | Faire attendre sans faire fuir. | QR → rang réel → notification/appel du staff → servi, annulé ou absent. |
| Liste prioritaire / Place libérée | Ne pas perdre la demande quand c'est complet. | Inscription → une place se libère → proposition limitée dans le temps → confirmation ou passage au suivant. |
| Invitation privée | Ouvrir un nombre limité de places sans liste Excel. | Invitation personnelle → créneau/événement → check-in staff. |
| Dernière minute | Remplir les créneaux proches sans brader toute la journée. | Créneau disponible dans une fenêtre définie → réservation → check-in. |
| Réserve ton offre / Drop anti-gaspi | Bloquer une unité jusqu'à une heure donnée et la retirer en caisse. | Offre limitée → blocage temporaire → retrait staff → expiration et remise en stock si besoin. |

## Lots de développement

### RES-1 — Socle Réserver

Créer une activité réservable, ses créneaux et une capacité finie. Le client réserve, retrouve sa confirmation et peut annuler ; le staff visualise puis valide l'arrivée.

Critères d'acceptation :

- aucune sur-réservation sous concurrence ;
- une même identité joueur ne réserve pas deux fois le même créneau ;
- capacité, réservation, annulation et check-in sont serveur-autoritaires et idempotents ;
- une réservation déjà arrivée ne peut plus être annulée ;
- les heures suivent le fuseau de l'organisation ;
- le staff ne voit et ne manipule que son organisation ;
- le QR public est une adresse, jamais une preuve de présence ; le check-in exige une action staff ou un jeton limité ;
- le client peut retrouver le statut de sa réservation sans créer obligatoirement un compte complet.

### RES-2 — Liste prioritaire et invitation privée

Ajouter la liste lorsque le créneau est complet, puis la libération séquentielle d'une place. Ajouter l'invitation à capacité limitée comme une réservation avec règle d'accès distincte.

Critères d'acceptation :

- une place annulée est proposée à une seule personne à la fois, avec expiration ;
- l'expiration rend la place disponible sans intervention ;
- acceptation, expiration et annulation sont auditables ;
- l'invitation est révocable et ne devient pas un QR permanent partageable ;
- l'organisateur peut fermer les inscriptions sans annuler les places déjà confirmées ;
- rappels et relances utilisent un consentement transactionnel séparé du marketing.

### RES-3 — File sereine

Créer une file virtuelle basée sur un rang et un statut réels. Le staff appelle, sert ou marque l'absence ; le client peut quitter volontairement.

Critères d'acceptation :

- aucun ETA affiché tant qu'il n'est pas fiable ;
- une identité ne possède qu'une entrée active dans une même file ;
- le rang ne dépend ni d'un jeu, ni d'un appareil, ni de l'heure de rafraîchissement ;
- l'appel staff prime sur tout autre écran ;
- les abandons et absences sont mesurés, sans pénalité automatique au MVP.

### RES-4 — Mode Attente active

Proposer, à titre facultatif, **Quiz éclair**, **Pause Chance** ou consultation de l'activité à une personne en attente. Les futures options sont la découverte avant passage, le Défi Duo volontaire et le souvenir post-check-in.

Critères d'acceptation :

- une session d'attente serveur sépare strictement file/réservation et animation ;
- le jeu ne peut ni lire ni modifier rang, priorité, capacité, accès, délai ou droit à une place ;
- une Pause Chance est bornée par session ; les gains sont décidés côté serveur, à valeur plafonnée ;
- le jeu se ferme proprement à l'appel ; toute récompense liée à l'attente n'est remise qu'après check-in ou en dehors du flux de file ;
- aucune animation n'est nécessaire pour conserver sa place.

### RES-5 — Réservation de stock et Drop anti-gaspi

Ajouter le blocage temporaire d'une quantité réelle, puis le retrait en caisse. Ce lot vient après le socle de créneau : une réservation de stock n'est pas un gain de jeu.

Critères d'acceptation :

- une unité bloquée ne peut pas être attribuée deux fois ;
- expiration, annulation et retrait restaurent ou consomment le stock une seule fois ;
- quotas, échéance et preuve de retrait sont visibles au staff ;
- la réservation est retrouvable dans le portefeuille et remise une seule fois en caisse ;
- aucune synchronisation de caisse/POS ni promesse de stock marchand en temps réel au MVP.

### Extensions déjà retenues, hors noyau Réserver

- **Boussole de choix** : parcours de préférences aboutissant à une recommandation configurée par le commerçant, sans bonne réponse de quiz.
- **Choix du cadeau** : le client sélectionne un avantage parmi une sélection finie ; stock, échéance et retrait restent atomiques côté serveur.

## LastChance Vitrine — direction validée

**Définition :** LastChance Vitrine est la façade digitale du commerce, configurée manuellement par le commerçant : histoire et ambiance du lieu, savoir-faire, équipe, plats, produits, prestations, dégustations, nouveautés ou offres. Elle ne se limite donc pas à un catalogue. La promesse n'est pas « créez votre caisse » mais **« Faites découvrir votre lieu et ce que vous proposez, puis faites réserver le bon moment. »**

MVP envisageable :

- catégories et fiches (titre, image, description courte, informations pratiques, prix affiché si le commerçant le renseigne) ;
- une présentation de commerce (accroche, images, horaires, accès et univers de marque) ;
- des sélections éditoriales telles que « nos incontournables », « le plat du moment » ou « à découvrir cette semaine » ;
- liens QR vers une fiche ou une sélection ;
- rattachement d'une fiche à une activité réservable, une invitation ou une animation d'attente ;
- passage facultatif par la Boussole de choix pour orienter vers une fiche ;
- état de disponibilité saisi manuellement, sans promesse de synchronisation de stock.

La suite éventuelle serait la réservation d'une prestation ou d'un article limité. Elle dépend de RES-5 et doit rester distincte des gains : pas de paiement, de commande, de livraison, de synchronisation POS ou de stock temps réel au MVP. Toute information réglementée propre aux plats (allergènes, prix, alcool) doit être cadrée avant d'être présentée comme une promesse produit.

### CRM léger Vitrine

Le CRM léger est exclusivement accessible avec Vitrine. Il aide le commerçant à suivre les clients qui ont volontairement interagi avec son lieu, sans devenir un outil de prospection ou de gestion commerciale lourd :

- fiche client minimale : identité disponible, consentements, réservations, arrivées/check-in, avantages remis et interactions Vitrine ;
- vue chronologique de la relation et segments simples fondés sur des faits (réservé, venu, inactif, intérêt explicite) ;
- recherche et export strictement limités aux droits de l'organisation ;
- aucune note libre par défaut, pipeline de vente, enrichissement tiers, scoring opaque ou campagne marketing sans consentement séparé.

### Droit d'accès Vitrine

L'offre Vitrine doit ouvrir, côté serveur et pour la seule organisation abonnée, les capacités distinctes **publier la Vitrine**, **utiliser le CRM léger** et **gérer l'agenda Réserver**. Masquer une entrée de menu ne suffit pas : chaque page, action, RPC et ressource publique doit vérifier le droit adapté. Cette décision ne crée ni produit Stripe, ni prix, ni checkout ; le modèle commercial et son octroi doivent être arbitrés avant ces mutations.

### Développement validé — mini-site de marque guidé

Vitrine doit produire un site de marque cohérent, pas un constructeur de sites généraliste. Personnalisation recommandée : logo, couleurs, couverture, deux polices choisies, style des cartes, ordre des blocs et images optimisées. Sont exclus au MVP : HTML/CSS libre et réglage pixel par pixel.

Trois parcours publics :

- **QR entrée** → page d'accueil : lieu, histoire, horaires, accès, mise en avant et CTA principal ;
- **QR table** → carte/menu directement : catégories → plat → fiche ;
- **QR produit/expérience** → fiche précise → réservation, invitation ou découverte associée.

Chaque fiche de plat/produit/prestation peut porter image, titre, description, prix affiché, disponibilité manuelle et association éditoriale. Les informations réglementées propres à l'alimentaire restent à cadrer avant promesse produit. Après la carte, une zone facultative seulement : Moment Signature, Atelier Duo, réservation ou bouton « Jouer pendant l'attente ». Les jeux facultatifs sont **Quiz**, **Duo Miroir** et **Portrait de la Bande**. Aucun jeu ne démarre automatiquement ni ne remplace la consultation de carte. À l'écran final d'un jeu, une sortie discrète et facultative peut afficher les liens sociaux du commerce et son lien d'avis Google neutre.

Les liens Instagram et TikTok doivent être configurables, avec 1 à 3 contenus mis en avant manuellement au MVP — pas de connexion de compte ni de flux aspiré. Un lien d'avis Google peut être affiché sobrement en bas de Vitrine et en rappel facultatif à la fin d'un jeu, fourni par le commerçant, sans filtrer les clients ni conditionner/récompenser l'avis par un jeu, gain ou remise. Le libellé reste neutre (« Avis Google »), ne demande pas une note positive et peut être ignoré.

### Option anglais de Vitrine

Chaque Vitrine propose automatiquement, en bas de page, l'action **« Translate to English » / « Lire en anglais »**. Le commerçant n'a aucune traduction à saisir, relire ou publier. Le sélecteur s'applique aux pages publiques : accueil, histoire du lieu, carte/catégories/fiches de plats ou produits, activités, Moments Signature, Atelier Duo, réservation, confirmations publiques et contenus de jeu configurés par le commerce. Les packs éditorialisés natifs de Quiz et du Portrait de la Bande restent traduits et contrôlés par le produit.

La traduction est demandée par le visiteur, produite côté serveur puis mise en cache par version de contenu ; elle est invalidée lorsqu'une fiche publique change. Prix, disponibilités et créneaux restent des données communes non réinterprétées. Si le service de traduction est indisponible, la page française reste utilisable, sans écran vide. Le visiteur peut revenir immédiatement au français et voit que la version anglaise est une traduction automatique.

Le français reste le texte de référence. Pour les plats, allergènes, alcool et informations pratiques, la Vitrine doit conserver l'original accessible et inviter le visiteur à confirmer auprès du commerce en cas de doute ; aucune traduction automatique ne doit être présentée comme un conseil ou une garantie réglementaire. Le fournisseur, le coût et les conditions de la traduction seront choisis au moment de l'implémentation ; aucun tarif Vitrine supplémentaire n'est décidé ici.

### Vitrine Restaurant — référence HORECA inspirée de Mennoo

Vitrine Restaurant doit être un vrai catalogue QR vivant, qualitatif et zéro-friction pour l'HORECA — restaurant, café, hôtel, bar, beach bar, spa — pas une simple galerie. Le produit de référence est un QR qui ouvre immédiatement une carte lisible, dans la langue du client, sans application et sans PDF. Un même lieu peut publier des cartes séparées : petit-déjeuner, carte midi, boissons, enfants, room service, bar ou offres saisonnières.

Le commerçant crée et met à jour depuis son téléphone des catégories et fiches de plats/boissons : nom, prix, description, image, informations alimentaires configurées, disponibilité et ordre d'affichage. Une action rapide permet de marquer un plat indisponible ou de modifier prix/description ; le QR stable se met à jour immédiatement. Des modèles visuels par métier donnent immédiatement un rendu professionnel, tout en conservant logo, couleurs et photos du lieu.

Le premier import doit réduire la saisie au minimum : photo de carte, PDF ou tableur → extraction assistée des catégories, plats, prix et descriptions → **brouillon à revoir obligatoirement** avant publication. À terme, proposer un service « On vous crée votre carte » : le commerçant transmet son fichier et reçoit une Vitrine prête à relire, sans devoir refaire son menu. Aucune extraction ou traduction automatique ne doit publier un allergène, un prix ou une information pratique sans contrôle visible du commerçant.

Les QR sont imprimables (PNG/SVG) et contextuels : entrée, table, produit ou expérience. Le produit fournit des formats de présentation imprimables (table, comptoir, vitrine, réception), sans imposer de matériel propriétaire. La page publique est optimisée mobile, avec navigation de catégories, recherche et filtres de découverte adaptés au menu. Les statistiques montrent les scans, vues de catégories/plats, langues utilisées et clics d'intention (réserver, jouer), sans attribuer une vente non mesurée.

Après ce socle fiable seulement, Vitrine se différencie : carte → Boussole de choix, Réserver, Moment Signature, Atelier Duo ou jeu facultatif. Une piste de différenciation à arbitrer ensuite est **« Raconte-moi ce plat »** : un bouton sur une fiche qui génère une présentation courte dans la langue du visiteur, exclusivement à partir des données structurées de la carte ; jamais de prix, allergène, disponibilité ou conseil inventé. À repousser hors périmètre : commande à table, appel serveur, note, paiement, cuisine/POS, stock de caisse et toute promesse d'opération restaurant temps réel. Export PDF imprimable et langues supplémentaires sont des suites à prioriser après ce socle.

Ordre de développement validé : **VIT-1** identité + éditeur de catalogues HORECA et langues automatiques (anglais d'abord) → **VIT-2** import assisté/service de création + QR contextuels imprimables → **VIT-3** Réserver/Expérience/jeux facultatifs → **VIT-4** liens sociaux, avis Google et analytics de consultation → **VIT-5** langues supplémentaires et amélioration de traduction. **VIT-6 à arbitrer :** Raconte-moi ce plat. Hors MVP : e-commerce, commande cuisine, paiement, synchronisation POS, stock temps réel et intégrations sociales OAuth/API.

### Directive d'implémentation

Mennoo est une référence de **niveau de finition** pour Vitrine HORECA, non un modèle à copier. Chaque capacité doit appartenir au parcours LastChance unique : **catalogue QR → Boussole/Réserver → Expérience Signature ou jeu facultatif → sortie sociale/avis neutre**. Réutiliser l'organisation, les droits Vitrine serveur, l'identité de marque, les QR, les récompenses et analytics mutualisés ; ne jamais livrer un catalogue isolé, une copie d'interface ou un POS déguisé.

Avant toute implémentation, réaliser un benchmark technique et commercial de Mennoo, uniquement à partir de ses pages, conditions, plans, démonstrations et bundles client publics : parcours de traduction, langues, comportements observables, structure des offres, tarifs/limites, essai/déclassement, import et QR. Comparer ces observations au code LastChance (entitlements, abonnements, traduction, QR, publication) et distinguer dans le handoff les faits sourcés des hypothèses. Ne jamais contourner une authentification, appeler une API privée, chercher des secrets ou recopier du code propriétaire.

## Expériences Signature retenues

Ces deux formats doivent être des modèles du même socle **Expérience Signature** — page immersive, promesse, durée, capacité, préparation, check-in et éventuellement liste d'attente — et non deux moteurs verticaux.

| Format | Promesse | MVP |
| --- | --- | --- |
| **Moment Signature** | « Faites réserver l'expérience que seul votre commerce peut faire vivre. » | Une expérience de 20 à 45 minutes, présentée en trois étapes/cartes, avec créneaux, jauge, réservation et arrivée staff. Exemples : dégustation, démonstration, mini-soin, sélection d'un libraire ou création florale. |
| **Atelier Duo** | « Venez à deux, repartez avec une découverte commune. » | Une expérience réservée par un hôte et un accompagnant, avec capacité atomique par personne, instructions, check-in et aucune mécanique de score, classement ou gain. |

À vérifier avec des commerçants pilotes : capacité et temps réellement consacrables par le staff, régularité du format, et promesse présentée au client. Pas de paiement, billetterie, partage de revenus ni matériel d'animation fourni par LastChance au MVP.

## Jeux retenus

### Duo Miroir

**Promesse :** « Qui connaît vraiment les goûts de l'autre ? » Deux personnes présentes choisissent chacune, de façon scellée, un produit ou une sélection réelle qu'elles offriraient ou recommanderaient à l'autre. Les choix sont révélés simultanément, puis le commerce présente sa propre proposition.

Le jeu doit s'appuyer sur les fiches Vitrine et une session duo courte : QR de démarrage, association de deux appareils, 3 à 6 choix configurés par le commerçant, choix scellés, révélation, fermeture automatique. L'écran final peut rappeler les liens Instagram/TikTok et le lien d'avis Google neutre de la Vitrine. Il ne nécessite aucun gain, score, classement, achat ou collecte de profil. Les choix servent uniquement à ce moment et la présence doit être validée par une session courte sur place ou le staff.

### Le Portrait de la Bande

**Promesse :** « À votre avis, qui est le plus drôle, le plus cool ou le plus râleur… selon le groupe ? » Une session privée de 2 à 12 personnes : une même question est posée à tous, chacun choisit discrètement un participant ou passe, puis le résultat collectif apparaît immédiatement dès que tous les votes sont verrouillés. Exemple de révélation : « Lina — 60 % · 3 personnes sur 5 ». Les personnes qui ont voté ne sont jamais révélées.

Boucle MVP : lobby privé par QR/code éphémère → prénoms/pseudos → question ouverte → un vote serveur par personne → attente invisible des réponses → révélation du pourcentage, des égalités et de la répartition → question suivante → portrait final du groupe après 5 à 8 questions, avec rappel facultatif des réseaux et de l'avis Google neutre. États : `brouillon → lobby → question ouverte → votes verrouillés → révélation → question suivante → récapitulatif → expiré`.

Le commerçant choisit un pack validé (**Entre amis**, **Duo**, **Équipe**, **Anniversaire**) mais ne rédige pas librement les questions au MVP. Le pack par défaut est positif ; un pack « taquin » doit être choisi volontairement. Sont exclus : corps, santé, âge, sexualité, religion, politique, argent, humiliation, texte libre, chat, profil psychologique durable et tableau de classement général.

Critères d'acceptation :

- 2 à 12 participants par session au MVP ; toute jauge supérieure exige une validation de capacité distincte ;
- un seul vote par participant et par question ; aucun résultat avant le verrouillage complet ou la clôture explicite ;
- le dénominateur ne change pas durant une question ; déconnexion et sortie ne se résolvent qu'entre deux questions ;
- résultat calculé côté serveur : pourcentage exact, nombre de voix, gagnant ou égalité ;
- session privée, éphémère et purgée ; code court/signé non rejouable après expiration ou capture ;
- aucune priorité, capacité Réserver, gain, achat ou accès à une offre ne dépend du résultat ; l'appel staff interrompt toujours le jeu en attente.

## Invariants transverses

- Multi-tenant : toute ressource, action staff et remise est strictement rattachée à l'organisation.
- Sécurité : jetons courts, signés, révocables et limités ; aucune valeur économique décidée par le navigateur.
- Données : minimisation, consentement explicite pour les messages non nécessaires au service, purge des données de réservation/attente selon la politique produit.
- Expérience : état clair (« confirmé », « en attente », « appelé », « annulé », « expiré ») ; pas de promesse de délai artificielle.
- Réemploi : identité joueur, QR, portefeuille, caisse, rôles staff, stock fini, fuseau d'organisation et canal SMS existants sont des fondations à intégrer, pas à dupliquer.

## Hors MVP

- paiements, acomptes, remboursements ou cartes cadeaux ;
- synchronisation de caisse/POS ou d'agendas tiers ;
- prix dynamique ;
- pénalités automatiques de no-show ;
- algorithme de priorité opaque ;
- grand jeu temps réel ou récompense qui dépend de la performance client.

## Mesures produit

- réservations créées, confirmées, annulées et check-in ;
- taux de remplissage et places sauvées par liste prioritaire ;
- abandons de file et temps avant appel observé ;
- réservations de stock expirées et retraits effectués ;
- ouverture et complétion des animations d'attente, séparées des métriques de rang et de service.
- fiche vue → Boussole ouverte → activité/créneau choisi → réservation, sans attribuer une vente qui n'est pas mesurée.

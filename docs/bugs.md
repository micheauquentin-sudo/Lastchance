# Known Issues & Bugs - Lastchance

## Critical

- **✅ CHASSE AUX BUGS PAR PARCOURS VÉCU — 33 trouvailles, 14 confirmées,
  9 corrigées (2026-07-31)** — après quatre jours de campagnes de mesure, le
  client a tranché : *« il ne doit rester aucun bug sur le site et
  l'expérience avant de continuer à développer »*. La chasse a donc été
  organisée par PARCOURS — le joueur qui scanne, les 19 autres jeux, les
  modules autonomes, la caisse, le socle commerçant, les éditeurs, l'équipe
  et l'abonnement, le transverse — et non par fichier.

  **Règle d'admission** : un défaut ne comptait que si l'on pouvait écrire
  « il fait X, il attend Y, il obtient Z » avec des gestes concrets. Les
  tests, la doc, le style et l'architecture étaient explicitement hors sujet.

  **CE QUI BLOQUAIT LE JOUEUR** (le plus fréquent d'abord) :

  1. **Le contrôle anti-robot sans porte de sortie.** `TurnstileWidget`
     énonce la règle dans son propre commentaire — « un appelant qui
     CONDITIONNE une action au jeton doit s'abonner à `onUnavailable` […]
     sans cela le client reste devant un cadre vide ». Trois modules l'avaient
     fait ; **le parcours principal, la roue, ne l'avait pas**, ni les 19
     autres jeux. Le joueur appuyait, lisait « Merci de valider la
     vérification », et cherchait un contrôle absent. Un bloqueur de
     publicités, un DNS filtrant ou un Wi-Fi de commerce suffisent : la
     situation ordinaire d'un client dans une boutique. → `TurnstileGate`,
     extrait plutôt que recopié six fois.

  2. **Quatre écrans qui meurent sur une coupure réseau.** Un drapeau de garde
     resté coincé, et l'écran ne répond plus jamais : `spinningRef` sur la
     roue, `requestingRef` sur les 8 jeux de révélation, `pending` sur les 6
     jeux de défi — celui-là mourait à l'instant précis où le joueur validait
     sa tentative. Et `claimPrize` sans `try/catch` : le gagnant restait sur
     « Enregistrement… » pour toujours, **alors que son lot était déjà
     décrémenté du stock**.

  3. **La carte à gratter affichait « Impossible de jouer » À LA PLACE du lot**
     que le joueur avait à montrer en caisse — elle n'avait reçu ni la garde
     `startedRef` ni la reprise `pendingWinRef` que `game-shell` porte depuis
     le 2026-07-29.

  **CE QUI MENTAIT À L'UTILISATEUR** :

  4. **La caisse ne distinguait pas « vous venez de le remettre » de « il l'a
     déjà eu ».** Même texte ambre, même icône d'avertissement. Le caissier
     qui reprend le poste lisait un refus sur une remise qu'il venait
     d'autoriser, et hésitait à donner le lot devant le client. *Vérifié dans
     l'historique : `state` n'a jamais servi qu'aux erreurs — le défaut
     préexiste au rechargement franc ajouté le matin même.*

  5. **Trois textes disaient trois choses de l'expiration.** Le réglage
     s'appelle « Compte à rebours avant masquage » — il ne masque pas, il
     ARME `redeem_expires_at`, et la caisse refuse ensuite. L'écran renvoyait
     le gagnant vers son email, l'email ne disait pas jusqu'à quand, et le
     commerçant ne savait pas qu'il l'avait décidé.

  6. **Le calendrier promettait un cadeau qui n'a jamais existé.**
     `completion_reward_label` vaut `''` à la création — le réglage PAR
     DÉFAUT. Le joueur qui ouvrait toutes ses cases lisait « Cadeau
     momentanément épuisé, présentez-vous au comptoir » et se déplaçait pour
     rien. Aucune migration : l'absence de libellé EST le signal.

  7. **La chasse au trésor rendait une carte de victoire VIDE.** Terminée sur
     stock épuisé, le joueur voyait « Trésor épuisé » une fois — puis, au
     moindre rechargement, plus rien : ni code, ni message. `huntFull` ne
     vivait que dans l'état client du dernier scan, tandis que `complete` est
     recalculé au serveur et restait vrai.

  8. **Supprimer une campagne détruisait les codes gagnés non retirés.**
     `participations.campaign_id` porte `on delete cascade` (00001:99) :
     le client arrivait au comptoir avec son email et s'entendait répondre
     « code introuvable » — un engagement annulé sans que personne, le
     commerçant compris, ne l'ait décidé. La cascade n'est PAS touchée (la
     retirer donnerait un 23503 opaque) : l'action refuse tant qu'une
     confirmation n'est pas cochée, et **le refus NOMME le nombre de lots**.

- **✅ Le libellé d'un lot émis est figé — ET MA PREUVE DE LA VEILLE ÉTAIT
  FAUSSE (2026-07-31)** — le commerçant qui renommait sa récompense
  réécrivait le nom de tous les lots déjà gagnés et pas encore retirés :
  `upsert_reward_issuance` faisait `label = excluded.label` à chaque
  synchronisation. Le client arrive avec un email qui annonce « Café offert »,
  la caisse affiche « Croissant offert », et rien ne dit lequel fait foi.

  **L'aller-retour vaut d'être consigné.** J'ai écrit ce correctif, je n'ai
  pas su démontrer son effet, et je l'ai RETIRÉ en notant la question
  ouverte : *« le registre est-il seulement alimenté pour les
  participations ? »*. La réponse est oui. Mon test cherchait
  `source_type = 'participation'` alors que la branche participations de
  `sync_reward_issuance` écrit **`'wheel'`**. Aucune ligne ne pouvait
  apparaître : c'était la preuve qui était fausse, pas le mécanisme.

  *Retirer sur une preuve défaillante est moins grave que livrer sans preuve
  — mais c'est la même erreur de méthode, et elle a coûté un aller-retour.*

  **Mesuré, avec contrôle négatif** : à l'émission « Café offert E2E » ;
  après renommage avec le gel, « Café offert E2E » ; **sans** le gel,
  « RENOMMÉ SANS GEL ». Sans ce contrôle, un libellé qui ne bouge pas ne
  dirait rien — peut-être que rien ne le fait bouger.

  **Les gardes de la migration ont servi dès le premier essai** : elle visait
  `sync_reward_issuance`, alors que le motif vit dans
  `upsert_reward_issuance`. Elle a refusé de s'appliquer au lieu d'agir dans
  le vide. La migration se DÉRIVE du catalogue (`pg_get_functiondef` + une
  substitution) au lieu de recopier deux cents lignes qui divergeraient.

  **CLOS LE MÊME JOUR (PR #68)** : la caisse lit désormais le libellé gravé.
  Le registre était DÉJÀ interrogé pour router le code — il remonte aussi son
  nom, et la page le passe en prop aux neuf cartes. Pas neuf lectures de plus,
  donc pas neuf occasions d'en oublier une.

  **Le repli est la partie qui compte** : `frozenLabel` vaut `null` pour un
  code antérieur au registre, et pour une ligne rétro-alimentée au libellé
  vide. L'affichage retombe alors sur la table parente — l'ancien
  comportement, le meilleur disponible pour eux. Sans ce repli, le correctif
  rendait la caisse MUETTE sur tous les anciens lots. Un test le verrouille,
  et le contrôle négatif le distingue des deux autres : neutraliser la lecture
  fait tomber les deux tests de lecture, pas celui du repli.

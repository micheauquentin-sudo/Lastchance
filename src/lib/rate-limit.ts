import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { upstashRateLimit } from "@/lib/upstash";
import { reportError, reportSecurityEvent } from "@/lib/monitoring";

export interface RateLimitRule {
  /** Nombre maximum d'événements autorisés dans la fenêtre. */
  limit: number;
  /** Durée de la fenêtre glissante (fixe) en secondes. */
  windowSeconds: number;
}

/**
 * Règles de limitation par usage. Calibrées pour être invisibles aux
 * utilisateurs légitimes (un joueur tourne la roue une fois) tout en
 * bloquant l'automatisation.
 */
export const RATE_LIMITS = {
  /** Anti double-clic / anti-course : au plus un spin toutes les 4 s
   *  par empreinte joueur (ferme la race sur la limite de jeu). */
  spinBurst: { limit: 1, windowSeconds: 4 },
  /** Débit soutenu par empreinte joueur. */
  spin: { limit: 8, windowSeconds: 60 },
  /** Débit par IP, tous joueurs confondus (drainage de stock, bots). */
  spinIp: { limit: 40, windowSeconds: 60 },
  /** Réclamation d'un gain, par IDENTITÉ DE GAIN — clé propre à un porteur,
   *  donc `failClosed` légitime : la saturer ne coupe que le rejeu de CE gain.
   *  Deux porteurs partagent cette règle, chacun résolu AVANT le seau :
   *  `claim:spin:<spin_id>` (spin_id extrait du jeton de claim vérifié, roue et
   *  tour offert) et `hunt:claim:completion:<completion_id>` (complétion de
   *  chasse résolue par le cookie joueur).
   *
   *  Ce seau était historiquement porté par l'IP SEULE, à portée PLATEFORME
   *  (toutes organisations confondues) et consommé AVANT la vérification du
   *  jeton : un tiers derrière le même CGNAT — ou un abus sur une tout autre
   *  organisation — empêchait des joueurs légitimes d'encaisser leur lot. Voir
   *  `claimIp` pour ce qui reste sur l'IP. 15/60 s laisse la marge des
   *  soumissions successives d'un formulaire (email manquant, CGU non cochées)
   *  tout en bornant le rejeu d'un jeton volé. */
  claim: { limit: 15, windowSeconds: 60 },
  /** PRESSION de réclamation par IP — compteur d'OBSERVABILITÉ, jamais un
   *  refus (clé PARTAGÉE entre utilisateurs : CGNAT, Wi-Fi de commerce, et
   *  portée plateforme). Consommé APRÈS la vérification du jeton, donc un
   *  flot de jetons forgés ne l'allume même pas : ce qu'il mesure, ce sont des
   *  réclamations réellement signées. 600/10 min = 1 req/s en continu, seuil
   *  d'alerte inatteignable pour un commerce réel.
   *
   *  Ne PAS repasser en `failClosed` : c'est le seul mode compatible avec le
   *  principe (aucune clé partagée ne refuse dans un parcours public). Le rejeu
   *  est borné par `claim` sur l'identité du gain, et le gain lui-même par la
   *  transaction `claim_winning_spin` (un spin ne se réclame qu'une fois). */
  claimIp: { limit: 600, windowSeconds: 600 },
  /** Recherche/validation de codes par un compte de caisse. */
  cashier: { limit: 30, windowSeconds: 60 },
  /** Connexions par IP (credential stuffing). */
  authLogin: { limit: 10, windowSeconds: 300 },
  /** Créations de compte par IP (spam d'inscriptions). */
  authSignup: { limit: 5, windowSeconds: 3600 },
  /** Campagnes newsletter envoyées par organisation (anti-spam/abus). */
  newsletterSend: { limit: 5, windowSeconds: 86_400 },
  /** Sonde publique /api/health par IP — FAIL-OPEN, calibré pour des MONITEURS.
   *
   *  Cette route fait deux appels réseau par requête (lecture Supabase bornée +
   *  RPC `ops_workers_health`) : non bornée, elle amplifie n'importe quelle
   *  rafale en charge sur la base. 60/60 s laisse une marge énorme à l'usage
   *  réel — un moniteur d'uptime interroge toutes les 30 à 60 s, et plusieurs
   *  moniteurs plus les sondes de la plateforme restent loin du seuil.
   *
   *  FAIL-OPEN (appel sans `failClosed`), et ce n'est pas négociable : une
   *  panne du backend de rate-limit ferait répondre 429 à tous les moniteurs,
   *  qui déclareraient l'application DOWN. Une sonde de santé qui s'éteint sur
   *  la panne d'un composant tiers ne surveille plus rien. */
  healthIp: { limit: 60, windowSeconds: 60 },
  /** Compteur de scan par QR et IP (anti-inflation des statistiques). */
  scanIp: { limit: 60, windowSeconds: 60 },
  /** PLAFOND PAR IP SEULE de /api/page-opens, tous slugs et tous modules
   *  confondus — consommé AVANT `scanIp`.
   *
   *  POURQUOI IL EXISTE (même défaut que `progressionDevice`) : `scanIp` est
   *  composé avec un identifiant FOURNI PAR LE CLIENT (`?slug=`, `?id=`).
   *  Boucler sur des slugs inventés ouvrait un seau NEUF à chaque tour — 60
   *  req/min chacun, donc un débit borné par rien — et chaque tour coûtait une
   *  écriture de rate-limit (`INCR` Upstash, ou un upsert dans
   *  `public.rate_limits` quand Upstash est absent : une table qui grossit au
   *  rythme de l'attaquant). Tranché AVANT `scanIp`, une rafale saturée
   *  n'écrit plus qu'UNE ligne par fenêtre au lieu d'une par slug inventé.
   *
   *  REFUSER ICI NE FERME RIEN, et c'est ce qui le distingue des seaux
   *  partagés qu'ADR-032 interdit de faire refuser : la route répond 204 dans
   *  TOUS les cas, y compris nominal. Le seul effet d'un refus est une
   *  ouverture non comptée sur un indicateur d'affichage qui ne facture rien,
   *  n'autorise rien et ne garde aucun accès. Il n'y a pas d'expérience à
   *  couper — donc pas d'interrupteur à allumer.
   *
   *  300/60 s = cinq fois le débit par slug : une vitrine dont tous les
   *  visiteurs partagent le Wi-Fi n'en approche pas (une ouverture de page par
   *  visiteur, pas cinq par seconde en continu). */
  pageOpenIp: { limit: 300, windowSeconds: 60 },
  /** Inscriptions par championnat et IP. Le seuil tient compte du Wi-Fi
   *  partagé d'un commerce ; Turnstile reste la première barrière anti-bot. */
  pronoRegisterIp: { limit: 120, windowSeconds: 3600 },
  /** Récupération de lien (demande + confirmation) par championnat. Le seau
   *  bloquant est désormais clé sur l'identité (jeton) ; la clé IP ne sert plus
   *  qu'à l'observabilité (ADR-032) — d'où le nom sans suffixe. */
  pronoRecover: { limit: 10, windowSeconds: 3600 },
  /** Demandes de lien par email ciblé (anti-harcèlement d'une adresse). */
  pronoRecoverEmail: { limit: 3, windowSeconds: 3600 },
  /** Plafond réseau large pour ne pas pénaliser les clients derrière le même NAT. */
  pronoPredictIp: { limit: 300, windowSeconds: 60 },
  /** Débit soutenu par joueur inscrit (une grille complète ≈ 10 requêtes). */
  pronoPredictPlayer: { limit: 40, windowSeconds: 60 },
  /** Synchronisations manuelles du calendrier par utilisateur et organisation. */
  contestSync: { limit: 6, windowSeconds: 300 },
  /** Demandes d'expéditeur SMS par organisation et propriétaire — clé
   *  d'OPÉRATEUR authentifié, résolue avant le seau, donc `failClosed`
   *  légitime (ADR-032). Ce geste engage l'identité commerciale déclarée au
   *  registre AF2M : un commerçant en pose une, éventuellement deux le jour
   *  d'un changement d'enseigne. 5/heure est déjà dix fois l'usage réel, et
   *  borne l'écriture répétée dans `sms_senders` depuis un formulaire. */
  smsSenderRequest: { limit: 5, windowSeconds: 3600 },
  /** Rafraîchissement du mode TV (classement public) par championnat et IP :
   *  un écran légitime interroge toutes les 30 s, la marge couvre plusieurs
   *  écrans derrière la même box. */
  pronoTvIp: { limit: 30, windowSeconds: 60 },
  /** PLAFOND PAR IP SEULE du mode TV, tous championnats confondus — consommé
   *  AVANT `pronoTvIp`, et pour la même raison que `pageOpenIp` : le slug vient
   *  du CLIENT, donc en boucler des inventés ouvrait un seau neuf à chaque
   *  tour et une écriture de rate-limit avec lui.
   *
   *  CE SEAU N'AJOUTE AUCUN INTERRUPTEUR : cette route refuse DÉJÀ sur une clé
   *  composée de l'IP (`pronoTvIp`, 429). La question qu'ADR-032 pose — « un
   *  tiers peut-il fermer ce parcours en saturant une clé partagée ? » — a donc
   *  la même réponse avant et après ; ce plafond ne fait que rendre le coût
   *  d'une rafale indépendant du NOMBRE de slugs essayés. Il reste fail-OPEN
   *  (appel sans `failClosed`), comme le seau qu'il précède : une panne du
   *  backend de rate-limit ne doit pas éteindre les écrans d'une salle.
   *
   *  120/60 s = quatre fois le débit par championnat. Une salle qui affiche
   *  trois championnats sur trois écrans rafraîchis toutes les 30 s produit
   *  ~18 req/min ; la marge couvre l'imprévu sans couvrir le balayage. */
  pronoTvIpCeiling: { limit: 120, windowSeconds: 60 },
  /** Tentatives de code de ligue par championnat — anti-bruteforce des codes
   *  d'invitation (6-8 caractères). Seau bloquant clé sur le joueur ; la clé IP
   *  ne sert plus qu'à l'observabilité (ADR-032) — d'où le nom sans suffixe. */
  pronoLeagueJoin: { limit: 10, windowSeconds: 600 },
  /** Créations de ligue par joueur inscrit (le plafond dur est de
   *  200 ligues par championnat, appliqué par la RPC). */
  pronoLeagueCreatePlayer: { limit: 5, windowSeconds: 3600 },
  /** PRESSION du tampon de chasse par IP, tous joueurs confondus — compteur
   *  d'OBSERVABILITÉ sur clé PARTAGÉE, jamais un refus (cf. `observeSharedKey`).
   *  Consommé APRÈS la résolution du cookie joueur et son seau d'identité
   *  `huntScanPlayer` : la clé IP (Wi-Fi partagé d'un mall/festival, ~50 joueurs
   *  actifs) ne peut donc plus devenir un interrupteur — un bot mono-IP à faible
   *  débit ne bloque plus le tampon de tous les joueurs d'un lieu. La vraie
   *  barrière anti-abus est ailleurs : entropie des jetons (32^16) + seau par
   *  cookie `huntScanPlayer` + cap de stock obligatoire sur le lot. À 200/10 min
   *  le dépassement signale un débit mono-IP anormal, il ne ferme rien. Ne PAS
   *  repasser en `failClosed`. */
  huntScanIp: { limit: 200, windowSeconds: 600 },
  /** PRESSION de la PAGE d'étape (`loadHuntStepContext`) par chasse et IP —
   *  même forme et même calibrage que `huntScanIp`, et pour la même raison :
   *  c'est le même lieu, le même Wi-Fi, le même ordre de grandeur de visiteurs.
   *  Compteur d'OBSERVABILITÉ, fail-OPEN, jamais un refus.
   *
   *  POURQUOI IL EXISTE : cette page est le chemin le moins cher vers des
   *  lectures `service_role`, et le seul du module qui n'était borné par rien —
   *  quatre chantiers l'ont consigné « non borné » sans rien poser, en
   *  concluant de « aucune clé ne peut porter un REFUS » à « rien à faire ».
   *  C'est un saut : ADR-032 ne proscrit pas la clé IP, elle proscrit qu'on
   *  REFUSE dessus, et prescrit exactement ce compteur-ci à la place.
   *  L'amplification passe par le chemin SANS cookie ; l'IP est la seule clé
   *  qui l'observe sans que l'appelant puisse la choisir.
   *
   *  Seau DISTINCT de `huntScanIp` et non partagé avec lui : `stampHuntStep`
   *  traverse ce chargeur avant de tamponner, les fondre ferait compter deux
   *  fois un même geste et rendrait les deux signaux illisibles. Le rapport
   *  entre les deux est d'ailleurs l'information utile — beaucoup de pages pour
   *  peu de tampons, c'est un balayage ; l'inverse n'existe pas.
   *
   *  Ne PAS repasser en `failClosed` : le jeton d'étape est imprimé sur un QR
   *  de vitrine, un refus assis sur l'IP fermerait la chasse à tous les clients
   *  d'un même lieu — l'interrupteur qu'ADR-032 interdit. */
  huntStepIp: { limit: 200, windowSeconds: 600 },
  /** Tampons par empreinte joueur (cookie/hash) — clé propre à UNE identité,
   *  donc `failClosed` légitime : la saturer ne coupe que son porteur. Débit
   *  soutenu ; les re-scans sont idempotents côté RPC. */
  huntScanPlayer: { limit: 30, windowSeconds: 3600 },
  /** RESTITUTION du code d'une chasse close (`loadHuntRecallContext`), par
   *  empreinte joueur. Un REFUS assis sur le jeton d'étape ou sur l'IP serait au
   *  contraire un interrupteur : la carte de victoire de tous les joueurs d'un
   *  même lieu, fermée par un seul abuseur (ADR-032). C'est bien le REFUS qui
   *  est proscrit sur ces clés, et non les clés elles-mêmes — la pression par
   *  IP est désormais COMPTÉE, fail-open, par `huntRecallIp` ci-dessous.
   *
   *  ⚠️ CE SEAU NE BORNE PAS UN DÉBIT, et l'affirmer serait faux : sa clé
   *  contient le sha256 de la VALEUR du cookie de chasse. Ce cookie est
   *  `httpOnly` — caché à JavaScript, PAS à l'utilisateur, qui lit son nom dans
   *  les outils de développement et peut en changer la valeur à chaque requête.
   *  Les deux gardes de cookie amont passent alors (elles ne regardent que le
   *  NOM), le hash est neuf à chaque coup, et aucun seau ne se remplit jamais.
   *  Une version antérieure de ce commentaire annonçait ici qu'« un script en
   *  atteint le plafond en quelques secondes » : c'est vrai d'un seau sur une
   *  identité imposée, jamais d'un seau sur une valeur que l'appelant choisit.
   *
   *  Ce qu'il borne réellement : un porteur COOPÉRATIF — l'onglet laissé ouvert
   *  qui recharge, le partage d'écran, le réseau capricieux. 60 par 10 minutes
   *  laisse un joueur relire sa carte de victoire sans jamais s'en approcher.
   *  Il est délibérément conservé à ce titre — et le débit qu'il ne borne pas
   *  est désormais MESURÉ un cran au-dessus (`huntRecallIp`), plutôt que laissé
   *  invisible comme il l'a été quatre chantiers durant. La vraie borne du
   *  chemin, elle, reste
   *  ailleurs : les deux gardes de cookie qui coûtent zéro puis une requête,
   *  l'exigence d'une complétion déjà acquise, et le fait que ce chargeur
   *  n'écrit rien. À titre de comparaison, `loadHuntStepContext` sert la MÊME
   *  page publique pour TROIS lectures `service_role` sans cookie, QUATRE avec
   *  un cookie qui ne désigne aucun joueur, SIX pour un joueur réel — chiffres
   *  MESURÉS (`hunt-context.test.ts` les compte table par table), et non les
   *  « ~4 » que ce commentaire annonçait de mémoire. Ce chemin-là ne refuse
   *  rien non plus ; il porte désormais `huntStepIp`, le compteur ci-dessus.
   *  Un attaquant n'obtient donc ici rien qu'il n'ait déjà par là.
   *
   *  `failClosed: false` à l'appel, seule exception du dépôt sur clé
   *  d'identité — le motif est écrit dans `loadHuntRecallContext`. */
  huntRecall: { limit: 60, windowSeconds: 600 },
  /** PRESSION de la RESTITUTION (`loadHuntRecallContext`) par chasse et IP —
   *  compteur d'OBSERVABILITÉ, fail-OPEN, jamais un refus.
   *
   *  POURQUOI IL EXISTE : `huntRecall` ci-dessus ne borne pas un débit (sa clé
   *  est une valeur que l'appelant choisit), et quatre chantiers ont conclu de
   *  là qu'il n'y avait « rien à poser ». C'est le même saut qu'ADR-073 démonte
   *  sur la page d'étape : ADR-032 proscrit de REFUSER sur une clé partagée,
   *  elle PRESCRIT à sa place un seau large et fail-open. Le porteur qui fait
   *  tourner son cookie change de seau `huntRecall` à chaque requête ; il ne
   *  change pas d'IP, et c'est la seule clé de ce chemin qu'il ne choisit pas.
   *
   *  SEAU DISTINCT DE `huntStepIp`, et c'est le point délicat : les DEUX
   *  chargeurs servent la MÊME requête de la MÊME page — `loadHuntRecallContext`
   *  ne s'exécute que lorsque `loadHuntStepContext` a refusé, or celui-ci a déjà
   *  consommé `huntStepIp` (son compteur siège avant le refus de statut/fenêtre).
   *  Réutiliser la même clé compterait donc UN passage pour DEUX, exactement la
   *  raison qui tient `huntStepIp` séparé de `huntScanIp`. Séparés, le rapport
   *  entre les deux est l'information utile : la part du trafic d'une chasse qui
   *  retombe sur le repli — celui qui, lui, refait toutes les lectures.
   *
   *  CALIBRAGE DÉRIVÉ, ET NON INVENTÉ : identique à `huntStepIp` parce que les
   *  requêtes comptées ici en sont un SOUS-ENSEMBLE STRICT. Au même seuil, ce
   *  compteur ne peut donc s'allumer que si la quasi-totalité de la pression
   *  d'une chasse passe par le repli — une forme qu'un commerce réel ne produit
   *  pas, puisqu'il faudrait que ses visiteurs portent tous le cookie d'une
   *  chasse close. Un chiffre propre demanderait un trafic réel à mesurer ; il
   *  n'y en a pas.
   *
   *  Ne PAS repasser en `failClosed` : ce serait l'interrupteur d'ADR-032 sur la
   *  seule page qui rend son code à un gagnant dont la chasse est close — et le
   *  `failClosed: false` de `huntRecall` deviendrait sans objet. */
  huntRecallIp: { limit: 200, windowSeconds: 600 },
  /** PRESSION du parcours public de fidélité par programme et IP — compteur
   *  d'OBSERVABILITÉ, jamais un refus.
   *
   *  PRINCIPE (voir aussi huntScanIp) : dans un parcours PUBLIC, aucune clé
   *  PARTAGÉE entre utilisateurs (IP, programme, organisation) ne porte de seau
   *  fail-closed. Une clé partagée saturée par un tiers devient un interrupteur
   *  : « déni d'inscription d'un programme entier », « interrupteur permanent à
   *  0,1 req/s ». Ce seau-ci est donc consulté SANS agir sur son verdict : le
   *  dépassement émet `reportSecurityEvent` (loyalty_public_pressure) et rien
   *  d'autre. À 1200/10 min il faut tenir 2 req/s en continu pour l'allumer :
   *  c'est un seuil d'alerte, pas une porte.
   *
   *  Ne PAS repasser ce seau en `failClosed`, ne PAS le resserrer : le contrôle
   *  d'abus du module repose désormais sur les VERROUS ÉCONOMIQUES en base
   *  (stock fini obligatoire sur tout lot, palier à la visite 2 minimum), qui
   *  rendent une identité fabriquée sans valeur. */
  loyaltyStampIp: { limit: 1200, windowSeconds: 600 },
  /** PRESSION de la PAGE publique d'un QR de commande (`loadOrderCodeContext`,
   *  /commande/[token]) par programme et IP — compteur d'OBSERVABILITÉ,
   *  fail-OPEN, jamais un refus.
   *
   *  POURQUOI IL EXISTE : c'est le SEUL chargeur public du module qui n'était
   *  borné par rien — la page n'est pas `monitored`, `resolveOrderCode` ne
   *  consomme aucun seau, si bien qu'une boucle de GET sur /commande restait
   *  totalement invisible à la supervision. C'est la forme EXACTE de
   *  `loadHuntStepContext` : page publique `force-dynamic`, clé = jeton choisi
   *  par l'appelant, lectures `service_role`.
   *
   *  CALIBRAGE REPRIS de `huntStepIp` (200/600 s), et non inventé : même forme
   *  (une page publique dont l'entrée est un jeton, comptée APRÈS résolution),
   *  même ordre de grandeur de visiteurs par IP. À la différence de
   *  `loyaltyStampIp`, qui compte des ACTIONS de tampon (scopes stamp/checkin/
   *  spin/order), celui-ci compte des CHARGEMENTS DE PAGE — d'où un seau
   *  distinct, sans quoi le rapport page/tampon deviendrait illisible.
   *
   *  Ne PAS repasser en `failClosed` : le jeton de commande est choisi par
   *  l'appelant (seau neuf à chaque essai) et l'IP est l'interrupteur qu'ADR-032
   *  proscrit sur une clé partagée d'un parcours public. */
  loyaltyOrderPageIp: { limit: 200, windowSeconds: 600 },
  /** PRESSION de l'INVITATION au passeport après un jeu (`invitationPasseport`)
   *  par organisation et IP — compteur d'OBSERVABILITÉ, fail-OPEN, jamais un
   *  refus. Clé PARTAGÉE (organisation, IP) ⇒ le mode est dicté, pas choisi :
   *  ADR-032 proscrit le `failClosed` ici, un tiers en ferait l'interrupteur du
   *  panneau post-jeu de tout un commerce.
   *
   *  SEAU DISTINCT de `loyaltyStampIp`, pour la raison qui sépare `huntStepIp`
   *  de `huntRecallIp` : les deux chemins ne comptent pas la même chose. Celui-ci
   *  compte des invitations AFFICHÉES (une par fin de partie, aucune écriture,
   *  aucun tampon) ; l'autre compte des tentatives de tampon. Mêlés, le rapport
   *  entre « on a proposé » et « on a tamponné » — la seule mesure utile de ce
   *  panneau — deviendrait illisible.
   *
   *  CALIBRAGE REPRIS de `loyaltyStampIp` (1200/10 min), et non inventé : le
   *  chemin est strictement moins coûteux (UNE lecture bornée, jamais d'écrit)
   *  et son débit naturel est celui des fins de partie, déjà bornées par les
   *  seaux du jeu joué en amont. À 2 req/s soutenues, c'est un seuil d'alerte.
   *  Ne PAS resserrer : ce panneau ne fait pas gagner de récompense. */
  loyaltyInvite: { limit: 1200, windowSeconds: 600 },
  /** Tampons/consommations par PASSEPORT (programme + hash du cookie) — clé
   *  propre à UNE identité, donc `failClosed` légitime : la saturer ne coupe
   *  que son porteur. Débit soutenu ; le cooldown serveur (min_stamp_interval,
   *  >= 300 s) reste la borne métier. */
  loyaltyStampMember: { limit: 30, windowSeconds: 3600 },
  /** Jetons de check-in signés par passeport (mode caisse), clé d'identité.
   *  L'écran joueur renouvelle son QR ~30 s avant l'échéance d'une TTL de
   *  3 min, soit ~24/h pour une carte laissée ouverte, plus les reprises sur
   *  retour d'onglet : 120/h laisse 5x de marge tout en bornant une boucle de
   *  signature HMAC. */
  loyaltyCheckinMember: { limit: 120, windowSeconds: 3600 },
  /** ÉVALUATIONS de code tournant par passeport (programme + hash du cookie).
   *  Clé d'identité → `failClosed`. Atomique par construction (`rateLimit`
   *  incrémente et tranche dans le même appel) — contrairement à un compteur
   *  d'échecs lu puis écrit, qu'une rafale concurrente traverse en lisant
   *  toutes `count = 0`.
   *
   *  Compte les TENTATIVES et non les échecs : c'est le prix de l'atomicité, et
   *  il ne coûte rien au client légitime — le cooldown en base vaut au moins
   *  300 s, donc un passeport n'a jamais besoin de plus d'un code accepté par
   *  fenêtre ; 6 laisse la marge des fautes de frappe. */
  loyaltyStampCodeMember: { limit: 6, windowSeconds: 300 },
  /** ÉVALUATIONS d'un QR DE COMMANDE par passeport (programme + hash du
   *  cookie). Clé d'IDENTITÉ → `failClosed` légitime : la saturer ne coupe que
   *  son porteur.
   *
   *  CALIBRAGE REPRIS de `loyaltyStampCodeMember` (6/300 s) — même clé, même
   *  geste, et surtout même prix de l'atomicité : `rateLimit` compte les
   *  TENTATIVES, pas les échecs.
   *
   *  6 n'est pas le report machinal du voisin, parce que le raisonnement qui le
   *  justifie là-bas ne vaut PAS ici : le tampon de commande CONTOURNE
   *  `min_stamp_interval_seconds` (décision produit — deux commandes le même
   *  jour sont deux visites légitimes), donc l'argument « le cooldown vaut
   *  300 s, un passeport n'a jamais besoin de plus d'un succès par fenêtre »
   *  tombe. Ce qui borne réellement ici, c'est l'usage unique du jeton
   *  (`consumed_at`) : chaque succès brûle un QR imprimé par le commerçant, et
   *  un client qui rattrape trois livraisons en retard fait trois scans. 6 par
   *  5 minutes couvre ce cas avec le double de marge, tout en bornant le
   *  balayage de jetons voisins depuis un même passeport.
   *
   *  Ne PAS le porter sur le JETON ni sur l'IP : le jeton est choisi par
   *  l'appelant (seau neuf à chaque essai, donc inutile), et l'IP est l'
   *  interrupteur qu'ADR-032 proscrit — la pression par IP est comptée
   *  fail-open par `loyaltyStampIp`, comme le reste du parcours public. */
  loyaltyStampOrder: { limit: 6, windowSeconds: 300 },
  /** ÉMISSIONS de QR de commande par OPÉRATEUR (organisation + user.id) — clé
   *  d'opérateur AUTHENTIFIÉ, résolue avant le seau, donc `failClosed`
   *  légitime au sens de l'ADR-032 : la saturer ne coupe que son porteur.
   *
   *  30/heure, chaque appel émettant au plus 100 codes (borne du schéma Zod) :
   *  3000 étiquettes par heure et par opérateur, soit très au-delà de ce
   *  qu'une préparation de commandes produit, et très en deçà de ce qui
   *  ferait grossir la table à vue d'œil. C'est le nombre d'APPELS qui est
   *  borné ici, la taille du lot l'étant par le schéma — les deux sont
   *  nécessaires, aucun ne remplace l'autre. */
  loyaltyOrderCodeIssue: { limit: 30, windowSeconds: 3600 },
  /** CRÉATIONS RÉELLES de passeport par programme (clé partagée) — compteur
   *  d'OBSERVABILITÉ pur, jamais un refus. Consommé UNIQUEMENT après un retour
   *  `is_new_member = true` de record_loyalty_stamp : un code invalide, un
   *  `too_soon` ou un programme fermé ne le touchent jamais, donc personne ne
   *  peut drainer le « budget d'inscription » des vrais nouveaux clients.
   *  60/10 min = seuil d'alerte (un commerce réel inscrit quelques clients
   *  par heure, une inauguration passe sans rien couper). */
  loyaltyPassportCreationBurst: { limit: 60, windowSeconds: 600 },
  /** CRÉATIONS RÉELLES de passeport par OPÉRATEUR de caisse (organisation +
   *  user.id) — clé non partagée, mais compteur d'observabilité : on alerte,
   *  on n'étrangle pas (un jour d'ouverture inscrit beaucoup de nouveaux
   *  clients, et une caisse bridée est une caisse en panne). Consommé
   *  uniquement sur `is_new_member = true`. Le débit du poste reste borné par
   *  `cashier` (30/60 s), lui fail-closed sur la même clé d'opérateur. */
  loyaltyStaffPassportCreation: { limit: 120, windowSeconds: 3600 },
  /** Seau JUMEAU du précédent : visites de clients DÉJÀ CONNUS servies par le
   *  même opérateur, même fenêtre et même limite. Le rapport entre les deux
   *  clés EST le signal remonté à l'exploitant : une caisse normale voit
   *  surtout des clients connus, une frappe n'inscrit que des inconnus. */
  loyaltyStaffKnownVisit: { limit: 120, windowSeconds: 3600 },
  /** Lecture du code tournant au comptoir par membre et programme — un écran
   *  légitime interroge toutes les quelques secondes ; marge confortable. */
  loyaltyCounter: { limit: 60, windowSeconds: 60 },
  /** PRESSION du parcours public de jackpot par campagne et IP — compteur
   *  d'OBSERVABILITÉ, jamais un refus (miroir loyaltyStampIp).
   *
   *  PRINCIPE (ADR-032) : la jauge du jackpot est une clé PARTAGÉE — la remplir
   *  vite est un OBJECTIF, pas un abus. Aucun seau fail-closed ne porte sur la
   *  campagne, sans quoi un tiers en ferait un interrupteur (« déni de
   *  participation d'un lieu entier »). La borne réelle contre le gonflage est
   *  l'anti-triche (code tournant / staff) + le cooldown + le stock FINI, pas
   *  ce compteur. À 1200/10 min il faut tenir 2 req/s en continu pour l'allumer
   *  : c'est un seuil d'alerte, pas une porte. Ne PAS repasser en `failClosed`. */
  jackpotParticipateIp: { limit: 1200, windowSeconds: 600 },
  /** Participations par JOUEUR (campagne + hash du cookie) — clé propre à UNE
   *  identité, donc `failClosed` légitime : la saturer ne coupe que son
   *  porteur. Le cooldown serveur (min_participation_interval, >= 300 s) reste
   *  la borne métier. */
  jackpotParticipateMember: { limit: 30, windowSeconds: 3600 },
  /** ÉVALUATIONS de code tournant par joueur (campagne + hash du cookie). Clé
   *  d'identité → `failClosed`. Compte les TENTATIVES (prix de l'atomicité) ;
   *  le cooldown en base valant >= 300 s, un joueur n'a jamais besoin de plus
   *  d'un code accepté par fenêtre, 6 laisse la marge des fautes de frappe. */
  jackpotParticipateCodeMember: { limit: 6, windowSeconds: 300 },
  /** Jetons de check-in signés par joueur (mode staff), clé d'identité. Miroir
   *  loyaltyCheckinMember : ~24/h pour une carte laissée ouverte, 120/h laisse
   *  5x de marge tout en bornant une boucle de signature HMAC. */
  jackpotCheckinMember: { limit: 120, windowSeconds: 3600 },
  /** CRÉATIONS RÉELLES de joueur par campagne (clé partagée) — compteur
   *  d'OBSERVABILITÉ pur, jamais un refus. Consommé UNIQUEMENT après un retour
   *  `is_new_player = true` : un code invalide, un `too_soon` ou une campagne
   *  fermée ne le touchent jamais. Contrairement à la fidélité, fabriquer des
   *  joueurs n'a AUCUN rendement ici (un seul gagnant par cycle), ce compteur
   *  n'est donc qu'un signal d'exploitation, pas une défense. */
  jackpotNewPlayerBurst: { limit: 60, windowSeconds: 600 },
  /** CRÉATIONS RÉELLES de joueur par OPÉRATEUR de caisse (organisation +
   *  user.id) — clé non partagée, mais compteur d'observabilité : on alerte, on
   *  n'étrangle pas. Le débit du poste reste borné par `cashier` (fail-closed,
   *  même clé d'opérateur). */
  jackpotStaffPlayerCreation: { limit: 120, windowSeconds: 3600 },
  /** Lecture du code tournant au comptoir par membre et campagne — un écran
   *  légitime interroge toutes les quelques secondes ; marge confortable. */
  jackpotCounter: { limit: 60, windowSeconds: 60 },
  /** SONDAGE de la jauge publique par campagne et IP — compteur
   *  d'OBSERVABILITÉ, jamais un refus (ADR-032, comme tous les seaux à clé
   *  partagée de ce module).
   *
   *  POURQUOI UN SEAU À PART, et non `jackpotParticipateIp` : un sondage n'est
   *  pas une participation. Trente écrans laissés ouverts dans un lieu
   *  produisent un débit de LECTURE parfaitement normal qui, versé dans le seau
   *  des participations, en aurait fait dépasser le seuil sans qu'une seule
   *  participation ait eu lieu — l'alerte d'abus de la jauge se serait noyée
   *  dans le bruit des écrans, exactement là où elle doit rester lisible.
   *
   *  Plus généreux que le seau de participation, et c'est cohérent : lire ne
   *  fait rien avancer. À 3000/10 min (~5 req/s en continu depuis une même IP)
   *  le seuil reste un signal, pas une porte. Ne PAS repasser en `failClosed`. */
  jackpotStateIp: { limit: 3000, windowSeconds: 600 },
  /** PRESSION du parcours public d'un événement par session et IP — compteur
   *  d'OBSERVABILITÉ, jamais un refus (miroir jackpotParticipateIp).
   *
   *  PRINCIPE (ADR-032) : join/submit sont servis derrière le Wi-Fi PARTAGÉ d'un
   *  bar — l'IP est commune à tous les joueurs. Aucun seau fail-closed ne porte
   *  sur cette clé partagée, sans quoi un tiers en ferait un interrupteur (« déni
   *  de participation d'une soirée entière »). La borne d'abus est l'identité
   *  cookie (token_hash) + les contraintes d'unicité SQL (un joueur par session,
   *  une réponse par question). À 3000/10 min (un quiz de bar, ~200 joueurs qui
   *  répondent à chaque question) le seuil reste un signal, pas une porte. Ne PAS
   *  repasser en `failClosed`. */
  eventPublicIp: { limit: 3000, windowSeconds: 600 },
  /** Actions du parcours joueur par JOUEUR (session + hash du cookie) — clé
   *  propre à UNE identité, donc `failClosed` légitime : la saturer ne coupe que
   *  son porteur. Couvre join et submit ; l'unicité SQL (un joueur/session, une
   *  réponse/question) reste la vraie borne métier. Généreux : un joueur clique
   *  plusieurs fois par question. */
  eventPlayerAction: { limit: 60, windowSeconds: 60 },
  /** Pilotage de la télécommande par OPÉRATEUR (organisation + user.id) — clé
   *  d'opérateur authentifié, jamais partagée : `failClosed` légitime. Une
   *  soirée enchaîne lancement/verrou/révélation/classement par question ; 240/60 s
   *  laisse une marge large sans jamais brider un animateur. */
  eventRemote: { limit: 240, windowSeconds: 60 },
  /** PRESSION du parcours public d'un calendrier par calendrier et IP — compteur
   *  d'OBSERVABILITÉ, jamais un refus (miroir eventPublicIp).
   *
   *  PRINCIPE (ADR-032) : join/open sont servis à des joueurs qui ouvrent leur
   *  case DE CHEZ EUX comme depuis un même Wi-Fi / CGNAT partagé — l'IP est
   *  commune à tous. Aucun seau fail-closed ne porte sur cette clé partagée, sans
   *  quoi un tiers en ferait un interrupteur (« déni d'ouverture d'un calendrier
   *  entier »). La borne d'abus est l'identité cookie (token_hash) + les
   *  contraintes d'unicité SQL (un joueur par calendrier, une ouverture par jour)
   *  + le gating TEMPOREL serveur et le stock FINI du lot. À 1200/10 min le seuil
   *  reste un signal, pas une porte. Ne PAS repasser en `failClosed`. */
  calendarPublicIp: { limit: 1200, windowSeconds: 600 },
  /** Actions du parcours joueur par JOUEUR (calendrier + hash du cookie) — clé
   *  propre à UNE identité, donc `failClosed` légitime : la saturer ne coupe que
   *  son porteur. Couvre join / open / consume ; l'unicité SQL (un joueur par
   *  calendrier, une ouverture par jour) et le gating temporel restent la vraie
   *  borne métier. Généreux : un joueur clique plusieurs fois. */
  calendarPlayerAction: { limit: 60, windowSeconds: 60 },
  /** PRESSION du parcours public de parrainage par campagne et IP — compteur
   *  d'OBSERVABILITÉ, jamais un refus (miroir calendarPublicIp).
   *
   *  PRINCIPE (ADR-032) : le parrainage vit sur la roue publique (play/[slug]),
   *  servie derrière le Wi-Fi / CGNAT PARTAGÉ d'un commerce — l'IP est commune à
   *  tous les joueurs. Aucun seau fail-closed ne porte sur cette clé partagée,
   *  sans quoi un tiers en ferait un interrupteur (« déni de parrainage d'une
   *  campagne entière »). La borne d'abus est l'identité device (anonymousPlayerKey)
   *  + les contraintes d'unicité SQL (un parrain par device, un filleul par device,
   *  une preuve = un filleul) + le spin RÉEL exigé comme preuve + le stock FINI des
   *  lots. À 1200/10 min le seuil reste un signal, pas une porte. Ne PAS repasser
   *  en `failClosed`. */
  referralPublicIp: { limit: 1200, windowSeconds: 600 },
  /** Actions du parcours joueur par DEVICE (campagne + clé device) — clé propre à
   *  UNE identité (anonymousPlayerKey, hash SHA-256 sans PII), donc `failClosed`
   *  légitime : la saturer ne coupe que son porteur. Couvre ensure / validate /
   *  consume ; l'unicité SQL (un parrain/filleul par device, une preuve = un
   *  filleul) et le plafond/période du programme restent la vraie borne métier.
   *  Généreux : un joueur clique plusieurs fois. */
  referralPlayerAction: { limit: 60, windowSeconds: 60 },
  /** PRESSION du parcours public d'un quiz par quiz et IP — compteur
   *  d'OBSERVABILITÉ, jamais un refus (miroir eventPublicIp / calendarPublicIp).
   *
   *  PRINCIPE (ADR-032) : join / start / submit / finish sont servis derrière le
   *  Wi-Fi ou le CGNAT PARTAGÉ d'un restaurant, d'une cave, d'un musée — l'IP est
   *  commune à tous les joueurs. Aucun seau fail-closed ne porte sur cette clé
   *  partagée, sans quoi un tiers en ferait un interrupteur (« déni de
   *  participation d'un quiz entier »). La borne d'abus est l'identité cookie
   *  (token_hash) + les invariants SQL : une réponse par (joueur, question),
   *  IMMUABLE (trigger de gel), un joueur par quiz, chronomètre serveur
   *  inforgeable et stock FINI du lot. À 3000/10 min (un quiz de salle, ~200
   *  joueurs qui répondent à chaque question) le seuil reste un signal, pas une
   *  porte. Ne PAS repasser en `failClosed`. */
  quizPublicIp: { limit: 3000, windowSeconds: 600 },
  /** Actions du parcours joueur par JOUEUR (quiz + hash du cookie) — clé propre à
   *  UNE identité, donc `failClosed` légitime : la saturer ne coupe que son
   *  porteur. Couvre join / start / submit / finish / consume ; l'unicité SQL (un
   *  joueur par quiz, une réponse par question) et le chronomètre serveur restent
   *  la vraie borne métier. Généreux : un joueur enchaîne présentation puis
   *  réponse pour chaque question. */
  quizPlayerAction: { limit: 60, windowSeconds: 60 },
  /** PRESSION du parcours de méta-progression par organisation et IP — compteur
   *  d'OBSERVABILITÉ, jamais un refus (miroir quizPublicIp / referralPublicIp).
   *
   *  PRINCIPE (ADR-032) : la progression se lit depuis la page joueur d'une
   *  expérience quelconque, derrière le Wi-Fi ou le CGNAT PARTAGÉ d'un commerce
   *  — l'IP est commune à tous. Aucun seau fail-closed ne porte sur cette clé
   *  partagée (ici l'ORGANISATION, encore plus large qu'une campagne), sans quoi
   *  un tiers en ferait un interrupteur (« déni de progression de tous les
   *  joueurs d'une enseigne »). La borne d'abus est ailleurs : l'identité device
   *  (cookie `lc-player`, hash salé), l'appartenance obligatoire du joueur à
   *  l'organisation, et surtout le fait que RIEN ici n'est monétaire — un coffre
   *  ne rend qu'un objet de collection, jamais un code de caisse. Ne PAS
   *  repasser en `failClosed`. */
  progressionPublicIp: { limit: 1200, windowSeconds: 600 },
  /** Actions de progression par DEVICE (organisation + hash du cookie
   *  `lc-player`) — clé propre à UNE identité, donc `failClosed` légitime : la
   *  saturer ne coupe que son porteur. Couvre la lecture du tableau de bord
   *  joueur et l'ouverture de coffre ; le solde de clés (débit atomique sous
   *  verrou) et l'idempotence par `request_id` restent la vraie borne. */
  progressionPlayerAction: { limit: 60, windowSeconds: 60 },
  /** PLAFOND GLOBAL d'un cookie `lc-player`, toutes organisations confondues —
   *  clé d'IDENTITÉ pure (le hash salé du cookie, SANS `organization_id`), donc
   *  `failClosed` légitime au sens de l'ADR-032 : la saturer ne coupe que son
   *  porteur.
   *
   *  POURQUOI IL EXISTE : `progressionPlayerAction` est composé avec l'id
   *  d'organisation FOURNI PAR LE CLIENT. Avec un seul cookie valide (obtenu en
   *  scannant n'importe quel QR), boucler sur des UUID d'organisation aléatoires
   *  ouvrait un seau NEUF à chaque tour — 60 req/min chacun, donc un débit qui
   *  n'était borné par rien, chaque requête coûtant une écriture de rate-limit
   *  (`INCR` Upstash, ou un upsert dans `public.rate_limits` quand Upstash est
   *  absent ou en panne : une table qui grossit au rythme de l'attaquant) plus un
   *  `select` sur `organizations`. Ce seau est tranché AVANT celui par
   *  organisation, donc une rafale saturée n'écrit plus rien d'autre.
   *
   *  120/60 s = deux fois le débit par organisation : un joueur légitime, même
   *  porteur d'une progression dans plusieurs enseignes, ne s'en approche jamais
   *  (il lit son panneau à l'ouverture d'une page et clique quelques coffres). */
  progressionDevice: { limit: 120, windowSeconds: 60 },
  /** PLAFOND GLOBAL d'un cookie `lc-player` sur le parcours Réserver, toutes
   *  organisations confondues — clé d'IDENTITÉ pure (l'empreinte salée du
   *  cookie, SANS `organization_id`), donc `failClosed` légitime (ADR-032) : la
   *  saturer ne coupe que son porteur.
   *
   *  POURQUOI IL EXISTE, ET POURQUOI IL EST TRANCHÉ EN PREMIER (motif
   *  `progressionDevice` / `pageOpenIp`) : `reserverPlayerAction` est composé
   *  avec un `organization_id` FOURNI PAR LE CLIENT. Avec un seul cookie valide,
   *  boucler sur des UUID d'organisation inventés ouvrirait un seau NEUF à
   *  chaque tour — donc un débit borné par rien, chaque tour coûtant une
   *  écriture de rate-limit. Tranché AVANT le seau par organisation, une rafale
   *  saturée n'écrit plus rien d'autre.
   *
   *  60/60 s : réserver, annuler et relire ses places sont des gestes rares. */
  reserverDevice: { limit: 60, windowSeconds: 60 },
  /** Actions du parcours Réserver par JOUEUR (organisation + empreinte du
   *  cookie) — clé propre à UNE identité, donc `failClosed` légitime. Couvre
   *  réserver / annuler / relire. La vraie borne métier reste l'index unique
   *  partiel (une identité, une place vivante par créneau) et la capacité comptée
   *  sous verrou : frapper des cookies ne crée aucune place supplémentaire. */
  reserverPlayerAction: { limit: 30, windowSeconds: 60 },
  /** SCRUTIN de la file d'accueil par le JOUEUR — clé d'IDENTITÉ pure
   *  (l'empreinte du cookie `lc-player`, SANS identifiant de file), donc
   *  `failClosed` légitime (ADR-032) : la saturer ne coupe que son porteur.
   *
   *  SÉRIE DISTINCTE DE `reserverDevice`, ET C'EST TOUT SON OBJET. L'écran de
   *  file relit son rang toutes les cinq secondes — 12 tics par minute, ×2 si le
   *  client a laissé un second onglet ouvert. Partagé avec les GESTES, ce débit
   *  mangeait les 60/min de `reserverDevice` en quelques minutes, et le premier
   *  refus tombait sur `queueLeave` : quelqu'un debout au comptoir ne pouvait
   *  plus quitter la file parce qu'il l'avait trop REGARDÉE. Une lecture qui
   *  n'écrit rien ne doit pas dépenser le budget d'un geste qui écrit.
   *
   *  120/60 s = dix fois la cadence d'un écran, quatre fois celle de deux
   *  onglets : large par construction, puisqu'il ne borne qu'une lecture dont le
   *  refus se traduit par « ce tic n'a rien rapporté » — l'écran garde son rang.
   *  La clé n'est PAS composée avec l'identifiant de file : il vient de
   *  l'appelant, et boucler dessus ouvrirait un seau neuf à chaque tour (motif
   *  `progressionDevice`, wagon 7). */
  reserverQueueRead: { limit: 120, windowSeconds: 60 },
  /** CADENCE de l'écran d'accueil du COMPTOIR (`getQueueStaffState`) par
   *  organisation et OPÉRATEUR authentifié — motif de clé `cashier:lookup`, et
   *  `failClosed` légitime pour la même raison : `user.id` est propre à une
   *  personne, la saturer ne coupe qu'elle (ADR-032).
   *
   *  POURQUOI IL EXISTE : c'est le seul chemin du module qu'un écran rappelle
   *  toutes les cinq secondes ET dont la RPC recompose les rangs de la file
   *  entière à chaque tic. Sans borne, un onglet laissé en boucle — ou un script
   *  muni d'une session de caissier — tenait ce coût indéfiniment, invisible en
   *  supervision. Le dépassement est REPORTÉ (`reserver_queue_staff_cadence`) :
   *  le seau ne se contente pas de freiner, il le dit.
   *
   *  40/60 s : un écran consomme 12 tics par minute, deux consoles ouvertes sur
   *  le même compte en consomment 24 — les deux passent. Une boucle emballée,
   *  elle, est freinée, et son refus est bénin (l'action rend `null`, l'écran
   *  garde ce qu'il montrait). */
  reserverQueueStaffState: { limit: 40, windowSeconds: 60 },
  /** PLAFOND PAR IP SEULE du parcours Réserver, toutes organisations confondues
   *  — compteur d'OBSERVABILITÉ, jamais un refus, et consommé AVANT le compteur
   *  par organisation (motif `pronoTvIpCeiling`, wagon 7). Son rôle est de rendre
   *  visible une rafale qui boucle sur des organisations inventées : le compteur
   *  par organisation, lui, la disperserait sur autant de séries. */
  reserverIpCeiling: { limit: 600, windowSeconds: 600 },
  /** PRESSION du parcours Réserver par organisation et IP — compteur
   *  d'OBSERVABILITÉ, jamais un refus (miroir `quizPublicIp`).
   *
   *  PRINCIPE (ADR-032) : la page de réservation se sert derrière le Wi-Fi ou le
   *  CGNAT PARTAGÉ d'un commerce — l'IP est commune à tous les clients présents.
   *  Aucun seau fail-closed ne porte sur cette clé, sans quoi un tiers en ferait
   *  un interrupteur (« déni de réservation d'un commerce entier »). Ne PAS
   *  repasser en `failClosed`. */
  reserverPublicIp: { limit: 1200, windowSeconds: 600 },
  /** OUVERTURES de la page publique Réserver, PAR IP SEULE — compteur
   *  d'OBSERVABILITÉ, jamais un refus, consommé AVANT toute lecture en base.
   *
   *  SÉRIE DISTINCTE des deux seaux d'action ci-dessus, pour la raison qui
   *  sépare `huntStepIp` de `huntScanIp` : mélanger les ouvertures de page et
   *  les gestes émetteurs dans une même série rendrait le rapport illisible —
   *  une page très consultée noierait la rafale d'écriture qu'on cherche.
   *
   *  POURQUOI AVANT LA LECTURE, et non après la résolution de l'activité comme
   *  `loyaltyOrderPageIp` : l'identifiant d'activité vient de l'URL, donc du
   *  client. Une rafale qui boucle sur des UUID inventés n'atteint JAMAIS une
   *  activité résolue — un compteur posé après la résolution ne verrait rien
   *  d'elle, c'est-à-dire exactement le balayage qu'il est censé rendre visible.
   *
   *  Calibrage repris des seaux d'action du même parcours (600/600 s), et non
   *  inventé : même public, même Wi-Fi de commerce partagé. */
  reserverPageIpCeiling: { limit: 600, windowSeconds: 600 },
  /** PRESSION des ouvertures de page publique Réserver par ACTIVITÉ et IP —
   *  compteur d'OBSERVABILITÉ, jamais un refus (motif `loyaltyOrderPageIp`).
   *
   *  Posé APRÈS la résolution de l'activité : avant, il n'y aurait pas
   *  d'activité à nommer. Son plafond est le double de l'agrégat ci-dessus, et
   *  c'est le même rapport que `reserverIpCeiling` / `reserverPublicIp` : c'est
   *  l'AGRÉGAT qui doit alerter le premier, puisque c'est lui — et lui seul —
   *  qui voit une rafale que les clés par activité dispersent. */
  reserverPageIp: { limit: 1200, windowSeconds: 600 },
  /** CONFIRMATION de réservation par ADRESSE — `failClosed`, 3 par heure.
   *
   *  CLÉ PROPRE À UN SEUL DESTINATAIRE (organisation + adresse normalisée) :
   *  c'est ce qui la rend compatible avec ADR-032, qui interdit le `failClosed`
   *  sur une clé PARTAGÉE. La saturer ne coupe l'email de personne d'autre.
   *  Motif exact `pronoRecoverEmail`, mêmes chiffres.
   *
   *  CE QU'ELLE BORNE : le parcours public accepte une adresse choisie par le
   *  visiteur, et la réservation est le seul geste qui déclenche un envoi. Sans
   *  ce seau, réserver puis annuler en boucle sur des créneaux ouverts fait
   *  partir autant de messages vers une boîte tierce — la place revient à chaque
   *  tour, donc la capacité ne borne rien. Les seaux d'identité plafonnent le
   *  porteur du cookie, pas le nombre de messages reçus par la victime.
   *
   *  À SEC, ON N'ENVOIE PAS ET LA RÉSERVATION RESTE VALIDE : le code est déjà à
   *  l'écran, l'email n'a jamais été la preuve. */
  reserverEmail: { limit: 3, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;

/** Construit une clé de seau lisible et sans collision entre usages. */
export function rateLimitBucket(...parts: Array<string | number>): string {
  return parts.map((p) => String(p)).join(":");
}

/**
 * Retourne `true` si l'action est autorisée, `false` si la limite est
 * atteinte.
 *
 * Si Upstash est configuré (UPSTASH_REDIS_REST_URL/TOKEN), le verdict
 * vient de Redis — rapide et hors DB. Sinon (ou en cas d'erreur
 * Upstash), le compteur atomique en base prend le relais (résiste au
 * multi-instance serverless, contrairement à un compteur en mémoire).
 *
 * Fail-open par défaut pour les fonctions de confort. Les opérations critiques
 * (spin, scan) passent `failClosed` afin qu'une panne de protection ne devienne
 * jamais un contournement. Tous les incidents remontent au monitoring.
 *
 * ATOMICITÉ — pourquoi il n'existe plus de couple « lire le compteur puis
 * l'incrémenter après coup ».
 *
 * Une garde en deux temps (`select count` → décision → `increment`) laisse une
 * fenêtre entre la lecture et l'écriture : une rafale concurrente lancée en
 * début de fenêtre lit toutes `count = 0` et passe en bloc, si bien que le
 * budget réel n'est plus celui du seau mais celui du plafond situé au-dessus.
 * `rateLimit` ci-dessous n'a pas ce défaut — les DEUX implémentations
 * (Upstash `INCR`, Postgres `check_rate_limit` en `insert … on conflict do
 * update … returning count`) incrémentent ET tranchent dans le même aller-
 * retour. C'est la seule primitive de comptage exposée par ce module : toute
 * garde de sécurité doit passer par elle, quitte à compter les TENTATIVES
 * plutôt que les seuls échecs.
 */
export async function rateLimit(
  bucket: string,
  rule: RateLimitRule,
  options: { failClosed?: boolean } = {},
): Promise<boolean> {
  const upstashVerdict = await upstashRateLimit(bucket, rule);
  if (upstashVerdict !== null) return upstashVerdict;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_bucket: bucket,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });
    if (error) {
      reportError("rate-limit.rpc", error.message);
      return !options.failClosed;
    }
    return data !== false;
  } catch (err) {
    reportError("rate-limit", err);
    return !options.failClosed;
  }
}

/**
 * Compteur d'OBSERVABILITÉ sur clé PARTAGÉE : incrémente, signale le
 * dépassement, et ne refuse JAMAIS (le verdict est volontairement ignoré,
 * `rateLimit` est appelé sans `failClosed`).
 *
 * C'est la SEULE forme admise pour une clé partagée entre utilisateurs (IP,
 * programme, organisation) dans un parcours PUBLIC (ADR-032) : un seau
 * `failClosed` sur une telle clé devient un interrupteur qu'un tiers allume en
 * la saturant (« déni de service d'un lieu / d'un programme entier »). Le
 * `failClosed` reste réservé aux clés d'IDENTITÉ (cookie / jeton / gain) ou
 * d'OPÉRATEUR authentifié, résolues AVANT tout seau.
 *
 * Coût d'écriture : une seule ligne par (seau, fenêtre), réutilisée par upsert
 * — contrairement à une insertion par requête. C'est ce qui en fait un premier
 * rempart d'observabilité acceptable là où l'instrumentation ligne-à-ligne ne
 * l'est pas.
 */
export async function observeSharedKey(
  bucket: string,
  rule: RateLimitRule,
  event: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  if (!(await rateLimit(bucket, rule))) {
    reportSecurityEvent(event, {
      ...extra,
      bucket,
      limit: rule.limit,
      window_seconds: rule.windowSeconds,
    });
  }
}

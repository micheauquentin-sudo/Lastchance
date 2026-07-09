# Revue d'architecture — juillet 2026

Passe de consolidation des fondations avant tout nouveau développement.
Aucune fonctionnalité ajoutée ni modifiée : uniquement de la structure,
du typage, de la testabilité et de la documentation. Chaque étape a été
validée par `typecheck` + `test` + `lint` (et `build` en fin de passe).

## Ce qui a été amélioré

### 1. Typage complet des clients Supabase
`src/types/database.ts` expose désormais un type `Database` complet
(Tables `Row/Insert/Update`, `Relationships` pour l'inférence des
selects imbriqués, `Functions` pour les RPC), miroir des migrations
SQL. Les trois clients (`server`, `browser`, `admin`) sont créés avec
`createClient<Database>`.

Effets :
- **zéro cast** : les 7 `as unknown as` et tous les `as Campaign/Wheel/
  Prize/QrCode` ont été supprimés — les jointures comme
  `participations.select("prizes(label)")` sont inférées ;
- les fautes de frappe de colonnes ou de tables deviennent des erreurs
  de compilation, y compris dans les `insert`/`update` ;
- les types `Spin` et `StripeEvent` manquants ont été ajoutés.

Règle de maintenance : **toute migration SQL doit être répercutée dans
`Database`** (ou remplacée à terme par `supabase gen types typescript`).

### 2. Garde d'authentification unique (`requireOrg`)
La séquence `getUserAndOrg()` + `if (!user || !organization)
redirect("/login")` était dupliquée 11 fois dans les Server Actions
(plus un helper local dans `prizes.ts`), et les pages du dashboard
utilisaient des assertions non-null `organization!`.

`lib/auth.ts` expose maintenant `requireOrg()` : user connecté **et**
membre d'une org, sinon redirection (`/login` ou `/onboarding` — plus
correct que l'ancien `/login` systématique). Retour non-nullable :
plus aucune assertion `!` dans les pages, plus aucune garde manuelle
dans les actions.

### 3. Convention `ActionResult` isolée
`ActionResult` vivait dans `lib/utils.ts` au milieu d'utilitaires UI
(`cn`, `formatDate`). Elle est maintenant dans `lib/action-result.ts`
avec `firstIssue(ZodError)`, qui remplace ~10 extractions dupliquées de
`parsed.error.issues[0].message`. `lib/utils.ts` redevient un module
d'utilitaires purs, importable côté client sans arrière-pensée.

### 4. Cœur du spin extrait et testé
La boucle « tirage pondéré + réservation atomique de stock + re-tirage
en cas de course » était enfouie dans `spinWheel` (Server Action),
donc non testable. Elle est extraite dans `lib/spin.ts` sous forme de
`drawPrizeWithStock(prizes, reserveStock, random)` — la réservation
(RPC `decrement_prize_stock`) est injectée. 6 tests unitaires couvrent
les cas critiques : course sur les dernières unités de stock, lot
perdant sans consommation de stock, épuisement total, exclusion des
stocks à zéro.

### 5. Génération CSV extraite et testée
La route d'export construisait deux CSV à la main (échappement partiel :
certaines colonnes n'étaient pas échappées). `lib/csv.ts` centralise
`csvEscape` + `toCsv` (BOM UTF-8, séparateur `;`), **toutes** les
cellules sont désormais échappées, et 6 tests unitaires verrouillent le
comportement (guillemets, séparateurs, sauts de ligne).

### 6. Documentation
- `docs/architecture.md` : structure du code et conventions à jour ;
- `CLAUDE.md` : branche courante, liens `state/` corrigés
  (`.claude/state/`), conventions référencées.

## État des vérifications

| Vérification | Résultat |
|---|---|
| `npm run typecheck` | ✅ 0 erreur |
| `npm run test` | ✅ 38 tests (26 → 38) |
| `npm run lint` | ✅ 0 avertissement |
| `npm run build` | ✅ production OK |

## Ce qui reste à faire (dette technique restante)

Par ordre de priorité, avec proposition — à valider avant implémentation :

1. **`createCampaign` non transactionnel** : campagne, roue et lots par
   défaut sont insérés en trois requêtes. Si l'insert de la roue échoue,
   une campagne sans roue subsiste (le cas est géré à l'affichage, mais
   l'état est incohérent). Proposition : RPC SQL
   `create_campaign_with_defaults` (même modèle que
   `create_organization`), transactionnel par construction. Nécessite
   une migration `00005`.
2. **Statistiques du dashboard non bornées** : la répartition des gains
   charge toutes les participations de l'org (`select prize_id,
   prizes(label,color)`). Correct à l'échelle actuelle ; au-delà de
   quelques dizaines de milliers de lignes, prévoir une agrégation SQL
   (`group by prize_id` via RPC ou vue).
3. **Types `Database` maintenus à la main** : fiable tant que la règle
   « migration ⇒ mise à jour du type » est suivie ; brancher
   `supabase gen types typescript` en CI serait plus robuste.
4. **Pas de CI** : `typecheck` + `test` + `lint` + `build` passent en
   local mais rien ne les impose. Un workflow GitHub Actions de ~20
   lignes suffirait.
5. **Rate limiting** : le parcours public `/play` s'appuie sur la
   limite de jeu par `player_key` mais n'a pas de rate limiting réseau
   (hors périmètre de cette passe d'architecture ; à traiter dans une
   passe sécurité, ex. Vercel WAF ou Upstash).
6. **Boutons-liens dupliqués** : plusieurs pages stylisent des `<Link>`
   en boutons avec des classes inline identiques. Un composant
   `ButtonLink` (ou export des variants de `ui/button.tsx`) éliminerait
   la duplication — gain cosmétique, non bloquant.

## Non-changements assumés

- Pas de refonte des composants dashboard : ils sont simples, lisibles
  et sans duplication significative de logique.
- `play-context.ts` conserve ses requêtes parallèles explicites plutôt
  qu'une jointure unique : la lisibilité du chemin critique prime.
- Pas de barrel files (`index.ts`) : les imports directs `@/lib/…`
  restent explicites et évitent les cycles.

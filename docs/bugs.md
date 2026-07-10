# Known Issues & Bugs - Lastchance

## Critical
*(None at initialization)*

## High Priority
*(None at initialization)*

## Medium Priority
*(None at initialization)*

## Low Priority
*(None at initialization)*

## Tracking Process

### When a bug is found:
1. Add to this file with date discovered
2. Describe reproduction steps
3. Note expected vs actual behavior
4. Link related decisions or architecture notes
5. Update severity as more info is gathered

### Closing a bug:
1. Reference commit/PR that fixes it
2. Move to "Resolved" section below
3. Keep for historical reference

---

## Resolved Bugs

### « Enregistrement impossible » — éditeur d'affiche et éditeur de roue (2026-07-10)

- **Symptôme** : sauvegarder la personnalisation de la roue
  (`/dashboard/campaigns/[id]/wheel`) ou de l'affiche (`/poster/[id]`)
  échouait systématiquement avec « Enregistrement impossible » /
  « Mise à jour impossible ».
- **Cause racine** : deux migrations portaient la même version
  `00006` (`00006_branding_and_customization.sql` et
  `00006_qr_style.sql`). La version est la clé primaire de
  `supabase_migrations.schema_migrations` : une seule des deux
  s'appliquait, et les colonnes `wheels.style` / `qr_codes.poster`
  (créées par la migration de branding) n'existaient pas en base. Chaque
  UPDATE échouait alors côté PostgREST (colonne inconnue), erreur
  masquée par le message générique de l'action.
- **Correctif** (commit référencé ci-dessous) :
  1. migration de branding renumérotée `00007` ;
  2. les deux migrations rendues **idempotentes**
     (`add column if not exists`) pour converger quel que soit l'état
     de la base ;
  3. les erreurs de sauvegarde de ces actions remontent désormais à
     Sentry via `reportError` (elles n'étaient visibles qu'en
     `console.error` serveur).
- **Rattrapage d'une base déjà déployée** : `supabase db push` applique
  désormais `00007`. Alternative sans CLI : coller le contenu de
  `00007_branding_and_customization.sql` dans le SQL Editor de Supabase
  (sans risque, il est idempotent). Si la personnalisation du QR
  (couleurs/logo du QR lui-même) échoue aussi, exécuter de même le
  contenu de `00006_qr_style.sql`.

---

## Notes
- Project is fresh with no known issues
- This section will grow as development progresses
- Regular triage recommended once active development starts

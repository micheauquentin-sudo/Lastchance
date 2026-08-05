/**
 * Colonnes `not null` SANS default SQL, remplies par un trigger BEFORE INSERT.
 *
 * Trois tables sont dans ce cas : `calendars` (`public_slug`, `timezone` —
 * trigger `calendars_set_defaults`), `event_sessions` (`join_code` —
 * `event_sessions_set_join_code`) et `quizzes` (`public_slug` —
 * `quizzes_set_defaults`). Le générateur de types ne lit que la déclaration de
 * colonne : il voit `not null` sans default et rend la propriété obligatoire.
 * Postgres, lui, ne l'attend pas — et il ne FAUT pas la fournir, ces valeurs
 * sont service-authoritatives (un slug public choisi par le client serait une
 * prise d'énumération, un `join_code` choisi par le client serait devinable).
 *
 * Cette fonction ne masque donc pas une erreur : elle nomme, à chaque appel,
 * les colonnes que le trigger pose. Toutes les autres colonnes restent
 * vérifiées normalement, y compris le refus des propriétés en trop.
 *
 * @example
 * .insert(
 *   filledByTrigger<TablesInsert<"quizzes">, "public_slug">({
 *     organization_id: organization.id,
 *     name: parsed.data.name,
 *   }),
 * )
 */
export function filledByTrigger<Row, PosedByTrigger extends keyof Row>(
  row: Omit<Row, PosedByTrigger>,
): Row {
  return row as Row;
}

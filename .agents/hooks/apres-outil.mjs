#!/usr/bin/env node
// Hook PostToolUse — libère le verrou de run de test posé par pre-commande.mjs.
//
// Pourquoi si peu : le contrat PostToolUse d'Antigravity ne transmet NI le nom
// de l'outil NI sa sortie (l'entrée se limite à `stepIdx`, `error` et les
// champs communs), et sa sortie attendue est un objet vide. Il ne peut donc ni
// analyser un résultat ni injecter de contexte — c'est `PreInvocation` qui
// porte les rappels, dans `rappels.mjs`.
//
// Les hooks bloquent la boucle et s'exécutent en séquence : le verrou posé
// avant la commande est donc relâché juste après elle, ce qui lui donne
// exactement la durée du run.

import { entree, repondre, effacerEtat } from "./commun.mjs";

try {
  await entree();
  effacerEtat("verrou-tests.json");
} catch {
  // Silence délibéré.
}
repondre({});

/**
 * SONDE — pourquoi axe calcule le texte de /play sur le crème du site.
 *
 * À jouer avec : node scripts/axe-stack-probe.mjs   (depuis la racine)
 *
 * ── Ce qu'elle établit ──
 *
 * Le shell de /play est `position: fixed` et porte toute la peinture. Dès
 * qu'un DESCENDANT crée un contexte d'empilement, la remontée de la pile de
 * fonds s'interrompt et retombe sur le `<body>` — crème. Le texte blanc est
 * alors calculé à 1,07:1 au lieu de 21:1.
 *
 * Ce que la sonde a RÉFUTÉ au passage : ce n'est ni le `fixed` seul (il rend
 * `incomplete`, jamais de violation), ni le dégradé, ni l'animation EN COURS.
 * Une `opacity: .99` figée suffit ; un `transform: translateY(0)` aussi.
 *
 * ── Pourquoi elle vit dans le dépôt ──
 *
 * Elle distingue trois issues que le mot « vert » confond : `passes` (axe a
 * vérifié), `incomplete` (axe s'est ABSTENU) et `violations`. Deux des quatre
 * correctifs candidats obtiennent un vert par abstention — ils rendent le
 * capteur muet au lieu de le rendre juste. Sans cette distinction, on aurait
 * livré l'un des deux.
 *
 * Aucune dépendance à l'application : ni Supabase, ni build Next. Chromium et
 * axe-core suffisent, ce qui la rend jouable sur une machine contrainte.
 */
import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core"), "utf8");

const DEGRADE = "radial-gradient(circle at 50% -10%, #2e1065, #000000 75%)";
const FIXED = `position:fixed; inset:0; overflow-y:auto; background:${DEGRADE}; background-color:#000000;`;

// Configuration qui REPRODUIT (variante E) : shell fixed + un descendant
// portant un contexte d'empilement (ici l'animation d'entrée).
// Le contexte d'empilement de référence est une `opacity: .99` FIGÉE, et non
// l'animation d'entrée. Raison : avec l'animation, la reproduction est
// INTERMITTENTE — axe peut échantillonner après la fin des 450 ms, et la sonde
// rend alors `incomplete` au lieu de la violation. Une sonde dont le cas de
// référence vacille ne prouve rien. `opacity: .99` produit le même effet de
// façon déterministe, ce qui établit au passage que le défaut ne tient PAS à
// l'animation en cours mais au contexte d'empilement lui-même.
const html = ({ shell = FIXED, body = "#fdf6e3", contenu = "", bloc = "opacity:.99;" }) => `
<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>t</title>
<style>
  body { margin:0; background:${body}; }
  .shell { ${shell} }
  .contenu { padding:40px 20px; text-align:center; ${contenu} }
  .bloc { ${bloc} }
  h1 { color:#ffffff; font-size:30px; font-weight:800; margin:0 0 16px; }
  .muted { color:#d4d4d8; font-size:11px; }
  @keyframes play-in { from { opacity:.75; transform:translateY(14px);} to { opacity:1; transform:none; } }
</style></head>
<body><div class="shell"><main class="contenu">
  <div class="bloc"><h1>Tournez la roue, tentez votre chance !</h1>
  <p class="muted">Résultat calculé côté serveur · un jeu par personne</p></div>
</main></div></body></html>`;

const CANDIDATS = [
  { nom: "0. RÉFÉRENCE — contexte d'empilement figé (déterministe)", o: {} },
  { nom: "0b. la même chose par l'animation d'entrée (INTERMITTENT)", o: { bloc: "animation:play-in .45s ease;" } },
  { nom: "1. body peint en noir", o: { body: "#000000" } },
  { nom: "2. shell EN FLUX (min-height:100dvh)", o: { shell: `min-height:100dvh; background:${DEGRADE}; background-color:#000000;` } },
  { nom: "3. isolation:isolate sur le shell", o: { shell: FIXED + " isolation:isolate;" } },
  { nom: "4. z-index:0 sur le shell", o: { shell: FIXED + " z-index:0;" } },
  { nom: "5. position:relative + z-index:1 sur <main>", o: { contenu: "position:relative; z-index:1;" } },
  { nom: "6. body noir ET z-index:1 sur <main>", o: { body: "#000000", contenu: "position:relative; z-index:1;" } },
];

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });

for (const c of CANDIDATS) {
  const p = await ctx.newPage();
  await p.setContent(html(c.o));
  await p.addScriptTag({ content: axeSource });
  const r = await p.evaluate(async () => window.axe.run(document, { runOnly: ["color-contrast"] }));
  const viol = r.violations.flatMap((x) => x.nodes);
  const inc = r.incomplete.flatMap((x) => x.nodes);
  const pass = r.passes.flatMap((x) => x.nodes);
  let verdict = "?";
  if (viol.length) verdict = "ROUGE (faux positif conservé)";
  else if (pass.length) verdict = "VERT — axe a VRAIMENT vérifié";
  else if (inc.length) verdict = "incomplete — vert par ABSTENTION";
  console.log(`${c.nom}\n   viol=${viol.length} incomplete=${inc.length} passes=${pass.length}  →  ${verdict}`);
  for (const n of viol.slice(0, 2)) {
    const d = n.any?.[0]?.data ?? {};
    console.log(`     ✘ ${n.target} : ${d.fgColor} sur ${d.bgColor} = ${d.contrastRatio}`);
  }
  for (const n of pass.slice(0, 2)) {
    const d = n.any?.[0]?.data ?? {};
    console.log(`     ✓ ${n.target} : ${d.fgColor} sur ${d.bgColor} = ${d.contrastRatio}`);
  }
  await p.close();
}
await nav.close();

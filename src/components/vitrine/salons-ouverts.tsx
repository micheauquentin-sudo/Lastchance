import type { OrgLobbyView } from "@/lib/lobby";
import { Card } from "@/components/ui/card";
import { FermerSalon } from "@/components/vitrine/fermer-salon";
import { ANCRE_SALONS } from "@/components/vitrine/ancres";

/**
 * « SALONS OUVERTS » — POURQUOI CETTE CARTE EXISTE (contrepartie du finding E-1).
 *
 * La contre-revue L16 a démontré un déni de service bon marché : ouvrir une
 * salle, y entrer avec son propre code, la verrouiller — trois requêtes — et la
 * place est tenue jusqu'à l'expiration. Aucun prédicat ne distingue N cookies de
 * N personnes, donc le quota par organisation BORNE cet abus sans le fermer.
 *
 * Ce qui a été décidé à la place, et dont cette carte est la moitié visible : le
 * déni ne doit être ni invisible ni définitif. VISIBLE — le commerçant voit ses
 * salles vivantes, leur nombre, leur âge et leur peuplement, donc il RECONNAÎT
 * une salle-squat (ouverte il y a longtemps, personne dedans) sans qu'on ait à
 * la lui nommer. RÉVERSIBLE — chaque ligne porte le geste qui rend sa place au
 * quota, immédiatement, sans attendre aucun cron. Un tableau de bord qui
 * n'aurait montré que le nombre aurait rendu le déni lisible et subi ; c'est le
 * bouton qui en fait un incident réparable.
 *
 * ── CE QU'ELLE NE MONTRE PAS, ET C'EST DÉLIBÉRÉ ──
 *
 * Ni pseudo, ni code de partage. `org_player_lobbies` refuse déjà de les rendre,
 * et cet écran n'aurait rien à en faire : le commerçant SUPERVISE des salles, il
 * n'espionne pas ses clients. Le code surtout — l'afficher ferait de cette carte
 * un annuaire ouvrant toutes les salles de la maison à un compte compromis.
 *
 * ── ELLE NE SE PEINT PAS SANS SALON ──
 *
 * Zéro salle vivante est le cas NORMAL, et de loin le plus fréquent : une carte
 * vide occuperait le tableau de bord tous les jours pour un incident qui n'a
 * peut-être jamais lieu. Elle apparaît quand il y a quelque chose à superviser,
 * et disparaît quand il n'y en a plus.
 */
export function SalonsOuverts({
  salons,
  luA,
}: {
  salons: OrgLobbyView[];
  /**
   * L'instant de la LECTURE, stampé par `loadOrgLobbies`. Ce composant ne
   * regarde pas l'heure lui-même : les durées ci-dessous sont relatives au
   * moment où la liste a été lue, pas à celui où elle est peinte — et un
   * `Date.now()` en plein rendu est une valeur instable que la règle de pureté
   * de React refuse, à juste titre. Une seule origine pour toute la liste évite
   * aussi qu'une ligne dise « il y a 12 min » et sa voisine « 13 » sur deux
   * salles nées ensemble.
   */
  luA: string;
}) {
  if (salons.length === 0) return null;

  const maintenant = Date.parse(luA);

  return (
    // L'ANCRE DU SOMMAIRE EST POSÉE ICI, à l'intérieur de la garde ci-dessus :
    // sans salle vivante, il n'y a pas de carte, donc pas d'ancre orpheline vers
    // laquelle un lien pourrait pointer. `scroll-mt-4` comme les blocs publics —
    // la cible ne doit pas venir se coller sous l'entête.
    <Card id={ANCRE_SALONS} className="scroll-mt-4">
      <h2>Salons ouverts</h2>
      <p className="mt-2 text-sm text-k-body">
        <span className="font-black tabular-nums text-k-ink">
          {salons.length}
        </span>{" "}
        salon{salons.length > 1 ? "s" : ""} de jeu en cours chez vous. Vous
        pouvez en fermer un à tout moment : sa place est aussitôt rendue.
      </p>

      <ul className="mt-5 space-y-3">
        {salons.map((salon) => (
          <li
            key={salon.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-k-ink/15 px-4 py-3"
          >
            <span className="text-sm text-k-body">
              {resumerSalon(salon, maintenant)}
            </span>
            <FermerSalon lobbyId={salon.id} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** « bande · en attente · 4 personnes · ouvert il y a 12 min · expire dans 18 min ». */
function resumerSalon(salon: OrgLobbyView, maintenant: number): string {
  return [
    salon.kind,
    // LE STATUT EST CE QUI SÉPARE LES DEUX LECTURES. « Partie commencée » avec
    // six personnes est la vie normale du lieu ; « en attente » depuis
    // cinquante minutes avec deux personnes est la forme même du squat que la
    // contre-revue a décrit. Sans ce mot, le commerçant devait déduire du seul
    // couple âge/peuplement — et une carte qui fait deviner ne rend pas le
    // déni lisible, elle le rend interprétable.
    salon.status === "locked" ? "partie commencée" : "en attente",
    `${salon.membres} personne${salon.membres > 1 ? "s" : ""}`,
    `ouvert il y a ${duree(maintenant - Date.parse(salon.createdAt))}`,
    `expire dans ${duree(Date.parse(salon.expiresAt) - maintenant)}`,
  ].join(" · ");
}

/**
 * Une durée en millisecondes, dite comme on la dit à voix haute.
 *
 * BORNÉE À ZÉRO : une salle peut mourir entre la lecture de la liste et le rendu
 * de la ligne, et « expire dans -1 min » serait une phrase que personne ne sait
 * lire. Une date illisible — `Date.parse` rend `NaN` — donne « — » plutôt qu'un
 * « NaN min » : le mappeur laisse passer n'importe quelle chaîne, c'est ici
 * qu'on refuse de la mettre en français.
 */
function duree(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return reste === 0 ? `${heures} h` : `${heures} h ${reste}`;
}

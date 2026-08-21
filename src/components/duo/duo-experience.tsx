"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { chooseDuo, getDuoState, startDuo } from "@/actions/duo";
import type { DuoChoixView, DuoOptionView, DuoStateView } from "@/lib/duo";
import { LobbyCarton } from "@/components/lobby/lobby-shell";

/**
 * DUO MIROIR (L17) — l'écran de jeu, monté à la place de « la partie commence ».
 *
 * ── TROIS MOMENTS, UN SEUL COMPOSANT ──
 *
 * CHOISIR (le plateau), ATTENDRE (le sceau posé, l'autre pas encore) et
 * DÉCOUVRIR (les deux choix côte à côte) ne sont pas trois écrans : c'est la
 * MÊME manche vue à trois instants, et le seul document qui les distingue est
 * `duo_state`. Les séparer en routes aurait exigé de publier l'identifiant de la
 * salle dans l'URL — ce que L16 garde derrière l'appartenance — et de gérer une
 * navigation que le sondage rendrait de toute façon.
 *
 * ── LE SCRUTIN, ET SON BUDGET ──
 *
 * Motif exact de `SalleAttente` : une lecture toutes les 3 s, suspendue quand
 * l'onglet dort (`document.hidden`), reprise à la première seconde de retour. Il
 * S'ARRÊTE DÉFINITIVEMENT à la révélation — après elle, plus rien ne bouge, et
 * continuer serait payer pour relire la même ligne sur deux téléphones posés sur
 * la même table.
 *
 * ── LE CHOIX DE L'AUTRE N'EXISTE PAS AVANT LA RÉVÉLATION, ET CET ÉCRAN NE
 *    L'INVENTE PAS ──
 *
 * `autreChoix`, `suggestion` et `accord` valent `null` tant que `status` vaut
 * « ouverte » — garanti par `duo_state` (branche `revelee`) ET par `mapDuoState`.
 * Cet écran n'ajoute aucune garde de son côté : il n'a rien à filtrer, il n'a
 * qu'à ne pas peindre ce qu'il n'a pas reçu. Le seul champ lisible pendant le
 * choix est `autreAChoisi`, un FAIT SUR L'EXISTENCE d'un choix — jamais sur son
 * contenu.
 *
 * ── LA SALLE FERMÉE APRÈS LA RÉVÉLATION EST NORMALE ──
 *
 * La révélation ferme la salle et ramène sa date de mort à l'instant même. C'est
 * pourquoi `duo_state` ne regarde ni `status` ni `expires_at` du lobby, et
 * pourquoi `SalonLobby` monte cet écran AVANT ses écrans « expiré » et
 * « refermé » : un résultat n'est pas une panne.
 *
 * ── MAIS LA SALLE FERMÉE **AVANT** LA RÉVÉLATION EN EST UNE, ET IL FAUT LE DIRE ──
 *
 * `close_player_lobby_as_org` — le commerçant referme la salle depuis son
 * dashboard — produit le MÊME `closed`, à un moment tout autre : la manche est
 * encore `ouverte`. `duo_start` rend alors la manche existante sans regarder le
 * lobby, `duo_state` peint le plateau, et chaque doigt tombe sur le refus de
 * `duo_choose` — le message générique, EN BOUCLE, pendant que le joueur cherche
 * une panne de réseau qui n'existe pas.
 *
 * D'où `statutSalle` : la seule chose que cet écran ne peut PAS déduire de
 * `duo_state`, puisque `duo_state` a de bonnes raisons de ne pas la regarder.
 * Manche `ouverte` + salle `closed` ⇒ on ne peint pas un plateau cliquable, on
 * dit ce qui s'est passé. Manche `revelee` ⇒ le statut de la salle n'a plus
 * aucune importance, et l'écran de résultat passe avant tout le reste.
 */

/** Cadence du scrutin, en millisecondes — celle du salon. */
const INTERVALLE_MS = 3000;

/** La moitié LISIBLE de `DuoStateView` : `unavailable` est un refus, pas un état. */
type VueDuo = Extract<DuoStateView, { state: "ok" }>;

/**
 * L'ouverture de la manche, telle que `startDuo` la tranche.
 *
 * `non_configure` et `unavailable` restent DISTINCTS jusqu'à l'écran parce
 * qu'ils appellent un geste différent, et chez quelqu'un d'autre : le premier
 * demande au commerçant de composer son plateau, le second ne demande rien.
 */
type Ouverture = "attente" | "prete" | "non_configure" | "unavailable";

/** Le refus indistinct d'un choix — un seul message, toutes causes confondues. */
const REFUS_CHOIX =
  "Ce choix n’a pas pu être enregistré. Réessayez dans un instant.";

export function DuoExperience({
  lobbyId,
  statutSalle,
}: {
  lobbyId: string;
  /** Le statut du lobby au moment du branchement — `SalonLobby` le détient. */
  statutSalle: "locked" | "closed";
}) {
  const [ouverture, setOuverture] = useState<Ouverture>("attente");
  const [optionsDepart, setOptionsDepart] = useState<DuoOptionView[]>([]);
  const [vue, setVue] = useState<VueDuo | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [enChoix, demarrerChoix] = useTransition();
  // RELECTURE ATTENDABLE, motif `SalleAttente` : le bouton doit rester
  // désactivé JUSQU'AU RETOUR de la relecture, sinon l'écran rend la main sur un
  // plateau qui n'a pas encore appris que le choix est scellé.
  const lireRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    let vivant = true;
    let arrete = false;
    let minuterie: number | null = null;

    const stopper = () => {
      arrete = true;
      if (minuterie !== null) {
        window.clearInterval(minuterie);
        minuterie = null;
      }
    };

    const lire = async () => {
      if (arrete || document.hidden) return;
      try {
        const suivant = await getDuoState(lobbyId);
        if (!vivant || suivant.state !== "ok") return;
        setVue(suivant);
        // Après la révélation, plus rien ne change : on cesse de lire. Une
        // manche encore ouverte dans une salle CLOSE ne changera pas non plus —
        // plus personne ne peut sceller, donc plus rien ne peut la révéler :
        // relire toutes les 3 s serait payer pour la même ligne, indéfiniment.
        if (suivant.status === "revelee" || statutSalle === "closed") stopper();
      } catch {
        // Un échec isolé est la vie normale d'un téléphone en salle : le tic
        // suivant rattrape, l'écran garde son dernier état connu.
      }
    };
    lireRef.current = lire;

    // OUVRIR — OU RETROUVER — LA MANCHE. `duo_start` est idempotente : les deux
    // téléphones peuvent l'appeler à la même seconde, la base leur rend la même
    // manche. L'écran n'a donc pas à savoir lequel est arrivé le premier.
    const ouvrir = async () => {
      try {
        const debut = await startDuo(lobbyId);
        if (!vivant) return;
        if (debut.state !== "ok") {
          setOuverture(debut.state);
          return;
        }
        setOptionsDepart(debut.options);
        setOuverture("prete");
        await lire();
        if (!vivant || arrete) return;
        minuterie = window.setInterval(() => {
          void lire();
        }, INTERVALLE_MS);
      } catch {
        if (vivant) setOuverture("unavailable");
      }
    };
    void ouvrir();

    const surVisibilite = () => {
      if (!document.hidden) void lire();
    };
    document.addEventListener("visibilitychange", surVisibilite);

    return () => {
      vivant = false;
      lireRef.current = async () => undefined;
      stopper();
      document.removeEventListener("visibilitychange", surVisibilite);
    };
  }, [lobbyId, statutSalle]);

  /**
   * SCELLER — irréversible, et l'écran ne propose donc jamais de « modifier ».
   *
   * `deja-scelle` ne dit RIEN à l'utilisateur : c'est le double-clic ou le
   * changement d'avis, et la relecture qui suit peint le choix figé, ce qui est
   * la seule réponse honnête. On relit dans TOUS les cas, refus compris — la
   * manche a pu être révélée entre l'affichage et le doigt.
   */
  const choisir = (itemId: string) => {
    demarrerChoix(async () => {
      setRefus(null);
      try {
        const formData = new FormData();
        formData.set("lobby_id", lobbyId);
        formData.set("item_id", itemId);
        const resultat = await chooseDuo(null, formData);
        if (!resultat.ok) setRefus(resultat.error);
        else if (resultat.data.etat === "indisponible") setRefus(REFUS_CHOIX);
      } catch {
        setRefus(REFUS_CHOIX);
      }
      await lireRef.current();
    });
  };

  if (ouverture === "non_configure") {
    return (
      <LobbyCarton className="text-center">
        <p className="text-4xl" aria-hidden="true">
          🕯️
        </p>
        <h2 className="mt-2 text-xl font-black text-k-ink">
          Le plateau n’est pas encore prêt
        </h2>
        <p className="mt-2 text-sm text-k-body">
          Ce commerce n’a pas encore choisi les fiches du jeu. Dites-le au
          comptoir&nbsp;: il suffit d’en cocher trois.
        </p>
      </LobbyCarton>
    );
  }

  if (ouverture === "unavailable") {
    return (
      <LobbyCarton className="text-center">
        <p className="text-sm text-k-body">
          Cette partie n’est plus accessible.
        </p>
      </LobbyCarton>
    );
  }

  if (ouverture === "attente" || !vue) {
    return (
      <LobbyCarton>
        <p className="text-center text-sm text-k-body" aria-live="polite">
          Le jeu s’ouvre…
        </p>
      </LobbyCarton>
    );
  }

  // LA RÉVÉLATION D'ABORD, TOUJOURS : elle ferme la salle en même temps qu'elle
  // arrive, donc `closed` est ici l'état NORMAL d'une partie réussie.
  if (vue.status === "revelee") {
    return <EcranRevelation vue={vue} />;
  }

  // Puis, et seulement sur une manche encore ouverte : la salle a été refermée
  // sous les doigts des joueurs. Aucun plateau — chaque carte mènerait au refus.
  if (statutSalle === "closed") {
    return <EcranSalleRefermee />;
  }

  return (
    <EcranPlateau
      vue={vue}
      options={vue.options.length > 0 ? vue.options : optionsDepart}
      refus={refus}
      enChoix={enChoix}
      onChoisir={choisir}
    />
  );
}

/**
 * LA SALLE REFERMÉE AVANT LA FIN — dire ce qui s'est passé, sans le déguiser.
 *
 * Ni « une erreur est survenue » (il n'y en a pas eu), ni « réessayez » (il n'y
 * a rien à réessayer), ni le nom du geste ou de qui l'a fait : le joueur n'a
 * besoin que de deux choses — savoir que la partie ne reprendra pas, et savoir
 * où aller pour en avoir une autre. Le reste serait de la mise en cause.
 */
function EcranSalleRefermee() {
  return (
    <LobbyCarton className="text-center">
      <h2 className="text-lg font-black text-k-ink">
        Ce salon a été refermé avant la fin de la partie.
      </h2>
      <p className="mt-2 text-sm text-k-body">
        Les choix ne seront pas révélés. Demandez une nouvelle partie au
        comptoir&nbsp;: elle repart d’un plateau neuf.
      </p>
    </LobbyCarton>
  );
}

/* ────────────────────────────────────────────────────────────
   CHOISIR, puis ATTENDRE — le même plateau, avant et après le sceau
   ──────────────────────────────────────────────────────────── */

/**
 * Le plateau. Il ne DISPARAÎT PAS une fois le choix scellé, il se fige.
 *
 * Faire disparaître les cartes aurait laissé le joueur devant une phrase seule,
 * sans plus rien de ce qu'il vient de décider — or ce qu'il attend, pendant ces
 * quelques secondes, c'est précisément de revoir son choix. Les autres cartes
 * deviennent inertes parce qu'elles le SONT : `duo_choose` refuse un second
 * item, et un bouton qui ne fera rien ne doit pas être offert.
 */
function EcranPlateau({
  vue,
  options,
  refus,
  enChoix,
  onChoisir,
}: {
  vue: VueDuo;
  options: DuoOptionView[];
  refus: string | null;
  enChoix: boolean;
  onChoisir: (itemId: string) => void;
}) {
  const scelle = vue.monChoix !== null;

  return (
    <div className="space-y-4">
      <LobbyCarton>
        {scelle ? (
          <>
            <h2 className="text-lg font-black text-k-ink">
              Votre choix est scellé.
            </h2>
            <p className="mt-2 text-sm text-k-body" aria-live="polite">
              {vue.autreAChoisi
                ? "Votre binôme a choisi aussi — la révélation arrive."
                : "En attente de votre binôme. Gardez cet écran ouvert."}
            </p>
          </>
        ) : (
          <>
            <h2 className="text-lg font-black text-k-ink">
              Que lui offririez-vous&nbsp;?
            </h2>
            <p className="mt-2 text-sm text-k-body">
              Choisissez une fiche pour la personne en face. Elle choisit de son
              côté&nbsp;: aucun de vous ne verra le choix de l’autre avant que
              les deux soient faits.
            </p>
          </>
        )}
      </LobbyCarton>

      {refus && (
        <LobbyCarton>
          <p className="text-sm font-semibold text-red-600" role="alert">
            {refus}
          </p>
        </LobbyCarton>
      )}

      <ul className="space-y-3">
        {options.map((option) => (
          <CarteOption
            key={option.item_id}
            option={option}
            choisie={vue.monChoix?.item_id === option.item_id}
            // INERTE dès qu'un choix est scellé — le sien comme les autres :
            // la manche ne se rejoue pas, et l'immuabilité est tout l'objet du
            // jeu. Pendant l'envoi, tout est désactivé pour qu'un second doigt
            // ne parte pas sur une carte voisine.
            inerte={scelle || enChoix}
            onChoisir={onChoisir}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * UNE FICHE DU PLATEAU — une cible large, sous un pouce, sur un téléphone.
 *
 * `min-h-16` et une carte pleine largeur : ces boutons se touchent d'une main,
 * en salle, parfois à deux sur la même table. Le nom accessible du bouton porte
 * le nom de la fiche — six cartes identiquement intitulées ne se distinguent pas
 * au lecteur d'écran.
 *
 * LA PHOTO N'EST RENDUE QUE SI ELLE EST UNE ADRESSE COMPLÈTE. Aucun pipeline
 * d'images n'est livré (`photo_path` est `null` partout aujourd'hui, et aucun
 * composant du dépôt ne le rend) : fabriquer ici une URL de bucket inventerait
 * une convention que rien ne garde. Une valeur `https://` explicite, elle,
 * s'affiche telle quelle le jour où elle existera.
 */
function CarteOption({
  option,
  choisie,
  inerte,
  onChoisir,
}: {
  option: DuoOptionView;
  choisie: boolean;
  inerte: boolean;
  onChoisir: (itemId: string) => void;
}) {
  const photo = adressePhoto(option.photo_path);

  return (
    <li>
      <button
        type="button"
        disabled={inerte}
        onClick={() => onChoisir(option.item_id)}
        aria-current={choisie ? "true" : undefined}
        className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink ${
          choisie
            ? "border-k-ink bg-k-yellow shadow-[4px_4px_0_var(--color-k-ink)]"
            : "border-k-ink/25 bg-white"
        } ${inerte && !choisie ? "opacity-45" : ""}`}
      >
        {photo && (
          // `<img>` nu et non `next/image` : l'hôte n'est pas déclaré dans
          // `remotePatterns`, et l'optimiseur refuserait de le servir. `alt=""`
          // — le nom de la fiche est juste à côté, en toutes lettres.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            width={56}
            height={56}
            className="size-14 shrink-0 rounded-xl border-2 border-k-ink/15 object-cover"
          />
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-bold leading-tight text-k-ink">
            {option.nom}
          </span>
          {option.description && (
            <span className="mt-0.5 block text-xs leading-snug text-k-body">
              {option.description}
            </span>
          )}
          {option.prix_affiche && (
            <span className="mt-1 block text-sm font-black tabular-nums text-k-ink">
              {option.prix_affiche}
            </span>
          )}
        </span>
        {choisie && (
          <span className="shrink-0 rounded-full border-2 border-k-ink bg-white px-2 py-0.5 text-[11px] font-black text-k-ink">
            votre choix
          </span>
        )}
      </button>
    </li>
  );
}

/* ────────────────────────────────────────────────────────────
   DÉCOUVRIR
   ──────────────────────────────────────────────────────────── */

/**
 * LA RÉVÉLATION — les deux choix CÔTE À CÔTE, et rien qui ressemble à un score.
 *
 * ── L'ACCORD SE DIT, IL NE SE COMPTE PAS ──
 *
 * « Vous avez pensé à la même chose. » Pas de points, pas de badge, pas de gain :
 * ce jeu n'a pas de gagnant, et lui en fabriquer un aurait transformé une
 * complicité en résultat. C'est aussi ce qui distingue Duo Miroir de la roue —
 * la roue promet un lot, celui-ci ne promet rien et n'en doit donc aucun.
 *
 * ── LA SUGGESTION VIENT APRÈS, JAMAIS PENDANT ──
 *
 * `duo_state` ne la calcule que dans la branche `revelee` : l'afficher pendant le
 * choix aurait surligné une réponse sur le plateau. Elle arrive ici pour ce
 * qu'elle est — la maison qui propose ce à quoi aucun des deux n'avait pensé.
 */
function EcranRevelation({ vue }: { vue: VueDuo }) {
  return (
    <div className="space-y-4">
      <LobbyCarton className="text-center">
        <p className="text-4xl" aria-hidden="true">
          ✨
        </p>
        <h2 className="mt-2 text-xl font-black text-k-ink">La révélation</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <ChoixRevele titre="Votre choix" choix={vue.monChoix} />
          <ChoixRevele titre="Son choix" choix={vue.autreChoix} />
        </div>
        {vue.accord === true && (
          <p className="mt-4 text-sm font-bold text-k-ink">
            Vous avez pensé à la même chose.
          </p>
        )}
      </LobbyCarton>

      {vue.suggestion && (
        <LobbyCarton>
          <h3 className="text-sm font-black uppercase tracking-wide text-k-ink">
            La maison propose…
          </h3>
          <p className="mt-2 font-bold text-k-ink">{vue.suggestion.nom}</p>
          {vue.suggestion.description && (
            <p className="mt-1 text-sm text-k-body">
              {vue.suggestion.description}
            </p>
          )}
          {vue.suggestion.prix_affiche && (
            <p className="mt-1 text-sm font-black tabular-nums text-k-ink">
              {vue.suggestion.prix_affiche}
            </p>
          )}
        </LobbyCarton>
      )}

      <LobbyCarton className="text-center">
        <p className="text-sm text-k-body">
          C’est tout&nbsp;: le reste se passe à table. Vous pouvez refermer cet
          écran.
        </p>
      </LobbyCarton>
    </div>
  );
}

/**
 * Un choix révélé — le NOM, et rien d'autre.
 *
 * `DuoChoixView` ne porte que deux clés, et c'est le sujet du lot : ni prix, ni
 * photo, ni description ne voyagent avec un choix. Le repli sur un tiret couvre
 * le seul cas où l'autre choix manque à la révélation (document tronqué) — dire
 * « rien » serait affirmer qu'il n'a pas choisi, ce qui est faux.
 */
function ChoixRevele({
  titre,
  choix,
}: {
  titre: string;
  choix: DuoChoixView | null;
}) {
  return (
    <div className="rounded-2xl border-2 border-k-ink/20 px-3 py-3">
      <p className="text-[11px] font-black uppercase tracking-wide text-k-body">
        {titre}
      </p>
      <p className="mt-1 text-sm font-bold leading-tight text-k-ink">
        {choix ? choix.nom : "—"}
      </p>
    </div>
  );
}

/** Une adresse d'image utilisable, ou rien. Voir l'en-tête de `CarteOption`. */
function adressePhoto(photoPath: string | null): string | null {
  return photoPath && photoPath.startsWith("https://") ? photoPath : null;
}

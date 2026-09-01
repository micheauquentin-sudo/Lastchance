// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DuoStateView } from "@/lib/duo";

const startDuo = vi.fn();
const getDuoState = vi.fn();
const chooseDuo = vi.fn();
vi.mock("@/actions/duo", () => ({ startDuo, getDuoState, chooseDuo }));

const { DuoExperience } = await import("@/components/duo/duo-experience");

/**
 * DEUX STATUTS SE CROISENT ICI, ET LE MOT « closed » NE VEUT PAS DIRE LA MÊME
 * CHOSE DE CHAQUE CÔTÉ.
 *
 * Côté MANCHE, « revelee » est une fin heureuse : la partie s'est déroulée, et
 * la révélation ferme la salle au passage — d'où une salle `closed` sur un
 * écran de résultat parfaitement normal, la moitié du lot L17.
 *
 * Côté SALLE, `close_player_lobby_as_org` produit le MÊME `closed` alors que la
 * manche est encore `ouverte`. Sans le croisement, l'écran peignait un plateau
 * cliquable dont chaque carte tombait sur le refus générique de `duo_choose`,
 * en boucle : le joueur cherchait une panne de réseau, la salle avait été
 * refermée sous ses pieds.
 *
 * Ce test verrouille les QUATRE combinaisons, parce que corriger la mauvaise
 * casserait la bonne.
 */

const OPTIONS = [
  {
    option_id: "op-1",
    item_id: "it-1",
    nom: "Le cookie",
    description: null,
    prix_affiche: null,
    photo_path: null,
    ordre: 1,
  },
  {
    option_id: "op-2",
    item_id: "it-2",
    nom: "Le flan",
    description: null,
    prix_affiche: null,
    photo_path: null,
    ordre: 2,
  },
];

/** La moitié LISIBLE de `DuoStateView` — `mancheScellee` part de là. */
type VueDuo = Extract<DuoStateView, { state: "ok" }>;

function mancheOuverte(): VueDuo {
  return {
    state: "ok",
    status: "ouverte",
    monChoix: null,
    options: OPTIONS,
    autreAChoisi: false,
    autreChoix: null,
    suggestion: null,
    accord: null,
    // La salle VIT : c'est l'état ordinaire d'une manche ouverte. Les cas où
    // elle ne vit plus sont montés explicitement par les tests qui les visent.
    salleClose: false,
  };
}

function mancheRevelee(): DuoStateView {
  return {
    state: "ok",
    status: "revelee",
    monChoix: { option_id: "op-1", item_id: "it-1", nom: "Le cookie" },
    options: OPTIONS,
    autreAChoisi: true,
    autreChoix: { option_id: "op-1", item_id: "it-1", nom: "Le cookie" },
    suggestion: null,
    accord: true,
    // VRAI, et c'est l'état NORMAL d'une partie réussie : la révélation ferme
    // la salle dans le même geste. L'écran de résultat passe avant ce drapeau.
    salleClose: true,
  };
}

/** La même manche, une fois le sceau posé — ce que la relecture doit peindre. */
function mancheScellee(): VueDuo {
  return {
    ...mancheOuverte(),
    monChoix: { option_id: "op-1", item_id: "it-1", nom: "Le cookie" },
  };
}

/**
 * UN PLATEAU ENTIÈREMENT SAISI À LA MAIN — DUO-5, et le cas qui n'existait pas.
 *
 * Un commerçant qui vend le Duo sans la Vitrine (DUO-2) n'a aucune fiche à
 * épingler : ses six places portent un `item_id` NUL. Jusqu'ici l'écran les
 * désactivait toutes — un plateau sans un seul bouton actif — parce que
 * `duo_choose` ne savait sceller qu'une fiche.
 */
const OPTIONS_SAISIES = [
  {
    option_id: "op-s1",
    item_id: null,
    nom: "Un café gourmand",
    description: null,
    prix_affiche: null,
    photo_path: null,
    ordre: 1,
  },
  {
    option_id: "op-s2",
    item_id: null,
    nom: "Une part de tarte",
    description: null,
    prix_affiche: null,
    photo_path: null,
    ordre: 2,
  },
];

function mancheSaisie(): VueDuo {
  return { ...mancheOuverte(), options: OPTIONS_SAISIES };
}

/** Une promesse dont le test décide l'instant de retour. */
function differe<T>() {
  let resoudre!: (valeur: T) => void;
  const promesse = new Promise<T>((r) => {
    resoudre = r;
  });
  return { promesse, resoudre };
}

function peindre(statutSalle: "locked" | "closed") {
  render(<DuoExperience lobbyId="lob-1" statutSalle={statutSalle} sortie={null} />);
}

/** Les fiches du plateau, telles qu'un pouce les trouve. */
const cartes = () => screen.queryAllByRole("button", { name: /le cookie|le flan/i });

const fermeture = () =>
  screen.queryByRole("heading", { name: /refermé avant la fin/i });

const revelation = () => screen.queryByRole("heading", { name: /la révélation/i });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("DuoExperience — la manche et la salle se croisent", () => {
  // `duo_start` est idempotente et NE REGARDE PAS le lobby : elle rend la manche
  // existante même sur une salle close. C'est exactement ce qui rendait le bug
  // invisible — l'ouverture réussit, et seul le croisement le fait apparaître.
  beforeEach(() => {
    startDuo.mockResolvedValue({
      state: "ok",
      roundId: "rnd-1",
      options: OPTIONS,
    });
  });

  it("LA SALLE REFERMÉE PENDANT LA PARTIE : le sondage l'apprend, l'écran suit", async () => {
    // LE CAS QUE `statutSalle` NE PEUT PAS VOIR (contre-revue L17, R-2). Il est
    // figé au branchement — le scrutin du SALON s'arrête au verrouillage —,
    // donc un joueur qui garde son écran ouvert pendant que le commerçant
    // referme la salle restait devant un plateau cliquable dont chaque carte
    // tombait sur un refus générique. Ici la salle est `locked` au montage, et
    // c'est `salleClose` — porté par le seul sondage qui tourne encore — qui
    // fait basculer l'écran.
    getDuoState.mockResolvedValue({ ...mancheOuverte(), salleClose: true });
    peindre("locked");

    await waitFor(() => expect(fermeture()).not.toBeNull());
    expect(cartes()).toHaveLength(0);
  });

  it("manche ouverte + salle verrouillée : le plateau, cliquable", async () => {
    getDuoState.mockResolvedValue(mancheOuverte());
    peindre("locked");

    await waitFor(() => expect(cartes()).toHaveLength(2));
    expect(cartes().every((carte) => !(carte as HTMLButtonElement).disabled)).toBe(
      true,
    );
    expect(fermeture()).toBeNull();
  });

  // ══════════════════════════════════════════════════════════
  // DUO-5 — LE PLATEAU QUI NE VIENT PAS DE LA CARTE SE JOUE
  // ══════════════════════════════════════════════════════════

  it("UN PLATEAU ENTIÈREMENT SAISI SE TOUCHE, et le sceau part sur la PLACE", async () => {
    // LE CAS QUI ÉTAIT IMPOSSIBLE AVANT CE LOT. Un plateau composé de libellés
    // écrits à la main n'a aucun `item_id` : l'écran désactivait ses six cartes
    // parce que `duo_choose` ne savait sceller qu'une fiche, et le commerçant
    // qui vend le Duo sans la Vitrine servait donc un jeu à zéro bouton.
    getDuoState.mockResolvedValue(mancheSaisie());
    chooseDuo.mockResolvedValue({
      ok: true,
      data: { etat: "scelle", revelee: false },
    });
    startDuo.mockResolvedValue({
      state: "ok",
      roundId: "rnd-1",
      options: OPTIONS_SAISIES,
    });
    peindre("locked");

    const saisies = () =>
      screen.queryAllByRole("button", {
        name: /un café gourmand|une part de tarte/i,
      });
    await waitFor(() => expect(saisies()).toHaveLength(2));
    expect(
      saisies().every((carte) => !(carte as HTMLButtonElement).disabled),
    ).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: /une part de tarte/i }),
    );

    await waitFor(() => expect(chooseDuo).toHaveBeenCalledTimes(1));
    const envoi = chooseDuo.mock.calls[0][1] as FormData;
    // LA PLACE, ET ELLE SEULE. `item_id` n'aurait rien à porter ici — c'est
    // exactement pour cela que ces cartes étaient inertes.
    expect(envoi.get("option_id")).toBe("op-s2");
    expect(envoi.get("item_id")).toBeNull();
    expect(envoi.get("lobby_id")).toBe("lob-1");
  });

  it("NON-RÉGRESSION — une fiche de carte se scelle comme avant, par sa place", async () => {
    // Le plateau de fiches reste le cas ordinaire : ce qui change est la CLÉ
    // postée, pas le geste. La poster par `item_id` marcherait encore (l'action
    // tolère l'ancienne forme le temps d'un déploiement), mais l'écran n'a plus
    // aucune raison de l'employer — et deux formes vivantes finiraient par
    // diverger.
    getDuoState.mockResolvedValue(mancheOuverte());
    chooseDuo.mockResolvedValue({
      ok: true,
      data: { etat: "scelle", revelee: false },
    });
    peindre("locked");

    await waitFor(() => expect(cartes()).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: /le flan/i }));

    await waitFor(() => expect(chooseDuo).toHaveBeenCalledTimes(1));
    const envoi = chooseDuo.mock.calls[0][1] as FormData;
    expect(envoi.get("option_id")).toBe("op-2");
    expect(envoi.get("item_id")).toBeNull();
  });

  it("SURLIGNE LA PLACE SCELLÉE, même sans fiche", async () => {
    // La comparaison portait sur `item_id` : deux propositions saisies l'ont
    // toutes deux à `null`, et se seraient donc surlignées ENSEMBLE — le joueur
    // aurait vu deux « votre choix » sur un plateau où il n'en a fait qu'un.
    getDuoState.mockResolvedValue({
      ...mancheSaisie(),
      monChoix: { option_id: "op-s2", item_id: null, nom: "Une part de tarte" },
    });
    startDuo.mockResolvedValue({
      state: "ok",
      roundId: "rnd-1",
      options: OPTIONS_SAISIES,
    });
    peindre("locked");

    await waitFor(() =>
      expect(screen.getByText(/votre choix est scellé/i)).toBeTruthy(),
    );
    expect(screen.getAllByText("votre choix")).toHaveLength(1);
    expect(
      screen
        .getByRole("button", { name: /une part de tarte/i })
        .getAttribute("aria-current"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: /un café gourmand/i })
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  it("un sceau d'AVANT DUO-4 se surligne encore, par sa fiche", async () => {
    // `option_id` est nulle sur un sceau posé avant la migration, et sur un
    // plateau remplacé pendant la manche (`on delete set null`). Le repli sur la
    // fiche est le même que celui de `duo_state` pour l'accord : sans lui, les
    // parties en cours au moment du déploiement auraient perdu leur surlignage.
    getDuoState.mockResolvedValue({
      ...mancheOuverte(),
      monChoix: { option_id: null, item_id: "it-2", nom: "Le flan" },
    });
    peindre("locked");

    await waitFor(() =>
      expect(screen.getByText(/votre choix est scellé/i)).toBeTruthy(),
    );
    expect(
      screen.getByRole("button", { name: /le flan/i }).getAttribute("aria-current"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: /le cookie/i })
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  it("manche ouverte + salle close : l'écran de fermeture, et AUCUN plateau", async () => {
    getDuoState.mockResolvedValue(mancheOuverte());
    peindre("closed");

    await waitFor(() => expect(fermeture()).not.toBeNull());
    // La propriété qui compte : rien à toucher. Un plateau désactivé aurait
    // encore invité au clic, et un plateau cliquable aurait rejoué la boucle de
    // refus que ce lot corrige.
    expect(cartes()).toHaveLength(0);
    expect(revelation()).toBeNull();
    expect(
      screen.getByText(/les choix ne seront pas révélés/i),
    ).toBeTruthy();
  });

  it("manche révélée + salle close : le résultat, pas la fermeture", async () => {
    getDuoState.mockResolvedValue(mancheRevelee());
    peindre("closed");

    await waitFor(() => expect(revelation()).not.toBeNull());
    expect(fermeture()).toBeNull();
    expect(screen.getByText(/pensé à la même chose/i)).toBeTruthy();
  });

  it("manche révélée + salle verrouillée : le résultat aussi", async () => {
    getDuoState.mockResolvedValue(mancheRevelee());
    peindre("locked");

    await waitFor(() => expect(revelation()).not.toBeNull());
    expect(fermeture()).toBeNull();
  });

  /**
   * DEUX LECTURES EN VOL, LA PLUS ANCIENNE RENDUE EN DERNIER — même course que
   * `SalleAttente`, même correctif.
   *
   * Le joueur touche une fiche pendant qu'un tic de scrutin est déjà parti. Ce
   * tic a lu la manche AVANT le sceau : il rapportera `monChoix: null`. S'il
   * revient après la relecture de `chooseDuo`, l'écran défait le sceau — les
   * cartes redeviennent cliquables sur une manche que `duo_choose` refusera
   * désormais, et le joueur croit son choix perdu.
   */
  it("jette une lecture périmée revenue après une plus récente", async () => {
    vi.useFakeTimers();
    const scrutin = differe<DuoStateView>();
    const apresChoix = differe<DuoStateView>();
    getDuoState
      .mockResolvedValueOnce(mancheOuverte()) // ouverture
      .mockReturnValueOnce(scrutin.promesse) // tic parti AVANT le sceau
      .mockReturnValueOnce(apresChoix.promesse); // relecture du choix
    chooseDuo.mockResolvedValue({ ok: true, data: { etat: "scelle" } });

    peindre("locked");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(cartes()).toHaveLength(2);

    // Le tic de 3 s part, et reste en vol.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(getDuoState).toHaveBeenCalledTimes(2);

    // Le doigt tombe : troisième lecture, émise APRÈS la deuxième.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /le cookie/i }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getDuoState).toHaveBeenCalledTimes(3);

    // La RÉCENTE rentre la première : le sceau est posé.
    await act(async () => {
      apresChoix.resoudre(mancheScellee());
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/votre choix est scellé/i)).toBeTruthy();

    // Puis l'ANCIENNE, sans choix. Elle ne défait pas le sceau.
    await act(async () => {
      scrutin.resoudre(mancheOuverte());
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/votre choix est scellé/i)).toBeTruthy();
    expect(
      cartes().every((carte) => (carte as HTMLButtonElement).disabled),
    ).toBe(true);
  });
});

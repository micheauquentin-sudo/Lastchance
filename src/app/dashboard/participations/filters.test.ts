import { describe, it, expect } from "vitest";
import {
  applyParticipationFilters,
  parseParticipationFilters,
  participationFiltresActifs,
  participationSearchParams,
  type FilterBuilderLike,
} from "./filters";

/**
 * Faux builder PostgREST : il enregistre les appels et se rend lui-même, comme
 * le vrai (`this.url.searchParams.append(…); return this`). C'est cette
 * sémantique de mutation qui autorise `applyParticipationFilters` à ne rien
 * retourner ; le test la reproduit fidèlement, elle est le contrat.
 */
function fauxBuilder() {
  const appels: string[] = [];
  const builder = {
    eq(c: string, v: string) {
      appels.push(`eq:${c}:${v}`);
      return this;
    },
    gte(c: string, v: string) {
      appels.push(`gte:${c}:${v}`);
      return this;
    },
    lte(c: string, v: string) {
      appels.push(`lte:${c}:${v}`);
      return this;
    },
    is(c: string, v: null) {
      appels.push(`is:${c}:${v}`);
      return this;
    },
    not(c: string, op: string, v: null) {
      appels.push(`not:${c}:${op}:${v}`);
      return this;
    },
    or(f: string) {
      appels.push(`or:${f}`);
      return this;
    },
    in(c: string, v: string[]) {
      appels.push(`in:${c}:${v.join("|")}`);
      return this;
    },
  } satisfies FilterBuilderLike & { eq(c: string, v: string): unknown };
  return { builder, appels };
}

const FUSEAU = "Europe/Paris";
const MAINTENANT = new Date("2026-08-09T12:00:00.000Z");

describe("parseParticipationFilters", () => {
  it("reconnaît les quatre statuts, dont les deux qui manquaient", () => {
    for (const statut of ["a-valider", "recuperes", "annules", "expires"]) {
      expect(parseParticipationFilters({ statut }).statut).toBe(statut);
    }
    expect(parseParticipationFilters({ statut: "perdus" }).statut).toBeUndefined();
  });

  it("ignore une date mal formée au lieu de lever", () => {
    expect(parseParticipationFilters({ du: "2026-08-01" }).du).toBe("2026-08-01");
    expect(parseParticipationFilters({ du: "01/08/2026" }).du).toBeUndefined();
    expect(parseParticipationFilters({ au: "2026-02-31" }).au).toBeUndefined();
  });

  it("participationSearchParams porte les six filtres", () => {
    const f = parseParticipationFilters({
      campaign: "c1",
      q: "momo",
      statut: "expires",
      du: "2026-08-01",
      au: "2026-08-05",
      lot: "Café offert",
    });
    expect(participationFiltresActifs(f)).toBe(true);
    expect(participationSearchParams(f)).toEqual({
      campaign: "c1",
      q: "momo",
      statut: "expires",
      du: "2026-08-01",
      au: "2026-08-05",
      lot: "Café offert",
    });
    expect(participationFiltresActifs(parseParticipationFilters({}))).toBe(false);
  });
});

describe("applyParticipationFilters — période", () => {
  it("borne sur les jours CIVILS du fuseau de l'établissement, pas sur UTC", () => {
    const { builder, appels } = fauxBuilder();
    applyParticipationFilters(
      builder,
      parseParticipationFilters({ du: "2026-08-01", au: "2026-08-05" }),
      FUSEAU,
      undefined,
      MAINTENANT,
    );
    // Paris est à +02:00 en août : le 1er commence le 2026-07-31T22:00Z et le
    // 5 se termine le 2026-08-05T21:59:59.999Z. Bornées en UTC, ces mêmes dates
    // auraient perdu les participations de la soirée.
    expect(appels).toEqual([
      "gte:created_at:2026-07-31T22:00:00.000Z",
      "lte:created_at:2026-08-05T21:59:59.999Z",
    ]);
  });

  it("suit un autre fuseau d'établissement", () => {
    const { builder, appels } = fauxBuilder();
    applyParticipationFilters(
      builder,
      parseParticipationFilters({ du: "2026-08-01" }),
      "Pacific/Noumea",
      undefined,
      MAINTENANT,
    );
    expect(appels).toEqual(["gte:created_at:2026-07-31T13:00:00.000Z"]);
  });
});

describe("applyParticipationFilters — statuts", () => {
  const pour = (statut: string) => {
    const { builder, appels } = fauxBuilder();
    applyParticipationFilters(
      builder,
      parseParticipationFilters({ statut }),
      FUSEAU,
      undefined,
      MAINTENANT,
    );
    return appels;
  };

  it("« à valider » exclut annulés ET expirés (la pastille de l'écran aussi)", () => {
    expect(pour("a-valider")).toEqual([
      "is:cancelled_at:null",
      "is:redeemed_at:null",
      "or:redeem_expires_at.is.null,redeem_expires_at.gt.2026-08-09T12:00:00.000Z",
    ]);
  });

  it("« récupérés » exclut les annulés", () => {
    expect(pour("recuperes")).toEqual([
      "is:cancelled_at:null",
      "not:redeemed_at:is:null",
    ]);
  });

  it("« annulés » et « expirés » reproduisent la cascade d'affichage", () => {
    expect(pour("annules")).toEqual(["not:cancelled_at:is:null"]);
    expect(pour("expires")).toEqual([
      "is:cancelled_at:null",
      "is:redeemed_at:null",
      "lte:redeem_expires_at:2026-08-09T12:00:00.000Z",
    ]);
  });
});

describe("applyParticipationFilters — lot, campagne, recherche", () => {
  it("filtre par les prize_id du libellé", () => {
    const { builder, appels } = fauxBuilder();
    applyParticipationFilters(
      builder,
      parseParticipationFilters({ lot: "Café offert" }),
      FUSEAU,
      ["p1", "p2"],
      MAINTENANT,
    );
    expect(appels).toEqual(["in:prize_id:p1|p2"]);
  });

  it("un libellé sans aucun lot correspondant ne rend RIEN, jamais tout", () => {
    const { builder, appels } = fauxBuilder();
    applyParticipationFilters(
      builder,
      parseParticipationFilters({ lot: "Lot supprimé" }),
      FUSEAU,
      [],
      MAINTENANT,
    );
    expect(appels).toEqual(["in:prize_id:00000000-0000-0000-0000-000000000000"]);
  });

  it("nettoie le terme de recherche avant de l'injecter dans le `.or()`", () => {
    const { builder, appels } = fauxBuilder();
    applyParticipationFilters(
      builder,
      parseParticipationFilters({ campaign: "c1", q: "mo%mo(" }),
      FUSEAU,
      undefined,
      MAINTENANT,
    );
    expect(appels).toEqual([
      "eq:campaign_id:c1",
      "or:redeem_code.ilike.%momo%,first_name.ilike.%momo%,email.ilike.%momo%",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { partSur10 } from "@/components/dashboard/part-sur-10";

describe("partSur10", () => {
  it("dit « moins d'un sur 10 » sous 5 %", () => {
    expect(partSur10(0)).toBe("moins d'un client sur 10 gagne quelque chose");
    expect(partSur10(4)).toBe("moins d'un client sur 10 gagne quelque chose");
  });

  it("arrondit au dixième le plus proche, singulier à 1", () => {
    expect(partSur10(10)).toBe("≈ 1 client sur 10 gagne quelque chose");
  });

  it("passe au pluriel dès 2 sur 10", () => {
    expect(partSur10(25)).toBe("≈ 3 clients sur 10 gagnent quelque chose");
  });

  it("dit « quasiment tous » à partir de 100 %", () => {
    expect(partSur10(100)).toBe("quasiment tous vos clients gagnent quelque chose");
    expect(partSur10(150)).toBe("quasiment tous vos clients gagnent quelque chose");
  });
});

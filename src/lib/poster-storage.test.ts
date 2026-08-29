import { describe, expect, it } from "vitest";
import { posterImagePaths } from "./poster-storage";
import type { PosterConfig } from "./poster";

const BACKGROUND_PATH =
  "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222-33333333-3333-4333-8333-333333333333.webp";
const ELEMENT_PATH =
  "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222-44444444-4444-4444-8444-444444444444.webp";

describe("posterImagePaths", () => {
  it("inclut le fond dans le cycle de conservation et de purge Storage", () => {
    const config: PosterConfig = {
      version: 2,
      bg: "#ffffff",
      bgPattern: "none",
      bgImage: `poster-image:${BACKGROUND_PATH}`,
      elements: [
        {
          id: "image",
          type: "image",
          x: 50,
          y: 50,
          w: 30,
          rot: 0,
          z: 1,
          src: `poster-image:${ELEMENT_PATH}`,
        },
      ],
    };

    expect(posterImagePaths(config)).toEqual([BACKGROUND_PATH, ELEMENT_PATH]);
  });
});

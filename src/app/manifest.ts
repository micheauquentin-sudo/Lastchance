import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Simple comme QR",
    short_name: "Simple comme QR",
    description:
      "Jeux, fidélité, pronostics et vitrine par QR code pour commerces.",
    start_url: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#18181b",
    lang: "fr",
  };
}

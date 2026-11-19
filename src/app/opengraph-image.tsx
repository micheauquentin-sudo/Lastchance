import { ImageResponse } from "next/og";

export const alt = "Simple comme QR — Gamification pour commerces";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background:
            "linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0284c7 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            fontSize: 32,
            fontWeight: 700,
          }}
        >
          <span
            style={{
              background: "#facc15",
              color: "#0f172a",
              padding: "8px 18px",
              borderRadius: "14px",
              fontWeight: 800,
            }}
          >
            QR
          </span>
          <span>Simple comme QR</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>
            Jeux, Fidélité, Pronostics & Vitrine par QR Code
          </div>
          <div style={{ fontSize: 28, color: "#cbd5e1", lineHeight: 1.4 }}>
            Pas d&apos;appli à télécharger. Attirez, faites revenir et fidélisez
            vos clients en 1 scan.
          </div>
        </div>

        <div style={{ fontSize: 24, color: "#94a3b8" }}>simplecommeqr.fr</div>
      </div>
    ),
    { ...size }
  );
}

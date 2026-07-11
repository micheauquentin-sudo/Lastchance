/**
 * QR code décoratif (non fonctionnel) pour les maquettes de la landing :
 * motif déterministe avec trois repères d'angle, pour un rendu crédible
 * sans embarquer de générateur. Purement visuel — masqué aux lecteurs
 * d'écran par le parent.
 */

const N = 25;

/** Construit une grille N×N déterministe (identique SSR / client). */
function buildModules(): boolean[][] {
  const m: boolean[][] = Array.from({ length: N }, () => Array<boolean>(N).fill(false));

  const finder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const edge = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        m[r0 + r][c0 + c] = edge || core;
      }
    }
  };
  finder(0, 0);
  finder(0, N - 7);
  finder(N - 7, 0);

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const inFinder =
        (r < 8 && c < 8) || (r < 8 && c >= N - 8) || (r >= N - 8 && c < 8);
      if (inFinder) continue;
      const h = (r * 73856093) ^ (c * 19349663) ^ (r * c * 83492791);
      if ((h >>> 0) % 100 < 46) m[r][c] = true;
    }
  }
  return m;
}

const MODULES = buildModules();

export function PseudoQr({ className = "" }: { className?: string }) {
  const pad = 2;
  const size = N + pad * 2;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label="QR code de démonstration"
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} rx={1.5} fill="#ffffff" />
      {MODULES.flatMap((row, r) =>
        row.map((on, c) =>
          on ? (
            <rect key={`${r}-${c}`} x={c + pad} y={r + pad} width={1} height={1} fill="#18181b" />
          ) : null,
        ),
      )}
    </svg>
  );
}

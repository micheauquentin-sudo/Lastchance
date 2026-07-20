/* Pipeline de coloriage du mesh Lumoz (image-to-3D → GLB fini) :
   vertex colors par segmentation spatiale + greffe de la queue annelée.
   Usage : node scripts/lumoz-paint-glb.mjs (lit Input/white_mesh.glb,
   écrit Input/lumoz_colored.glb — seuils réglables dans T). */
import { NodeIO } from "@gltf-transform/core";
import { normals } from "@gltf-transform/functions";

const SRC = "Input/white_mesh.glb";
const OUT = "Input/lumoz_colored.glb";

/* Palette Lumoz (sheet panda roux) */
const COL = {
  fur: [0.91, 0.46, 0.23], // roux #e8763a
  furDark: [0.54, 0.27, 0.15], // anneaux #8a4526
  cream: [1.0, 0.96, 0.91], // blancs du visage
  white: [1.0, 1.0, 1.0], // polo + baskets
  pants: [0.15, 0.15, 0.16], // pantalon #26262a
  paw: [0.36, 0.23, 0.16], // pattes #5c3a28
  ink: [0.13, 0.11, 0.09], // nez / yeux #211d16
  mouth: [0.55, 0.2, 0.22], // intérieur de bouche
};

/* ── Seuils de segmentation (t = hauteur normalisée 0 bas → 1 haut) ── */
const T = {
  shoeTop: 0.088,
  pantsTop: 0.405, // taille du pantalon (pli visible du mesh)
  shirtTop: 0.565, // cou / départ de la tête
  blend: 0.012, // demi-bande de fondu aux frontières de vêtements
  // pattes : extrémités des bras (sous le poignet)
  pawYMin: 0.24,
  pawYMax: 0.35,
  pawXMin: 0.335, // |x| au-delà duquel on est sur le bras
  // visage (dans la zone tête)
  muzzleZ: 0.25, // avancée du museau/joues → crème (joues larges)
  muzzleTMax: 0.78, // au-dessus → plus de crème (front)
  eyeY: 0.745, eyeX: 0.19, eyeZ: 0.33, eyeR: 0.07, // cratères des yeux
  browY: 0.805, browX: 0.155, browZ: 0.31, browR: 0.06, // taches sourcils
  noseY: 0.675, noseZ: 0.40, noseR: 0.05, // truffe
  mouthY: 0.60, mouthZ: 0.32, mouthR: 0.058, // bouche ouverte
  // intérieur d'oreilles : cônes écartés (|x| grand) et PEU avancés (z
  // borné) — sinon la règle déborde sur le front et la houppette
  earInnerZ: 0.05, earInnerZMax: 0.22, earYMin: 0.90, earXMin: 0.31,
};

const io = new NodeIO();
const doc = await io.read(SRC);
const root = doc.getRoot();

const mesh = root.listMeshes()[0];
const prim = mesh.listPrimitives()[0];
const pos = prim.getAttribute("POSITION");
const arr = pos.getArray();
const count = pos.getCount();

/* Bornes du modèle */
let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
for (let i = 0; i < count; i++) {
  const x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
  if (x < minX) minX = x; if (x > maxX) maxX = x;
  if (y < minY) minY = y; if (y > maxY) maxY = y;
  if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
}
const H = maxY - minY;
console.log("bbox y:", minY.toFixed(3), maxY.toFixed(3), "| H:", H.toFixed(3),
  "| x:", minX.toFixed(3), maxX.toFixed(3), "| z:", minZ.toFixed(3), maxZ.toFixed(3));

const dist2 = (x, y, z, cx, cy, cz) => {
  const dx = x - cx, dy = y - cy, dz = z - cz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

/* Classement de chaque sommet → couleur */
const colors = new Float32Array(count * 3);
for (let i = 0; i < count; i++) {
  const x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
  const t = (y - minY) / H;
  let c = COL.fur;

  /* Fondu linéaire entre deux couleurs autour d'une frontière t0. */
  const mix = (a, b, t0) => {
    const k = Math.min(1, Math.max(0, (t - t0 + T.blend) / (2 * T.blend)));
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  };

  const isPaw = Math.abs(x) > T.pawXMin && t > T.pawYMin && t < T.pawYMax;

  if (isPaw) c = COL.paw;
  else if (t < T.shoeTop + T.blend) c = mix(COL.white, COL.pants, T.shoeTop);
  else if (t < T.pantsTop + T.blend) c = mix(COL.pants, COL.white, T.pantsTop);
  else if (t < T.shirtTop) c = COL.white;
  else {
    // ── tête : roux par défaut, marques par zones ──
    c = COL.fur;
    // museau + joues + menton (avancée du visage)
    if (z > T.muzzleZ && t < T.muzzleTMax) c = COL.cream;
    // taches de sourcils
    if (dist2(x, y, z, T.browX, minY + T.browY * H, T.browZ) < T.browR) c = COL.cream;
    if (dist2(x, y, z, -T.browX, minY + T.browY * H, T.browZ) < T.browR) c = COL.cream;
    // cratères des yeux
    if (dist2(x, y, z, T.eyeX, minY + T.eyeY * H, T.eyeZ) < T.eyeR) c = COL.ink;
    if (dist2(x, y, z, -T.eyeX, minY + T.eyeY * H, T.eyeZ) < T.eyeR) c = COL.ink;
    // truffe
    if (dist2(x, y, z, 0, minY + T.noseY * H, T.noseZ) < T.noseR) c = COL.ink;
    // bouche ouverte (cavité sous la truffe)
    if (dist2(x, y, z, 0, minY + T.mouthY * H, T.mouthZ) < T.mouthR) c = COL.mouth;
    // intérieur d'oreilles (face avant des cônes, jamais le front)
    if (t > T.earYMin && Math.abs(x) > T.earXMin && z > T.earInnerZ && z < T.earInnerZMax) c = COL.cream;
  }

  colors[i * 3] = c[0];
  colors[i * 3 + 1] = c[1];
  colors[i * 3 + 2] = c[2];
}

const buffer = root.listBuffers()[0];
const colorAttr = doc.createAccessor("COLOR_0").setType("VEC3").setArray(colors).setBuffer(buffer);
prim.setAttribute("COLOR_0", colorAttr);

/* Matériau unique à vertex colors */
// Simple face : l'intérieur du tube de la queue est ainsi invisible
// (culling) — aucune « coupe » ne peut se dessiner à la jonction.
const mat = doc.createMaterial("lumoz")
  .setBaseColorFactor([1, 1, 1, 1])
  .setMetallicFactor(0)
  .setRoughnessFactor(0.9);
prim.setMaterial(mat);

/* ── Greffe de la queue : tube lisse à rayon variable le long d'une
      courbe Catmull-Rom, anneaux roux/brun en BANDES DE COULEUR (comme
      la sheet) — une seule surface, zéro couture. ─────────────────── */
function catmullRom(pts, t) {
  const n = pts.length - 1;
  const f = Math.min(n - 1e-6, Math.max(0, t * n));
  const i = Math.floor(f), u = f - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[Math.min(n, i + 1)], p3 = pts[Math.min(n, i + 2)];
  const cr = (a, b, c, d) =>
    0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  return [cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1]), cr(p0[2], p1[2], p2[2], p3[2])];
}

{
  // Surface réelle du dos aux hauteurs de la queue : z le plus reculé
  // du mesh par bande de hauteur (|x| < 0.2) — la courbe doit passer
  // DERRIÈRE, sinon le tube se retrouve à moitié enterré dans le corps.
  const backZAt = (tBand) => {
    let m = 0;
    for (let i = 0; i < count; i++) {
      const y = arr[i * 3 + 1], tt = (y - minY) / H;
      if (Math.abs(tt - tBand) < 0.03 && Math.abs(arr[i * 3]) < 0.2) {
        const z = arr[i * 3 + 2];
        if (z < m) m = z;
      }
    }
    return m;
  };
  console.log("dos z @t0.35:", backZAt(0.35).toFixed(3),
    "@t0.45:", backZAt(0.45).toFixed(3), "@t0.55:", backZAt(0.55).toFixed(3),
    "@t0.70:", backZAt(0.70).toFixed(3));

  // Points de contrôle (monde) : ancré dans le bas du dos, la courbe
  // s'écarte derrière puis monte à côté de la tête.
  const by = minY + 0.33 * H;
  const zBody = Math.min(backZAt(0.4), backZAt(0.5)); // dos le plus reculé
  // Montée quasi verticale plaquée au dos : aucun segment ne pointe
  // vers l'arrière (sinon, vue de dos, on regarde DANS l'axe du tube
  // et sa silhouette se lit comme une embouchure creuse).
  const CTRL = [
    [0.0, by - 0.02, zBody + 0.08], // ancre DANS le corps (jonction cachée)
    [0.05, by + 0.16, zBody - 0.09],
    [0.16, by + 0.38, zBody - 0.12],
    [0.30, by + 0.58, zBody - 0.12],
    [0.44, by + 0.76, zBody - 0.10],
    [0.53, by + 0.92, zBody - 0.06],
    [0.57, by + 1.04, zBody - 0.01],
  ];
  // Profil de rayon : épais au milieu, effilé en pointe aux DEUX bouts
  // (aucune embouchure ouverte visible, jonction fondue dans le dos).
  const radius = (t) => {
    const body = 0.085 + 0.10 * Math.sin(Math.min(1, t * 1.15) * Math.PI) ** 0.8 * (1 - t * 0.35);
    const taper = Math.min(1, Math.min(t, 1 - t) * 14 + 0.04);
    return body * taper;
  };
  const STEPS = 60, SEGS = 20, RINGS = 6; // 6 bandes de couleur
  const positions = [], cols = [], indices = [];
  for (let s = 0; s <= STEPS; s++) {
    const t = s / STEPS;
    const p = catmullRom(CTRL, t);
    const ahead = catmullRom(CTRL, Math.min(1, t + 0.01));
    // Repère local du tube : tangente + référence stable (jamais
    // parallèle à la tangente, sinon la section s'effondre en ruban).
    let tx = ahead[0] - p[0], ty = ahead[1] - p[1], tz = ahead[2] - p[2];
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    let rx = 0, ry = 0, rz = 1; // référence : +z
    if (Math.abs(tz) > 0.9) { rx = 1; rz = 0; } // repli si tangente ~z
    let nx = ty * rz - tz * ry, ny = tz * rx - tx * rz, nz = tx * ry - ty * rx;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const bx = ty * nz - tz * ny, byy = tz * nx - tx * nz, bz = tx * ny - ty * nx;
    const r = radius(t);
    const dark = Math.floor(t * RINGS) % 2 === 1;
    const c = dark ? COL.furDark : COL.fur;
    for (let k = 0; k <= SEGS; k++) {
      const a = (k / SEGS) * Math.PI * 2;
      const cx = Math.cos(a), sx = Math.sin(a);
      positions.push(
        p[0] + r * (nx * cx + bx * sx),
        p[1] + r * (ny * cx + byy * sx),
        p[2] + r * (nz * cx + bz * sx),
      );
      cols.push(c[0], c[1], c[2]);
    }
  }
  // Pointe fermée
  const tip = catmullRom(CTRL, 1);
  positions.push(tip[0], tip[1], tip[2]);
  cols.push(COL.furDark[0], COL.furDark[1], COL.furDark[2]);
  const tipIdx = positions.length / 3 - 1;
  for (let s = 0; s < STEPS; s++) {
    for (let k = 0; k < SEGS; k++) {
      const a = s * (SEGS + 1) + k, b = a + SEGS + 1;
      // Winding CCW vu de l'extérieur (sinon faces externes cullées)
      indices.push(a + 1, b, a, a + 1, b + 1, b);
    }
  }
  for (let k = 0; k < SEGS; k++) {
    const a = STEPS * (SEGS + 1) + k;
    indices.push(a + 1, tipIdx, a);
  }
  const p = doc.createPrimitive()
    .setAttribute("POSITION",
      doc.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(buffer))
    .setAttribute("COLOR_0",
      doc.createAccessor().setType("VEC3").setArray(new Float32Array(cols)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(indices)).setBuffer(buffer))
    .setMaterial(mat);
  mesh.addPrimitive(p);

  // Boule de fourrure à la base : posée exactement au point où la
  // courbe traverse la surface du dos — fond la jonction dans la fourrure.
  {
    let tCross = 0.12;
    for (let tt = 0; tt <= 0.5; tt += 0.01) {
      if (catmullRom(CTRL, tt)[2] < zBody - 0.01) { tCross = tt; break; }
    }
    const bp = catmullRom(CTRL, tCross);
    const R = 0.16, SG = 18, RG = 12;
    const sp = [], sc = [], si = [];
    for (let iy = 0; iy <= RG; iy++) {
      const phi = (iy / RG) * Math.PI;
      for (let ix = 0; ix <= SG; ix++) {
        const th = (ix / SG) * Math.PI * 2;
        sp.push(
          bp[0] + R * Math.sin(phi) * Math.cos(th),
          bp[1] + R * Math.cos(phi),
          bp[2] + R * Math.sin(phi) * Math.sin(th),
        );
        sc.push(COL.fur[0], COL.fur[1], COL.fur[2]);
      }
    }
    for (let iy = 0; iy < RG; iy++) {
      for (let ix = 0; ix < SG; ix++) {
        const a = iy * (SG + 1) + ix, b = a + SG + 1;
        si.push(a + 1, b, a, a + 1, b + 1, b);
      }
    }
    const bpim = doc.createPrimitive()
      .setAttribute("POSITION",
        doc.createAccessor().setType("VEC3").setArray(new Float32Array(sp)).setBuffer(buffer))
      .setAttribute("COLOR_0",
        doc.createAccessor().setType("VEC3").setArray(new Float32Array(sc)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(si)).setBuffer(buffer))
      .setMaterial(mat);
    mesh.addPrimitive(bpim);
  }
}

/* Normales propres pour tout le monde */
await doc.transform(normals({ overwrite: true }));

await io.write(OUT, doc);
console.log("écrit :", OUT);

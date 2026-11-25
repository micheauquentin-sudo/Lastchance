import {
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoToneMapping,
  OctahedronGeometry,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  RingGeometry,
  Scene,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TorusGeometry,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Object3D,
} from "three";

export type Scene3DKind =
  | "trophy"
  | "diamond"
  | "golden-ticket"
  | "gift-box"
  | "chest"
  | "passport-seal"
  | "clover-miss"
  | "spinner-seal";

export type Scene3DPhase = "idle" | "tension" | "win" | "loss" | "stamp";

export type Scene3DRarity = "common" | "rare" | "epic";

export interface MountScene3DOptions {
  container: HTMLElement;
  kind: Scene3DKind;
  phase: Scene3DPhase;
  accentColor?: string;
  rarity?: Scene3DRarity;
  badgeText?: string;
  reducedMotion?: boolean;
  onFallback?: () => void;
}

export interface MountedScene3D {
  setPhase: (phase: Scene3DPhase) => void;
  destroy: () => void;
}

/* ==========================================================================
   PALETTE & ENVIRONNEMENT STUDIO PIXAR × KERMESSE (IDENTIQUE AU SITE)
   NoToneMapping + studio sombre à 5 softboxes nettes = zéro voile blanc,
   noirs encre #161317 profonds et couleurs bonbon ultra-lisibles.
   ========================================================================== */
const INK_HEX = 0x161317;
const GOLD_HEX = 0xfcca59;
const PINK_HEX = 0xf296bd;
const BLUE_HEX = 0x99b7f5;
const GREEN_HEX = 0x267f53;
const MINT_HEX = 0x34d399;
const ORANGE_HEX = 0xf5793b;
const CREAM_HEX = 0xfdf6e3;

const CONFETTI_PALETTE = [
  GOLD_HEX,
  PINK_HEX,
  BLUE_HEX,
  MINT_HEX,
  ORANGE_HEX,
  CREAM_HEX,
];

const RARITY_HEX: Record<Scene3DRarity, number> = {
  common: BLUE_HEX,
  rare: PINK_HEX,
  epic: GOLD_HEX,
};

function parseSafeHex(input?: string): number | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) return null;
  return Number.parseInt(trimmed.slice(1), 16);
}

function createHighContrastStudioEnv(renderer: WebGLRenderer) {
  const pmrem = new PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new Scene();
  envScene.background = new Color(0x1b1724);

  const addSoftbox = (
    color: number,
    intensity: number,
    pos: [number, number, number],
    rot: [number, number, number],
    scale: [number, number],
  ) => {
    const geo = new PlaneGeometry(1, 1);
    const mat = new MeshBasicMaterial({
      color: new Color(color).multiplyScalar(intensity),
      side: DoubleSide,
    });
    const mesh = new Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.rotation.set(rot[0], rot[1], rot[2]);
    mesh.scale.set(scale[0], scale[1], 1);
    envScene.add(mesh);
  };

  addSoftbox(0xffffff, 4.2, [-1.5, 6.5, 3.0], [Math.PI / 2.2, 0.15, 0], [6.5, 4.2]);
  addSoftbox(0xffdf7a, 3.2, [-7.2, 2.4, 4.2], [0, Math.PI / 2.5, 0], [4.5, 5.5]);
  addSoftbox(0xff6eb4, 2.6, [7.2, 1.8, 2.5], [0, -Math.PI / 2.4, 0], [4.0, 5.2]);
  addSoftbox(0x5ef2b5, 2.2, [1.0, 4.2, -7.2], [0.22, 0, 0], [7.0, 3.2]);
  addSoftbox(0xffc978, 1.0, [0, -6.5, 1.0], [-Math.PI / 2, 0, 0], [8.0, 8.0]);

  const rt = pmrem.fromScene(envScene, 0.03);
  pmrem.dispose();
  envScene.traverse((obj) => {
    if (obj instanceof Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else {
        obj.material.dispose();
      }
    }
  });
  return rt;
}

function createSoftShadowTexture(alpha = 0.28): CanvasTexture {
  const size = 192;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.04,
      size / 2,
      size / 2,
      size * 0.48,
    );
    grad.addColorStop(0, `rgba(22, 19, 23, ${alpha})`);
    grad.addColorStop(0.5, `rgba(22, 19, 23, ${alpha * 0.4})`);
    grad.addColorStop(1, "rgba(22, 19, 23, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function createStarShape(outerR: number, innerR: number, points = 5): Shape {
  const shape = new Shape();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function createNotchedTicketShape(w: number, h: number, notchR: number): Shape {
  const hw = w / 2;
  const hh = h / 2;
  const r = 0.16;
  const shape = new Shape();
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, -notchR);
  shape.absarc(hw, 0, notchR, -Math.PI / 2, Math.PI / 2, true);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, notchR);
  shape.absarc(-hw, 0, notchR, Math.PI / 2, -Math.PI / 2, true);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return shape;
}

function createBadgeCanvasTexture(
  bgHex: string,
  fgHex: string,
  label: string,
  subLabel?: string,
): CanvasTexture {
  const w = 512;
  const h = 320;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = bgHex;
    ctx.fillRect(0, 0, w, h);

    // Cadre encre Kermesse
    ctx.strokeStyle = "#161317";
    ctx.lineWidth = 14;
    ctx.strokeRect(18, 18, w - 36, h - 36);

    // Pointillés intérieurs dorés
    ctx.save();
    ctx.setLineDash([12, 10]);
    ctx.strokeStyle = "rgba(22, 19, 23, 0.35)";
    ctx.lineWidth = 4;
    ctx.strokeRect(36, 36, w - 72, h - 72);
    ctx.restore();

    ctx.fillStyle = fgHex;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (subLabel) {
      ctx.font = "900 32px system-ui, -apple-system, sans-serif";
      ctx.fillText(subLabel, w / 2, h * 0.34);
      ctx.font = "900 62px system-ui, -apple-system, sans-serif";
      ctx.fillText(label, w / 2, h * 0.63);
    } else {
      ctx.font = "900 120px system-ui, -apple-system, sans-serif";
      ctx.fillText(label, w / 2, h * 0.52);
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function createStampDiscTexture(
  bgHex: string,
  text: string,
  borderHex = "#ffffff",
): CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = bgHex;
    ctx.fillRect(0, 0, size, size);

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.43, 0, Math.PI * 2);
    ctx.strokeStyle = borderHex;
    ctx.lineWidth = 10;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 54px system-ui, -apple-system, sans-serif";
    ctx.fillText(text, size / 2, size / 2 + 2);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/* ==========================================================================
   SYSTÈME DE CONFETTIS / ÉTINCELLES 3D EN GRAVITÉ RÉELLE
   ========================================================================== */
interface ConfettiParticle {
  mesh: Mesh;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  life: number;
  maxLife: number;
}

interface ConfettiSystem {
  group: Group;
  burst: (count: number, gentle?: boolean) => void;
  update: (dt: number) => void;
}

function createConfettiSystem(accentHex: number | null): ConfettiSystem {
  const group = new Group();
  const palette = accentHex
    ? [accentHex, ...CONFETTI_PALETTE]
    : CONFETTI_PALETTE;
  const particles: ConfettiParticle[] = [];
  const rectGeo = new PlaneGeometry(0.14, 0.085);
  const starGeo = new OctahedronGeometry(0.065, 0);

  const materials = palette.map(
    (hex) =>
      new MeshPhysicalMaterial({
        color: hex,
        roughness: 0.25,
        metalness: 0.15,
        clearcoat: 0.85,
        side: DoubleSide,
      }),
  );

  // Pool pré-alloué (40 pièces max, zéro allocation en cours de frame)
  for (let i = 0; i < 40; i++) {
    const geo = i % 4 === 0 ? starGeo : rectGeo;
    const mat = materials[i % materials.length];
    const mesh = new Mesh(geo, mat);
    mesh.visible = false;
    group.add(mesh);
    particles.push({
      mesh,
      vx: 0,
      vy: 0,
      vz: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      life: 0,
      maxLife: 1,
    });
  }

  const burst = (count: number, gentle = false) => {
    const n = Math.min(count, particles.length);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (i >= n) {
        p.mesh.visible = false;
        p.life = 0;
        continue;
      }
      const angle = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.55;
      const speed = gentle
        ? 1.1 + Math.random() * 1.15
        : 1.7 + Math.random() * 2.1;
      p.mesh.visible = true;
      p.mesh.position.set(
        (Math.random() - 0.5) * 0.28,
        gentle ? 0.15 : -0.05,
        (Math.random() - 0.5) * 0.25,
      );
      p.mesh.scale.setScalar(gentle ? 0.72 : 0.9 + Math.random() * 0.45);
      p.vx = Math.cos(angle) * speed * 0.9;
      p.vy = (gentle ? 1.5 : 2.6) + Math.random() * (gentle ? 1.2 : 2.1);
      p.vz = Math.sin(angle) * speed * 0.65;
      p.rx = (Math.random() - 0.5) * 9;
      p.ry = (Math.random() - 0.5) * 9;
      p.rz = (Math.random() - 0.5) * 9;
      p.maxLife = gentle ? 1.35 + Math.random() * 0.45 : 1.9 + Math.random() * 0.7;
      p.life = p.maxLife;
    }
  };

  const update = (dt: number) => {
    for (const p of particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.vy -= 4.8 * dt;
      p.vx *= 1 - 0.85 * dt;
      p.vz *= 1 - 0.85 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += p.rx * dt;
      p.mesh.rotation.y += p.ry * dt;
      p.mesh.rotation.z += p.rz * dt;
      const fade = MathUtils.clamp(p.life / 0.45, 0, 1);
      p.mesh.scale.setScalar(fade);
    }
  };

  return { group, burst, update };
}

/* ==========================================================================
   CONSTRUCTEURS DES 8 OBJETS 3D SIGNATURE
   ========================================================================== */
interface SceneRig {
  root: Group;
  lidPivot?: Group;
  stampPivot?: Group;
  orbPivot?: Group;
  haloRing?: Mesh;
  glowLight?: PointLight;
}

function buildRig(
  kind: Scene3DKind,
  accentHex: number | null,
  rarity: Scene3DRarity,
  badgeText?: string,
): SceneRig {
  const root = new Group();
  const primaryHex = accentHex ?? GOLD_HEX;

  const goldMat = new MeshPhysicalMaterial({
    color: GOLD_HEX,
    roughness: 0.18,
    metalness: 0.84,
    clearcoat: 0.92,
    clearcoatRoughness: 0.1,
  });

  const inkMat = new MeshPhysicalMaterial({
    color: INK_HEX,
    roughness: 0.35,
    metalness: 0.15,
    clearcoat: 0.75,
  });

  const accentMat = new MeshPhysicalMaterial({
    color: primaryHex,
    roughness: 0.22,
    metalness: 0.2,
    clearcoat: 0.9,
  });

  // Halo annulaire discret à l'impact
  const haloRing = new Mesh(
    new RingGeometry(0.65, 0.86, 40),
    new MeshBasicMaterial({
      color: GOLD_HEX,
      transparent: true,
      opacity: 0,
      side: DoubleSide,
    }),
  );
  haloRing.position.z = -0.35;
  root.add(haloRing);

  const glowLight = new PointLight(GOLD_HEX, 0, 6);
  glowLight.position.set(0, 0.3, 1.3);
  root.add(glowLight);

  if (kind === "trophy") {
    // Médaillon Kermesse verni + Étoile 3D extrudée dorée + anneau supérieur
    const disc = new Mesh(new CylinderGeometry(0.92, 0.92, 0.18, 40), inkMat);
    disc.rotation.x = Math.PI / 2;
    root.add(disc);

    const rim = new Mesh(new TorusGeometry(0.92, 0.1, 16, 44), goldMat);
    root.add(rim);

    const innerPlate = new Mesh(
      new CylinderGeometry(0.76, 0.76, 0.21, 36),
      accentMat,
    );
    innerPlate.rotation.x = Math.PI / 2;
    root.add(innerPlate);

    const starGeo = new ExtrudeGeometry(createStarShape(0.56, 0.25, 5), {
      depth: 0.16,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.04,
      bevelSegments: 3,
    });
    starGeo.center();
    const star = new Mesh(starGeo, goldMat);
    star.position.z = 0.13;
    root.add(star);

    const crownLoop = new Mesh(new TorusGeometry(0.19, 0.055, 12, 24), goldMat);
    crownLoop.position.y = 1.06;
    root.add(crownLoop);

    return { root, haloRing, glowLight };
  }

  if (kind === "diamond") {
    // Diamant facetté Pixar (cyan/accent) + anneau orbital doré
    const crystalMat = new MeshPhysicalMaterial({
      color: accentHex ?? 0x38bdf8,
      roughness: 0.08,
      metalness: 0.15,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      emissive: new Color(accentHex ?? 0x0284c7),
      emissiveIntensity: 0.16,
    });

    const crown = new Mesh(new CylinderGeometry(0.52, 0.86, 0.42, 8), crystalMat);
    crown.position.y = 0.26;
    root.add(crown);

    const pavilion = new Mesh(new ConeGeometry(0.86, 0.92, 8), crystalMat);
    pavilion.rotation.x = Math.PI;
    pavilion.position.y = -0.41;
    root.add(pavilion);

    const orbit = new Mesh(new TorusGeometry(1.08, 0.045, 12, 48), goldMat);
    orbit.rotation.x = Math.PI * 0.38;
    orbit.rotation.y = 0.35;
    root.add(orbit);

    return { root, haloRing, glowLight };
  }

  if (kind === "golden-ticket") {
    // Ticket d'Or 3D échancré (ADN exact du site) + tampon vert claquable
    const ticketGeo = new ExtrudeGeometry(createNotchedTicketShape(2.25, 1.24, 0.2), {
      depth: 0.11,
      bevelEnabled: true,
      bevelThickness: 0.035,
      bevelSize: 0.03,
      bevelSegments: 3,
    });
    ticketGeo.center();
    const ticketBody = new Mesh(ticketGeo, goldMat);
    root.add(ticketBody);

    const faceTex = createBadgeCanvasTexture(
      "#fde68a",
      "#161317",
      badgeText || "★ OR ★",
      "TICKET D'OR",
    );
    const face = new Mesh(
      new PlaneGeometry(1.94, 0.98),
      new MeshBasicMaterial({ map: faceTex }),
    );
    face.position.z = 0.095;
    root.add(face);

    // Tampon vert 3D qui claque en coin sur gain
    const stampPivot = new Group();
    stampPivot.position.set(0.68, -0.28, 0.24);
    const stampTex = createStampDiscTexture("#10b981", "✓");
    const stampDisc = new Mesh(
      new CylinderGeometry(0.36, 0.36, 0.08, 32),
      new MeshPhysicalMaterial({
        color: 0x10b981,
        roughness: 0.2,
        clearcoat: 0.9,
      }),
    );
    stampDisc.rotation.x = Math.PI / 2;
    stampPivot.add(stampDisc);

    const stampFace = new Mesh(
      new PlaneGeometry(0.56, 0.56),
      new MeshBasicMaterial({ map: stampTex, transparent: true }),
    );
    stampFace.position.z = 0.045;
    stampPivot.add(stampFace);
    stampPivot.visible = false;
    root.add(stampPivot);

    return { root, stampPivot, haloRing, glowLight };
  }

  if (kind === "gift-box") {
    // Boîte-Case Calendrier 3D avec couvercle articulé, ruban et numéro du jour
    const boxBody = new Mesh(
      new CylinderGeometry(0.95, 0.95, 1.05, 4),
      accentMat,
    );
    boxBody.rotation.y = Math.PI / 4;
    boxBody.position.y = -0.22;
    root.add(boxBody);

    // Rubans verticaux dorés sur le corps
    const ribbonMat = new MeshPhysicalMaterial({
      color: GOLD_HEX,
      roughness: 0.24,
      metalness: 0.65,
      clearcoat: 0.9,
    });
    const ribbonFront = new Mesh(
      new PlaneGeometry(0.24, 1.07),
      ribbonMat,
    );
    ribbonFront.position.set(0, -0.22, 0.68);
    root.add(ribbonFront);

    // Numéro du jour sur la face
    if (badgeText) {
      const dayTex = createStampDiscTexture("#161317", badgeText, "#fcca59");
      const dayBadge = new Mesh(
        new PlaneGeometry(0.54, 0.54),
        new MeshBasicMaterial({ map: dayTex }),
      );
      dayBadge.position.set(0, -0.22, 0.7);
      root.add(dayBadge);
    }

    // Couvercle articulé sur charnière arrière
    const lidPivot = new Group();
    lidPivot.position.set(0, 0.32, -0.68);

    const lidCap = new Mesh(
      new CylinderGeometry(1.03, 1.03, 0.24, 4),
      inkMat,
    );
    lidCap.rotation.y = Math.PI / 4;
    lidCap.position.set(0, 0.12, 0.68);
    lidPivot.add(lidCap);

    // Nœud cadeau sur le dessus
    const bowL = new Mesh(new TorusGeometry(0.22, 0.065, 12, 24), ribbonMat);
    bowL.position.set(-0.22, 0.34, 0.68);
    bowL.rotation.z = 0.45;
    lidPivot.add(bowL);

    const bowR = new Mesh(new TorusGeometry(0.22, 0.065, 12, 24), ribbonMat);
    bowR.position.set(0.22, 0.34, 0.68);
    bowR.rotation.z = -0.45;
    lidPivot.add(bowR);
    root.add(lidPivot);

    // Étoile surprise qui jaillit de la boîte à l'ouverture
    const orbPivot = new Group();
    orbPivot.position.set(0, 0.05, 0);
    const starGeo = new ExtrudeGeometry(createStarShape(0.42, 0.2, 5), {
      depth: 0.12,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 2,
    });
    starGeo.center();
    const surpriseStar = new Mesh(starGeo, goldMat);
    orbPivot.add(surpriseStar);
    orbPivot.visible = false;
    root.add(orbPivot);

    return { root, lidPivot, orbPivot, haloRing, glowLight };
  }

  if (kind === "chest") {
    // Coffre au trésor verni Pixar (corps + bandes dorées + couvercle voûté + orbe de rareté)
    const chestBodyMat = new MeshPhysicalMaterial({
      color: 0x7c3f1d,
      roughness: 0.35,
      metalness: 0.1,
      clearcoat: 0.72,
    });
    const base = new Mesh(
      new CylinderGeometry(0.98, 0.9, 0.76, 4),
      chestBodyMat,
    );
    base.rotation.y = Math.PI / 4;
    base.scale.set(1.25, 1, 0.85);
    base.position.y = -0.34;
    root.add(base);

    // Serrure dorée avant
    const lockPlate = new Mesh(
      new CylinderGeometry(0.2, 0.2, 0.12, 6),
      goldMat,
    );
    lockPlate.rotation.x = Math.PI / 2;
    lockPlate.position.set(0, 0.02, 0.64);
    root.add(lockPlate);

    // Couvercle voûté articulé
    const lidPivot = new Group();
    lidPivot.position.set(0, 0.05, -0.58);

    const lidArch = new Mesh(
      new CylinderGeometry(0.58, 0.58, 1.72, 20, 1, false, 0, Math.PI),
      chestBodyMat,
    );
    lidArch.rotation.z = Math.PI / 2;
    lidArch.position.set(0, 0.0, 0.58);
    lidPivot.add(lidArch);

    // Deux arceaux dorés sur le couvercle
    [-0.54, 0.54].forEach((x) => {
      const band = new Mesh(
        new TorusGeometry(0.6, 0.055, 10, 24, Math.PI),
        goldMat,
      );
      band.rotation.y = Math.PI / 2;
      band.position.set(x, 0, 0.58);
      lidPivot.add(band);
    });
    root.add(lidPivot);

    // Orbe / médaillon de collection tinté selon la rareté
    const rarityHex = RARITY_HEX[rarity];
    const orbPivot = new Group();
    orbPivot.position.set(0, -0.05, 0);
    const orb = new Mesh(
      new OctahedronGeometry(0.42, 1),
      new MeshPhysicalMaterial({
        color: rarityHex,
        roughness: 0.12,
        metalness: 0.25,
        clearcoat: 1.0,
        emissive: new Color(rarityHex),
        emissiveIntensity: 0.28,
      }),
    );
    orbPivot.add(orb);
    const orbHalo = new Mesh(new TorusGeometry(0.56, 0.035, 10, 36), goldMat);
    orbHalo.rotation.x = Math.PI * 0.35;
    orbPivot.add(orbHalo);
    orbPivot.visible = false;
    root.add(orbPivot);

    glowLight.color.setHex(rarityHex);
    return { root, lidPivot, orbPivot, haloRing, glowLight };
  }

  if (kind === "passport-seal") {
    // Sceau VIP / Passeport 3D (carte bleu nuit + sceau doré qui claque)
    const cardMat = new MeshPhysicalMaterial({
      color: 0x1e2545,
      roughness: 0.32,
      metalness: 0.2,
      clearcoat: 0.8,
    });
    const card = new Mesh(
      new CylinderGeometry(1.15, 1.15, 0.12, 4),
      cardMat,
    );
    card.rotation.y = Math.PI / 4;
    card.rotation.x = Math.PI / 2;
    card.scale.set(1.15, 0.82, 1);
    card.position.z = -0.18;
    root.add(card);

    const cardBorder = new Mesh(
      new TorusGeometry(0.95, 0.045, 12, 40),
      goldMat,
    );
    cardBorder.position.z = -0.06;
    root.add(cardBorder);

    // Sceau tampon doré en relief
    const stampPivot = new Group();
    const sealBase = new Mesh(
      new CylinderGeometry(0.62, 0.66, 0.18, 32),
      goldMat,
    );
    sealBase.rotation.x = Math.PI / 2;
    stampPivot.add(sealBase);

    const sealTex = createStampDiscTexture(
      "#267f53",
      badgeText || "★",
      "#fcca59",
    );
    const sealFace = new Mesh(
      new PlaneGeometry(0.92, 0.92),
      new MeshBasicMaterial({ map: sealTex }),
    );
    sealFace.position.z = 0.095;
    stampPivot.add(sealFace);
    root.add(stampPivot);

    return { root, stampPivot, haloRing, glowLight };
  }

  if (kind === "clover-miss") {
    // Trèfle porte-bonheur 3D espiègle (4 feuilles émaillées menthe/vert + cœur doré)
    const leafMat = new MeshPhysicalMaterial({
      color: MINT_HEX,
      roughness: 0.22,
      metalness: 0.12,
      clearcoat: 0.92,
    });
    const offsets: [number, number][] = [
      [0, 0.44],
      [0.44, 0],
      [0, -0.44],
      [-0.44, 0],
    ];
    for (const [ox, oy] of offsets) {
      const leaf = new Mesh(new SphereGeometry(0.42, 24, 24), leafMat);
      leaf.scale.set(1, 1, 0.45);
      leaf.position.set(ox, oy, 0);
      root.add(leaf);
    }
    const centerGem = new Mesh(new SphereGeometry(0.24, 20, 20), goldMat);
    centerGem.position.z = 0.14;
    root.add(centerGem);

    const stem = new Mesh(
      new CylinderGeometry(0.06, 0.08, 0.56, 12),
      new MeshStandardMaterial({ color: GREEN_HEX, roughness: 0.4 }),
    );
    stem.position.set(0.08, -0.84, -0.02);
    stem.rotation.z = 0.22;
    root.add(stem);

    return { root, haloRing, glowLight };
  }

  // "spinner-seal" — Jeton d'attente en rotation douce (jeux d'adresse / Pause Chance)
  const coin = new Mesh(new CylinderGeometry(0.76, 0.76, 0.16, 36), goldMat);
  coin.rotation.x = Math.PI / 2;
  root.add(coin);

  const centerRing = new Mesh(new TorusGeometry(0.52, 0.06, 12, 32), inkMat);
  centerRing.position.z = 0.09;
  root.add(centerRing);

  const starGeo = new ExtrudeGeometry(createStarShape(0.34, 0.15, 5), {
    depth: 0.08,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  starGeo.center();
  const centerStar = new Mesh(starGeo, accentMat);
  centerStar.position.z = 0.11;
  root.add(centerStar);

  return { root, haloRing, glowLight };
}

function disposeObjectTree(root: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();

  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    geometries.add(obj.geometry);
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      materials.add(mat);
      if ("map" in mat && mat.map instanceof Texture) {
        textures.add(mat.map);
      }
    }
  });

  textures.forEach((t) => t.dispose());
  materials.forEach((m) => m.dispose());
  geometries.forEach((g) => g.dispose());
}

/* ==========================================================================
   MONTAGE & BOUCLE PHYSIQUE (RESSORT + INTERACTION TACTILE + CLEANUP STRICT)
   ========================================================================== */
export function mountResultScene3D(options: MountScene3DOptions): MountedScene3D {
  const {
    container,
    kind,
    accentColor,
    rarity = "common",
    badgeText,
    reducedMotion = false,
    onFallback,
  } = options;

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
  } catch {
    onFallback?.();
    return { setPhase: () => {}, destroy: () => {} };
  }

  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const width = Math.max(container.clientWidth || 240, 120);
  const height = Math.max(container.clientHeight || 200, 100);
  renderer.setSize(width, height, false);
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.display = "block";
  renderer.domElement.setAttribute("aria-hidden", "true");
  container.innerHTML = "";
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  const envTarget = createHighContrastStudioEnv(renderer);
  scene.environment = envTarget.texture;

  const camera = new PerspectiveCamera(36, width / height, 0.1, 30);
  camera.position.set(0, 0.22, 4.35);
  camera.lookAt(0, 0, 0);

  // Éclairage studio équilibré (identique à la DA du site)
  const hemi = new HemisphereLight(0xfff5e0, 0x261d36, 0.95);
  scene.add(hemi);
  const keyLight = new DirectionalLight(0xffffff, 1.55);
  keyLight.position.set(2.8, 4.4, 3.8);
  scene.add(keyLight);
  const rimLight = new DirectionalLight(0xff80c0, 0.85);
  rimLight.position.set(-3.4, 1.5, -2.5);
  scene.add(rimLight);

  // Ombre douce au sol
  const shadowTex = createSoftShadowTexture(0.28);
  const shadowPlane = new Mesh(
    new PlaneGeometry(2.6, 2.6),
    new MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    }),
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = -1.12;
  scene.add(shadowPlane);

  const accentHex = parseSafeHex(accentColor);
  const rig = buildRig(kind, accentHex, rarity, badgeText);
  scene.add(rig.root);

  const confetti = createConfettiSystem(accentHex);
  scene.add(confetti.group);

  let currentPhase: Scene3DPhase = options.phase;
  let phaseElapsed = 0;
  let springScale = 0.01;
  let springVel = 0;
  let pointerX = 0;
  let pointerY = 0;
  let visibleInViewport = true;
  let destroyed = false;
  let rafId = 0;

  const applyPhaseEnter = (next: Scene3DPhase, initial = false) => {
    currentPhase = next;
    phaseElapsed = 0;

    if (next === "win") {
      springScale = initial ? 0.25 : 0.72;
      springVel = 6.2;
      if (!reducedMotion) {
        confetti.burst(36, false);
      }
      if (rig.stampPivot && kind === "golden-ticket") {
        rig.stampPivot.visible = true;
        rig.stampPivot.scale.setScalar(2.4);
      }
      if (rig.orbPivot) {
        rig.orbPivot.visible = true;
      }
    } else if (next === "stamp") {
      springScale = 1.25;
      springVel = -4.2;
      if (!reducedMotion) {
        confetti.burst(16, true);
      }
    } else if (next === "loss") {
      springScale = 0.45;
      springVel = 3.8;
      if (!reducedMotion) {
        confetti.burst(14, true);
      }
    } else if (next === "tension") {
      springScale = 0.92;
      springVel = 1.2;
    } else {
      springScale = 1.0;
      springVel = 0;
    }
  };

  applyPhaseEnter(currentPhase, true);

  // Pose statique nette pour prefers-reduced-motion (1 seul rendu WebGL, 0 rAF)
  if (reducedMotion) {
    rig.root.scale.setScalar(1);
    if (rig.lidPivot && (currentPhase === "win" || currentPhase === "loss")) {
      rig.lidPivot.rotation.x = currentPhase === "win" ? -1.85 : -0.75;
    }
    if (rig.orbPivot && currentPhase === "win") {
      rig.orbPivot.visible = true;
      rig.orbPivot.position.y = 0.85;
    }
    if (rig.stampPivot && kind === "golden-ticket" && currentPhase === "win") {
      rig.stampPivot.visible = true;
      rig.stampPivot.scale.setScalar(1);
    }
    if (currentPhase === "loss" && kind === "clover-miss") {
      rig.root.rotation.z = -0.18;
    }
    renderer.render(scene, camera);
  }

  const handlePointerMove = (e: PointerEvent) => {
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    pointerX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    pointerY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  };
  const handlePointerLeave = () => {
    pointerX = 0;
    pointerY = 0;
  };
  container.addEventListener("pointermove", handlePointerMove, { passive: true });
  container.addEventListener("pointerleave", handlePointerLeave, { passive: true });

  const resizeObserver = new ResizeObserver(() => {
    if (destroyed) return;
    const w = Math.max(container.clientWidth || 240, 120);
    const h = Math.max(container.clientHeight || 200, 100);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    if (reducedMotion) {
      renderer.render(scene, camera);
    }
  });
  resizeObserver.observe(container);

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      visibleInViewport = entries[0]?.isIntersecting ?? true;
    },
    { threshold: 0.05 },
  );
  intersectionObserver.observe(container);

  const handleContextLost = (ev: Event) => {
    ev.preventDefault();
    if (rafId) cancelAnimationFrame(rafId);
    onFallback?.();
  };
  renderer.domElement.addEventListener("webglcontextlost", handleContextLost);

  let lastTime = performance.now();

  const tick = (now: number) => {
    if (destroyed) return;
    rafId = requestAnimationFrame(tick);
    if (!visibleInViewport) {
      lastTime = now;
      return;
    }

    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    phaseElapsed += dt;

    // Physique ressort douce (identique aux ressorts du site principal)
    const targetScale = 1.0;
    const stiffness = 135;
    const damping = 13.5;
    const force = -stiffness * (springScale - targetScale) - damping * springVel;
    springVel += force * dt;
    springScale = Math.max(0.05, springScale + springVel * dt);

    const idleBob = Math.sin(phaseElapsed * 2.4) * 0.07;

    if (currentPhase === "tension") {
      const shakeFreq = 26;
      const ramp = MathUtils.clamp(phaseElapsed / 0.75, 0.25, 1);
      if (kind === "spinner-seal") {
        rig.root.rotation.y += dt * 4.4;
        rig.root.rotation.x = Math.sin(phaseElapsed * 3.5) * 0.16;
        rig.root.scale.setScalar(1 + Math.sin(phaseElapsed * 8) * 0.05);
      } else if (kind === "golden-ticket") {
        rig.root.rotation.y += dt * (2.6 + ramp * 5.2);
        rig.root.position.y = Math.sin(phaseElapsed * 14) * 0.06;
        rig.root.scale.setScalar(1 + ramp * 0.08);
      } else {
        // Coffre ou boîte qui tremble et gonfle d'anticipation
        rig.root.rotation.z = Math.sin(phaseElapsed * shakeFreq) * 0.12 * ramp;
        rig.root.rotation.y = Math.sin(phaseElapsed * 11) * 0.18 * ramp;
        const squash = 1 + Math.sin(phaseElapsed * 18) * 0.05 * ramp;
        rig.root.scale.set(squash, 1 / squash + ramp * 0.05, squash);
      }
      if (rig.glowLight) {
        rig.glowLight.intensity = 1.2 + Math.sin(phaseElapsed * 14) * 0.8;
      }
    } else if (currentPhase === "win") {
      rig.root.scale.setScalar(springScale);
      rig.root.position.y = idleBob + Math.max(0, (1 - Math.min(phaseElapsed * 2.2, 1)) * 0.24);
      const spinDecay = Math.exp(-phaseElapsed * 2.2);
      rig.root.rotation.y =
        spinDecay * Math.PI * 1.15 +
        Math.sin(phaseElapsed * 1.45) * 0.26 +
        pointerX * 0.35;
      rig.root.rotation.x = -0.06 + pointerY * 0.2;
      rig.root.rotation.z = Math.sin(phaseElapsed * 1.8) * 0.04;

      // Ouverture couvercle (boîte / coffre)
      if (rig.lidPivot) {
        const lidTarget = -1.92;
        rig.lidPivot.rotation.x = MathUtils.lerp(
          rig.lidPivot.rotation.x,
          lidTarget,
          Math.min(1, dt * 8.5),
        );
      }
      // Orbe / étoile surprise qui jaillit du coffre ou de la boîte
      if (rig.orbPivot) {
        rig.orbPivot.position.y = MathUtils.lerp(
          rig.orbPivot.position.y,
          0.92 + Math.sin(phaseElapsed * 3.2) * 0.07,
          Math.min(1, dt * 6.5),
        );
        rig.orbPivot.rotation.y += dt * 1.8;
      }
      // Tampon vert qui claque sur le Ticket d'Or
      if (rig.stampPivot && kind === "golden-ticket") {
        const tStamp = MathUtils.clamp((phaseElapsed - 0.18) * 5.2, 0, 1);
        const eased = 1 - Math.pow(1 - tStamp, 3);
        const scale = MathUtils.lerp(2.4, 1.0, eased);
        rig.stampPivot.scale.setScalar(scale);
        rig.stampPivot.position.z = MathUtils.lerp(1.1, 0.22, eased);
      }
      // Onde lumineuse brève à l'impact
      if (rig.haloRing) {
        const haloT = MathUtils.clamp(phaseElapsed / 0.65, 0, 1);
        rig.haloRing.scale.setScalar(0.75 + haloT * 1.55);
        const haloMat = rig.haloRing.material;
        if (haloMat instanceof MeshBasicMaterial) {
          haloMat.opacity = (1 - haloT) * 0.65;
        }
      }
      if (rig.glowLight) {
        rig.glowLight.intensity = MathUtils.lerp(3.2, 1.1, Math.min(1, phaseElapsed));
      }
    } else if (currentPhase === "stamp") {
      rig.root.scale.setScalar(springScale);
      rig.root.rotation.y = pointerX * 0.28 + Math.sin(phaseElapsed * 1.5) * 0.12;
      rig.root.rotation.x = pointerY * 0.18;
      if (rig.stampPivot) {
        const punch = MathUtils.clamp(phaseElapsed * 5.5, 0, 1);
        const z = punch < 0.45
          ? MathUtils.lerp(1.25, -0.05, punch / 0.45)
          : MathUtils.lerp(-0.05, 0.08, (punch - 0.45) / 0.55);
        rig.stampPivot.position.z = z;
      }
      if (rig.haloRing) {
        const haloT = MathUtils.clamp(phaseElapsed / 0.55, 0, 1);
        rig.haloRing.scale.setScalar(0.8 + haloT * 1.35);
        const haloMat = rig.haloRing.material;
        if (haloMat instanceof MeshBasicMaterial) {
          haloMat.opacity = (1 - haloT) * 0.55;
        }
      }
    } else if (currentPhase === "loss") {
      rig.root.scale.setScalar(springScale);
      rig.root.position.y = idleBob * 0.8;
      // Bascule espiègle et chaleureuse (jamais figée)
      const wobble = Math.sin(phaseElapsed * 6.5) * Math.exp(-phaseElapsed * 2.1) * 0.24;
      rig.root.rotation.z = -0.14 + wobble;
      rig.root.rotation.y = Math.sin(phaseElapsed * 1.3) * 0.28 + pointerX * 0.3;
      rig.root.rotation.x = pointerY * 0.18;
      if (rig.lidPivot) {
        rig.lidPivot.rotation.x = MathUtils.lerp(
          rig.lidPivot.rotation.x,
          -0.78,
          Math.min(1, dt * 6),
        );
      }
      if (rig.glowLight) {
        rig.glowLight.intensity = 0.6;
      }
    } else {
      // idle (ex: Ticket d'Or en attente du tap)
      rig.root.scale.setScalar(1);
      rig.root.position.y = idleBob;
      rig.root.rotation.y = Math.sin(phaseElapsed * 1.15) * 0.28 + pointerX * 0.35;
      rig.root.rotation.x = Math.cos(phaseElapsed * 0.9) * 0.08 + pointerY * 0.22;
      if (rig.glowLight) {
        rig.glowLight.intensity = 0.75 + Math.sin(phaseElapsed * 2.2) * 0.25;
      }
    }

    confetti.update(dt);
    renderer.render(scene, camera);
  };

  if (!reducedMotion) {
    rafId = requestAnimationFrame(tick);
  }

  return {
    setPhase(nextPhase: Scene3DPhase) {
      if (destroyed || nextPhase === currentPhase) return;
      applyPhaseEnter(nextPhase, false);
      if (reducedMotion) {
        if (rig.lidPivot && (nextPhase === "win" || nextPhase === "loss")) {
          rig.lidPivot.rotation.x = nextPhase === "win" ? -1.85 : -0.75;
        }
        if (rig.orbPivot && nextPhase === "win") {
          rig.orbPivot.visible = true;
          rig.orbPivot.position.y = 0.85;
        }
        if (rig.stampPivot && kind === "golden-ticket" && nextPhase === "win") {
          rig.stampPivot.visible = true;
          rig.stampPivot.scale.setScalar(1);
        }
        renderer.render(scene, camera);
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", handlePointerLeave);
      renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
      disposeObjectTree(scene);
      shadowTex.dispose();
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}

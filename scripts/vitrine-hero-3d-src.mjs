import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  CanvasTexture,
  Color,
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
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Scene,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  WebGLRenderer,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * Construit un environnement studio HDRI chaud "Pixar x Kermesse"
 * (softboxes crème, rebond doré, contre-jour rose pop & menthe)
 * afin que chaque biseau et vernis capte de vrais reflets cinématographiques.
 */
function createKermesseStudioEnv(renderer) {
  const pmrem = new PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new Scene();
  envScene.background = new Color(0xfef7ea);

  const addPanel = (color, intensity, pos, rot, scale) => {
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

  // Grande boîte à lumière studio au plafond (crème chaud)
  addPanel(0xfff9ec, 2.4, [0, 7, 1], [Math.PI / 2, 0, 0], [12, 10]);
  // Key light dorée douce à gauche
  addPanel(0xffe19c, 2.1, [-7, 2.5, 4], [0, Math.PI / 2.6, 0], [8, 7]);
  // Fill light rose kermesse à droite
  addPanel(0xffbdd8, 1.55, [7.5, 1.2, 3.5], [0, -Math.PI / 2.6, 0], [7, 7]);
  // Rim light menthe fraîche derrière en haut
  addPanel(0xa8f5cf, 1.4, [1.5, 4.5, -7], [0.25, 0, 0], [9, 5]);
  // Rebond chaud par le sol
  addPanel(0xf7dfb8, 1.15, [0, -6, 0], [-Math.PI / 2, 0, 0], [14, 14]);

  const rt = pmrem.fromScene(envScene, 0.045);
  pmrem.dispose();
  envScene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
  return rt;
}

/** Crée une texture d'ombre de contact radiale ultra-douce. */
function createContactShadowTexture() {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.05,
    size / 2,
    size / 2,
    size * 0.48,
  );
  grad.addColorStop(0, "rgba(38, 26, 22, 0.30)");
  grad.addColorStop(0.5, "rgba(38, 26, 22, 0.11)");
  grad.addColorStop(1, "rgba(38, 26, 22, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Crée la texture du faisceau optique de scan (doré-menthe subtil). */
function createScanBeamTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "rgba(128, 237, 153, 0)");
  grad.addColorStop(0.42, "rgba(255, 225, 110, 0.42)");
  grad.addColorStop(0.5, "rgba(255, 255, 245, 0.92)");
  grad.addColorStop(0.58, "rgba(128, 237, 153, 0.48)");
  grad.addColorStop(1, "rgba(128, 237, 153, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 128);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Charge l'image SVG du QR code sur un canvas haute définition 1024x1024. */
function loadQrCanvasTexture(imgSrc, maxAniso) {
  return new Promise((resolve) => {
    const size = 1024;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");

    const drawCardFrame = () => {
      ctx.fillStyle = "#fffdf8";
      ctx.fillRect(0, 0, size, size);
    };

    drawCardFrame();

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      drawCardFrame();
      const pad = 74;
      ctx.drawImage(img, pad, pad, size - pad * 2, size - pad * 2);
      const tex = new CanvasTexture(c);
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = Math.min(8, maxAniso || 4);
      tex.needsUpdate = true;
      resolve(tex);
    };
    img.onerror = () => {
      // Fallback géométrique propre si l'image ne charge pas
      ctx.fillStyle = "#161317";
      ctx.fillRect(160, 160, 180, 180);
      ctx.fillRect(684, 160, 180, 180);
      ctx.fillRect(160, 684, 180, 180);
      const tex = new CanvasTexture(c);
      tex.colorSpace = SRGBColorSpace;
      resolve(tex);
    };
    img.src = imgSrc;
  });
}

/** Construit une étoile 5 branches potelée façon émail Pixar. */
function createPuffedStarMesh(material) {
  const shape = new Shape();
  const points = 5;
  const outerR = 0.27;
  const innerR = 0.135;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (i * Math.PI) / points - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const geo = new ExtrudeGeometry(shape, {
    depth: 0.06,
    bevelEnabled: true,
    bevelThickness: 0.065,
    bevelSize: 0.048,
    bevelSegments: 5,
    curveSegments: 16,
  });
  geo.center();
  return new Mesh(geo, material);
}

/** Construit un mini ticket kermesse échancré en 3D avec bande dorée. */
function createKermesseTicketGroup(mintMat, brassMat) {
  const group = new Group();
  const w = 0.44;
  const h = 0.27;
  const n = 0.055;
  const s = new Shape();
  s.moveTo(-w / 2, -h / 2);
  s.lineTo(w / 2, -h / 2);
  s.lineTo(w / 2, -n);
  s.absarc(w / 2, 0, n, -Math.PI / 2, Math.PI / 2, true);
  s.lineTo(w / 2, h / 2);
  s.lineTo(-w / 2, h / 2);
  s.lineTo(-w / 2, n);
  s.absarc(-w / 2, 0, n, Math.PI / 2, -Math.PI / 2, true);
  s.closePath();

  const geo = new ExtrudeGeometry(s, {
    depth: 0.036,
    bevelEnabled: true,
    bevelThickness: 0.022,
    bevelSize: 0.018,
    bevelSegments: 4,
    curveSegments: 14,
  });
  geo.center();
  const body = new Mesh(geo, mintMat);
  group.add(body);

  const stripe = new Mesh(
    new RoundedBoxGeometry(0.28, 0.055, 0.088, 3, 0.018),
    brassMat,
  );
  group.add(stripe);
  return group;
}

/** Construit un jeton doré biseauté avec relief central. */
function createGoldenTokenGroup(brassMat, accentMat) {
  const group = new Group();
  const disc = new Mesh(new CylinderGeometry(0.25, 0.25, 0.07, 36), brassMat);
  disc.rotation.x = Math.PI / 2;
  group.add(disc);

  const rimFront = new Mesh(new TorusGeometry(0.215, 0.026, 14, 36), brassMat);
  rimFront.position.z = 0.028;
  group.add(rimFront);

  const rimBack = rimFront.clone();
  rimBack.position.z = -0.028;
  group.add(rimBack);

  const gem = new Mesh(new SphereGeometry(0.085, 20, 16), accentMat);
  gem.scale.set(1, 1, 0.55);
  gem.position.z = 0.025;
  group.add(gem);

  return group;
}

async function initHeroPixar3D() {
  const btn = document.getElementById("hero-qr-play-btn");
  if (!btn || btn.dataset.hero3dInit === "1") return;
  btn.dataset.hero3dInit = "1";

  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Test léger de disponibilité WebGL sans bruit console
  const testCanvas = document.createElement("canvas");
  const gl =
    testCanvas.getContext("webgl2", { alpha: true, antialias: true }) ||
    testCanvas.getContext("webgl", { alpha: true, antialias: true });
  if (!gl) return;

  const qrImg = btn.querySelector("img.qr-bleed-img");
  const qrSrc = qrImg ? qrImg.getAttribute("src") || "img/qr-code.svg" : "img/qr-code.svg";

  const stageHost = document.createElement("span");
  stageHost.className = "hero-3d-stage";
  stageHost.setAttribute("aria-hidden", "true");
  btn.appendChild(stageHost);

  const renderer = new WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setClearColor(0x000000, 0);

  const canvas = renderer.domElement;
  canvas.className = "hero-3d-canvas";
  stageHost.appendChild(canvas);

  const scene = new Scene();
  const envRT = createKermesseStudioEnv(renderer);
  scene.environment = envRT.texture;

  const camera = new PerspectiveCamera(33, 1, 0.1, 40);
  camera.position.set(0, 0.12, 7.65);

  // Éclairage 3 points chaud type studio Pixar
  const hemi = new HemisphereLight(0xfff9ec, 0xf3d4b8, 0.85);
  scene.add(hemi);

  const keyLight = new DirectionalLight(0xfff3d6, 1.55);
  keyLight.position.set(-3.4, 4.6, 5.2);
  scene.add(keyLight);

  const rimLight = new DirectionalLight(0xffb5d8, 0.95);
  rimLight.position.set(4.2, 2.2, -3.0);
  scene.add(rimLight);

  const warmGlowLight = new PointLight(0xffd966, 0.75, 9, 1.6);
  warmGlowLight.position.set(0, 0.4, 2.6);
  scene.add(warmGlowLight);

  // Matériaux PBR tactiles (zéro arête crue, vernis satiné + laiton brossé)
  const yellowEnamel = new MeshPhysicalMaterial({
    color: 0xffd93d,
    roughness: 0.24,
    metalness: 0.02,
    clearcoat: 0.9,
    clearcoatRoughness: 0.13,
    envMapIntensity: 1.2,
  });

  const coralTrim = new MeshPhysicalMaterial({
    color: 0xf58245,
    roughness: 0.26,
    metalness: 0.03,
    clearcoat: 0.85,
    clearcoatRoughness: 0.15,
    envMapIntensity: 1.15,
  });

  const creamPorcelain = new MeshPhysicalMaterial({
    color: 0xfffbf2,
    roughness: 0.24,
    metalness: 0.0,
    clearcoat: 0.78,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.1,
  });

  const brushedBrass = new MeshPhysicalMaterial({
    color: 0xebb948,
    roughness: 0.22,
    metalness: 0.88,
    clearcoat: 0.45,
    clearcoatRoughness: 0.18,
    envMapIntensity: 1.35,
  });

  const candyPinkEnamel = new MeshPhysicalMaterial({
    color: 0xf296bd,
    roughness: 0.18,
    metalness: 0.04,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.25,
  });

  const mintEnamel = new MeshPhysicalMaterial({
    color: 0x80ed99,
    roughness: 0.22,
    metalness: 0.02,
    clearcoat: 0.92,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.18,
  });

  // Groupe racine du chevalet + charmes
  const root = new Group();
  scene.add(root);

  const easel = new Group();
  root.add(easel);

  // 1. Coque principale potelée (jaune kermesse satiné)
  const outerShell = new Mesh(
    new RoundedBoxGeometry(2.38, 2.52, 0.34, 7, 0.28),
    yellowEnamel,
  );
  easel.add(outerShell);

  // 2. Socle / bande corail rétro en bas du chevalet
  const baseCollar = new Mesh(
    new RoundedBoxGeometry(2.46, 0.34, 0.40, 6, 0.15),
    coralTrim,
  );
  baseCollar.position.set(0, -1.16, 0.01);
  easel.add(baseCollar);

  // 3. Rebord laiton brossé entourant le QR
  const brassBezel = new Mesh(
    new RoundedBoxGeometry(1.94, 1.98, 0.365, 6, 0.21),
    brushedBrass,
  );
  brassBezel.position.set(0, 0.06, 0.01);
  easel.add(brassBezel);

  // 4. Plaque porcelaine crème en retrait doux
  const innerPlate = new Mesh(
    new RoundedBoxGeometry(1.80, 1.84, 0.385, 6, 0.17),
    creamPorcelain,
  );
  innerPlate.position.set(0, 0.06, 0.015);
  easel.add(innerPlate);

  // 5. Béquille arrière articulée (visible dès qu'on incline le chevalet)
  const backLeg = new Mesh(
    new RoundedBoxGeometry(0.96, 1.72, 0.14, 5, 0.06),
    creamPorcelain,
  );
  backLeg.position.set(0, -0.22, -0.52);
  backLeg.rotation.x = 0.42;
  easel.add(backLeg);

  const hingeBar = new Mesh(
    new CylinderGeometry(0.055, 0.055, 1.12, 20),
    brushedBrass,
  );
  hingeBar.rotation.z = Math.PI / 2;
  hingeBar.position.set(0, 0.56, -0.20);
  easel.add(hingeBar);

  // 6. 14 ampoules miniatures de fête foraine autour du cadre
  const bulbCoords = [
    [-0.92, 1.14],
    [-0.46, 1.14],
    [0.0, 1.14],
    [0.46, 1.14],
    [0.92, 1.14],
    [-1.06, 0.72],
    [-1.06, 0.26],
    [-1.06, -0.20],
    [-1.06, -0.66],
    [1.06, 0.72],
    [1.06, 0.26],
    [1.06, -0.20],
    [1.06, -0.66],
    [0.0, -1.16],
  ];

  const socketGeo = new CylinderGeometry(0.066, 0.076, 0.055, 16);
  const bulbGeo = new SphereGeometry(0.062, 18, 14);
  const bulbMeshes = [];

  bulbCoords.forEach(([bx, by], idx) => {
    const socket = new Mesh(socketGeo, brushedBrass);
    socket.rotation.x = Math.PI / 2;
    socket.position.set(bx, by, 0.175);
    easel.add(socket);

    const bulbMat = new MeshPhysicalMaterial({
      color: 0xfff8dc,
      emissive: new Color(idx % 2 === 0 ? 0xffd260 : 0xffe8a3),
      emissiveIntensity: 0.75,
      roughness: 0.14,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
    });
    const bulb = new Mesh(bulbGeo, bulbMat);
    bulb.position.set(bx, by, 0.225);
    easel.add(bulb);
    bulbMeshes.push(bulb);
  });

  // 7. Face QR haute définition + verre optique brillant
  const qrTexture = await loadQrCanvasTexture(
    qrSrc,
    renderer.capabilities.getMaxAnisotropy(),
  );
  const qrFaceMat = new MeshStandardMaterial({
    map: qrTexture,
    roughness: 0.34,
    metalness: 0.02,
    envMapIntensity: 0.65,
  });
  const qrPlane = new Mesh(new PlaneGeometry(1.56, 1.56), qrFaceMat);
  qrPlane.position.set(0, 0.06, 0.212);
  easel.add(qrPlane);

  const glassCover = new Mesh(
    new PlaneGeometry(1.64, 1.66),
    new MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.11,
      roughness: 0.06,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.6,
      depthWrite: false,
    }),
  );
  glassCover.position.set(0, 0.06, 0.22);
  easel.add(glassCover);

  // 8. Faisceau de scan optique (visible au survol uniquement)
  const scanMat = new MeshBasicMaterial({
    map: createScanBeamTexture(),
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const scanBeam = new Mesh(new PlaneGeometry(1.58, 0.24), scanMat);
  scanBeam.position.set(0, 0.06, 0.226);
  easel.add(scanBeam);

  // 9. Trois micro-charmes Pixar en orbite lente autour du chevalet
  const token = createGoldenTokenGroup(brushedBrass, coralTrim);
  token.position.set(-1.46, 0.88, 0.32);
  root.add(token);

  const star = createPuffedStarMesh(candyPinkEnamel);
  star.position.set(1.48, -0.78, 0.36);
  root.add(star);

  const ticket = createKermesseTicketGroup(mintEnamel, brushedBrass);
  ticket.position.set(1.44, 0.86, 0.22);
  root.add(ticket);

  // 10. Ombre de contact douce sous le chevalet
  const shadowMat = new MeshBasicMaterial({
    map: createContactShadowTexture(),
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  });
  const contactShadow = new Mesh(new PlaneGeometry(2.9, 0.9), shadowMat);
  contactShadow.position.set(0, -1.68, -0.1);
  root.add(contactShadow);

  // Dimensionnement responsive
  const resize = () => {
    const rect = stageHost.getBoundingClientRect();
    const w = Math.max(240, Math.round(rect.width || 310));
    const h = Math.max(240, Math.round(rect.height || 310));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();

  // État physique à ressort (suivi curseur + survol + squash & stretch clic)
  const heroSection = document.getElementById("top") || btn;
  let targetRotY = -0.14;
  let targetRotX = 0.06;
  let curRotY = -0.22;
  let curRotX = 0.08;
  let isHovering = false;
  let hoverAmt = 0;
  let clickPop = 0;
  let clickVel = 0;
  let isVisible = true;
  let rafId = 0;
  let lastTime = performance.now();

  const onPointerMove = (e) => {
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const nx = MathUtils.clamp((e.clientX - cx) / 360, -1, 1);
    const ny = MathUtils.clamp((e.clientY - cy) / 300, -1, 1);
    targetRotY = nx * 0.34;
    targetRotX = ny * 0.22;
  };

  const onPointerLeaveHero = () => {
    targetRotY = -0.12;
    targetRotX = 0.05;
  };

  heroSection.addEventListener("pointermove", onPointerMove, { passive: true });
  heroSection.addEventListener("pointerleave", onPointerLeaveHero, { passive: true });

  btn.addEventListener("pointerenter", () => {
    isHovering = true;
  });
  btn.addEventListener("pointerleave", () => {
    isHovering = false;
  });
  btn.addEventListener("pointerdown", () => {
    clickVel = -3.4;
  });

  // Pause GPU automatique hors écran
  if (typeof IntersectionObserver === "function") {
    const io = new IntersectionObserver(
      (entries) => {
        isVisible = entries[0]?.isIntersecting ?? true;
        if (isVisible && !reducedMotion && !rafId) {
          lastTime = performance.now();
          rafId = requestAnimationFrame(tick);
        }
      },
      { threshold: 0.05 },
    );
    io.observe(btn);
  }

  window.addEventListener("resize", resize, { passive: true });
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    btn.classList.remove("is-3d-ready");
  });

  const renderFrame = (t, dt) => {
    const ease = 1 - Math.exp(-dt * 7.5);
    const idleYaw = reducedMotion ? -0.14 : Math.sin(t * 0.85) * 0.09;
    const idlePitch = reducedMotion ? 0.06 : Math.cos(t * 0.65) * 0.045;

    curRotY += (targetRotY + idleYaw - curRotY) * ease;
    curRotX += (targetRotX + idlePitch - curRotX) * ease;

    hoverAmt += ((isHovering ? 1 : 0) - hoverAmt) * (1 - Math.exp(-dt * 8));

    // Ressort élastique squash & stretch au clic
    const springF = -140 * clickPop - 14 * clickVel;
    clickVel += springF * dt;
    clickPop += clickVel * dt;

    const floatY = reducedMotion ? 0 : Math.sin(t * 1.45) * 0.085;
    easel.position.y = floatY + hoverAmt * 0.06;
    easel.rotation.y = curRotY;
    easel.rotation.x = curRotX;
    easel.rotation.z = -curRotY * 0.12;

    const baseScale = 1 + hoverAmt * 0.045;
    easel.scale.set(
      baseScale * (1 - clickPop * 0.07),
      baseScale * (1 + clickPop * 0.09),
      baseScale,
    );

    // Chasse lumineuse douce des ampoules kermesse
    const chaseSpeed = 2.0 + hoverAmt * 3.4;
    for (let i = 0; i < bulbMeshes.length; i++) {
      const wave = 0.5 + 0.5 * Math.sin(t * chaseSpeed - i * 0.55);
      bulbMeshes[i].material.emissiveIntensity =
        0.55 + wave * (0.75 + hoverAmt * 0.55);
    }

    // Faisceau optique de scan uniquement au survol
    scanMat.opacity = hoverAmt * 0.72;
    if (hoverAmt > 0.01) {
      scanBeam.position.y = 0.06 + Math.sin(t * 3.2) * 0.66;
    }

    // Orbite organique lente des 3 charmes Pixar
    const drift = reducedMotion ? 0 : 1;
    token.position.y = 0.88 + Math.sin(t * 1.65 + 0.4) * 0.09 * drift;
    token.rotation.y = 0.4 + t * 0.65 * drift + curRotY * 0.7;
    token.rotation.x = 0.22 + Math.sin(t * 1.1) * 0.14 * drift;

    star.position.y = -0.78 + Math.sin(t * 1.8 + 2.1) * 0.095 * drift;
    star.rotation.z = -0.18 + Math.sin(t * 1.2) * 0.16 * drift;
    star.rotation.y = -0.35 + Math.cos(t * 0.9) * 0.28 * drift + curRotY * 0.5;

    ticket.position.y = 0.86 + Math.sin(t * 1.5 + 4.0) * 0.08 * drift;
    ticket.rotation.z = 0.24 + Math.sin(t * 1.35) * 0.12 * drift;
    ticket.rotation.y = -0.25 + curRotY * 0.6;

    // Ombre au sol synchronisée avec la lévitation
    const shadowScale = 1 - floatY * 0.45 - hoverAmt * 0.06;
    contactShadow.scale.set(shadowScale, shadowScale, 1);
    shadowMat.opacity = 0.78 - floatY * 0.7 - hoverAmt * 0.12;

    renderer.render(scene, camera);
  };

  // Premier rendu immédiat + fondu d'apparition sans flash
  renderFrame(0, 0.016);
  btn.classList.add("is-3d-ready");

  function tick(now) {
    if (!isVisible) {
      rafId = 0;
      return;
    }
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;
    renderFrame(now * 0.001, dt);
    rafId = requestAnimationFrame(tick);
  }

  if (!reducedMotion) {
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }
}

// Chargement différé propre après premier paint pour préserver un LCP instantané
const boot = () => {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => void initHeroPixar3D(), { timeout: 900 });
  } else {
    setTimeout(() => void initHeroPixar3D(), 80);
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}

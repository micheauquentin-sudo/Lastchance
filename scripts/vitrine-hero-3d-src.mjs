import {
  ACESFilmicToneMapping,
  AdditiveBlending,
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
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  RingGeometry,
  Scene,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  WebGLRenderer,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/* ==========================================================================
   ENVIRONNEMENT STUDIO HDRI CHAUD (PIXAR × KERMESSE)
   ========================================================================== */
function createStudioEnv(renderer) {
  const pmrem = new PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new Scene();
  envScene.background = new Color(0xfef9f0);

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

  // Softbox plafond crème + key dorée douce + fill rose + rim menthe
  addPanel(0xfffaf0, 2.35, [0, 7, 1.5], [Math.PI / 2, 0, 0], [12, 10]);
  addPanel(0xffe6a8, 2.0, [-7, 2.8, 4.5], [0, Math.PI / 2.6, 0], [8, 7]);
  addPanel(0xffc6df, 1.45, [7.5, 1.5, 3.8], [0, -Math.PI / 2.6, 0], [7, 7]);
  addPanel(0xb4f7d4, 1.3, [1.5, 4.5, -7], [0.25, 0, 0], [9, 5]);
  addPanel(0xf7e4c5, 1.1, [0, -6, 0], [-Math.PI / 2, 0, 0], [14, 14]);

  const rt = pmrem.fromScene(envScene, 0.045);
  pmrem.dispose();
  envScene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
  return rt;
}

function createSoftShadowTexture(alpha = 0.28) {
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
  grad.addColorStop(0, `rgba(22, 19, 23, ${alpha})`);
  grad.addColorStop(0.52, `rgba(22, 19, 23, ${alpha * 0.36})`);
  grad.addColorStop(1, "rgba(22, 19, 23, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function createScanBeamTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "rgba(128, 237, 153, 0)");
  grad.addColorStop(0.4, "rgba(128, 237, 153, 0.42)");
  grad.addColorStop(0.5, "rgba(255, 255, 255, 0.96)");
  grad.addColorStop(0.6, "rgba(255, 217, 61, 0.45)");
  grad.addColorStop(1, "rgba(255, 217, 61, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 128);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function loadQrCanvasTexture(imgSrc, maxAniso) {
  return new Promise((resolve) => {
    const size = 1024;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");

    const drawBg = () => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
    };
    drawBg();

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      drawBg();
      const pad = 68;
      ctx.drawImage(img, pad, pad, size - pad * 2, size - pad * 2);
      const tex = new CanvasTexture(c);
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = Math.min(8, maxAniso || 4);
      tex.needsUpdate = true;
      resolve(tex);
    };
    img.onerror = () => {
      ctx.fillStyle = "#161317";
      ctx.fillRect(150, 150, 190, 190);
      ctx.fillRect(684, 150, 190, 190);
      ctx.fillRect(150, 684, 190, 190);
      const tex = new CanvasTexture(c);
      tex.colorSpace = SRGBColorSpace;
      resolve(tex);
    };
    img.src = imgSrc;
  });
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return Boolean(
      c.getContext("webgl2", { alpha: true, antialias: true }) ||
        c.getContext("webgl", { alpha: true, antialias: true }),
    );
  } catch {
    return false;
  }
}

/* ==========================================================================
   1. HERO — QR CODE 3D PUR ET ÉPURÉ (RIEN AUTOUR, RENDU PORCELAINE/VERRE)
   ========================================================================== */
async function initHeroPureQr3D() {
  const btn = document.getElementById("hero-qr-play-btn");
  if (!btn || btn.dataset.hero3dInit === "1") return;
  btn.dataset.hero3dInit = "1";

  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  renderer.toneMappingExposure = 1.08;
  renderer.setClearColor(0x000000, 0);

  const canvas = renderer.domElement;
  canvas.className = "hero-3d-canvas";
  stageHost.appendChild(canvas);

  const scene = new Scene();
  const envRT = createStudioEnv(renderer);
  scene.environment = envRT.texture;

  const camera = new PerspectiveCamera(31, 1, 0.1, 30);
  camera.position.set(0, 0.05, 6.2);

  scene.add(new HemisphereLight(0xffffff, 0xf3e4d0, 0.85));

  const keyLight = new DirectionalLight(0xfff7e6, 1.45);
  keyLight.position.set(-3.2, 4.4, 5.4);
  scene.add(keyLight);

  const rimLight = new DirectionalLight(0xffd0e6, 0.75);
  rimLight.position.set(3.8, 2.0, -2.6);
  scene.add(rimLight);

  // Bloc QR 3D pur : porcelaine blanche brillante + tranche encre satinée
  const qrTile = new Group();
  scene.add(qrTile);

  const inkBackShell = new Mesh(
    new RoundedBoxGeometry(2.38, 2.38, 0.26, 8, 0.28),
    new MeshPhysicalMaterial({
      color: 0x1a171d,
      roughness: 0.28,
      metalness: 0.08,
      clearcoat: 0.85,
      clearcoatRoughness: 0.14,
      envMapIntensity: 1.15,
    }),
  );
  inkBackShell.position.z = -0.025;
  qrTile.add(inkBackShell);

  const porcelainBody = new Mesh(
    new RoundedBoxGeometry(2.26, 2.26, 0.26, 8, 0.24),
    new MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.18,
      metalness: 0.0,
      clearcoat: 0.95,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.15,
    }),
  );
  porcelainBody.position.z = 0.015;
  qrTile.add(porcelainBody);

  const qrTexture = await loadQrCanvasTexture(
    qrSrc,
    renderer.capabilities.getMaxAnisotropy(),
  );
  const qrPlane = new Mesh(
    new PlaneGeometry(1.94, 1.94),
    new MeshStandardMaterial({
      map: qrTexture,
      roughness: 0.28,
      metalness: 0.01,
      envMapIntensity: 0.55,
    }),
  );
  qrPlane.position.z = 0.148;
  qrTile.add(qrPlane);

  // Verre optique transparent pour les reflets spéculaires réalistes
  const glassCover = new Mesh(
    new PlaneGeometry(2.04, 2.04),
    new MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.1,
      roughness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.55,
      depthWrite: false,
    }),
  );
  glassCover.position.z = 0.154;
  qrTile.add(glassCover);

  // Faisceau discret de scan uniquement au survol
  const scanMat = new MeshBasicMaterial({
    map: createScanBeamTexture(),
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const scanBeam = new Mesh(new PlaneGeometry(1.96, 0.24), scanMat);
  scanBeam.position.z = 0.16;
  qrTile.add(scanBeam);

  // Ombre douce sous le QR
  const shadowMat = new MeshBasicMaterial({
    map: createSoftShadowTexture(0.28),
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const shadowPlane = new Mesh(new PlaneGeometry(2.55, 0.72), shadowMat);
  shadowPlane.position.set(0, -1.46, -0.1);
  scene.add(shadowPlane);

  const resize = () => {
    const rect = stageHost.getBoundingClientRect();
    const w = Math.max(220, Math.round(rect.width || 290));
    const h = Math.max(220, Math.round(rect.height || 290));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();

  const heroSection = document.getElementById("top") || btn;
  let targetRotY = -0.11;
  let targetRotX = 0.05;
  let curRotY = -0.16;
  let curRotX = 0.06;
  let isHovering = false;
  let hoverAmt = 0;
  let clickPop = 0;
  let clickVel = 0;
  let isVisible = true;
  let rafId = 0;
  let lastTime = performance.now();

  heroSection.addEventListener(
    "pointermove",
    (e) => {
      const rect = btn.getBoundingClientRect();
      const nx = MathUtils.clamp((e.clientX - (rect.left + rect.width / 2)) / 360, -1, 1);
      const ny = MathUtils.clamp((e.clientY - (rect.top + rect.height / 2)) / 300, -1, 1);
      targetRotY = nx * 0.34;
      targetRotX = ny * 0.24;
    },
    { passive: true },
  );
  heroSection.addEventListener(
    "pointerleave",
    () => {
      targetRotY = -0.11;
      targetRotX = 0.05;
    },
    { passive: true },
  );

  btn.addEventListener("pointerenter", () => {
    isHovering = true;
  });
  btn.addEventListener("pointerleave", () => {
    isHovering = false;
  });
  btn.addEventListener("pointerdown", () => {
    clickVel = -3.4;
  });

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
    const idleYaw = reducedMotion ? -0.11 : Math.sin(t * 0.85) * 0.075;
    const idlePitch = reducedMotion ? 0.05 : Math.cos(t * 0.65) * 0.04;

    curRotY += (targetRotY + idleYaw - curRotY) * ease;
    curRotX += (targetRotX + idlePitch - curRotX) * ease;
    hoverAmt += ((isHovering ? 1 : 0) - hoverAmt) * (1 - Math.exp(-dt * 8));

    const springF = -145 * clickPop - 14 * clickVel;
    clickVel += springF * dt;
    clickPop += clickVel * dt;

    const floatY = reducedMotion ? 0 : Math.sin(t * 1.45) * 0.07;
    qrTile.position.y = floatY + hoverAmt * 0.05;
    qrTile.rotation.y = curRotY;
    qrTile.rotation.x = curRotX;
    qrTile.rotation.z = -curRotY * 0.08;

    const baseScale = 1 + hoverAmt * 0.045;
    qrTile.scale.set(
      baseScale * (1 - clickPop * 0.065),
      baseScale * (1 + clickPop * 0.085),
      baseScale,
    );

    scanMat.opacity = hoverAmt * 0.72;
    if (hoverAmt > 0.01) {
      scanBeam.position.y = Math.sin(t * 3.1) * 0.82;
    }

    const sScale = 1 - floatY * 0.45 - hoverAmt * 0.06;
    shadowPlane.scale.set(sScale, sScale, 1);
    shadowMat.opacity = 0.82 - floatY * 0.8 - hoverAmt * 0.14;

    renderer.render(scene, camera);
  };

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

/* ==========================================================================
   2. PARCOURS 3D CONTINU — ILS SCANNENT · ILS JOUENT · ILS GAGNENT
      Vraie mini-séquence Pixar 3D dans #motion-stage :
      - Acte 1 : Smartphone 3D qui s'approche du QR de table, vise & scanne
      - Acte 2 : Zoom caméra sur 3 rouleaux cylindriques 3D qui tournent
                 et s'alignent 1 par 1 (💎 💎 💎) avec rebond élastique
      - Acte 3 : Ticket d'Or 3D qui jaillit hors de l'écran + tampon vert
                 VALIDÉ + pluie de confettis 3D en gravité réelle
   ========================================================================== */
function createReelStripTexture(maxAniso) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 1024;
  const ctx = c.getContext("2d");

  const symbols = [
    { bg: "#fff9e6", icon: "💎", ring: "#60a5fa" },
    { bg: "#fff2f7", icon: "🎁", ring: "#f296bd" },
    { bg: "#eefdf3", icon: "⭐", ring: "#ffd93d" },
    { bg: "#f4f0ff", icon: "🍒", ring: "#fb7185" },
    { bg: "#fff7e8", icon: "7️⃣", ring: "#f59e0b" },
    { bg: "#eef8ff", icon: "🎟️", ring: "#38bdf8" },
  ];

  const bandH = c.height / symbols.length;
  symbols.forEach((s, idx) => {
    const y = idx * bandH;
    ctx.fillStyle = s.bg;
    ctx.fillRect(0, y, c.width, bandH);

    // Séparateur doré discret entre cases
    ctx.fillStyle = "rgba(232, 184, 75, 0.35)";
    ctx.fillRect(0, y, c.width, 4);

    // Pastille douce derrière le symbole
    ctx.beginPath();
    ctx.arc(c.width / 2, y + bandH / 2, 58, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = s.ring;
    ctx.stroke();

    ctx.font = "82px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s.icon, c.width / 2, y + bandH / 2 + 6);
  });

  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAniso || 4);
  return tex;
}

function createPhoneScreenTexture(mode, statusText) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 896;
  const ctx = c.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, 0, c.height);
  if (mode === "scan") {
    grad.addColorStop(0, "#1c1926");
    grad.addColorStop(1, "#2a233b");
  } else if (mode === "win") {
    grad.addColorStop(0, "#fff8dc");
    grad.addColorStop(1, "#ffe08a");
  } else {
    grad.addColorStop(0, "#241d35");
    grad.addColorStop(1, "#3a2452");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);

  // Encoche dynamique
  ctx.fillStyle = "#111015";
  ctx.beginPath();
  ctx.roundRect(176, 26, 160, 32, 16);
  ctx.fill();

  if (mode === "scan") {
    // Viseur caméra lumineux
    const bx = 96;
    const by = 220;
    const bw = 320;
    const bh = 320;
    const arm = 54;
    ctx.strokeStyle = "#80ed99";
    ctx.lineWidth = 14;
    ctx.lineCap = "round";

    const corners = [
      [bx, by, 1, 1],
      [bx + bw, by, -1, 1],
      [bx, by + bh, 1, -1],
      [bx + bw, by + bh, -1, -1],
    ];
    corners.forEach(([x, y, dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(x + dx * arm, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * arm);
      ctx.stroke();
    });

    // Pilule détection
    ctx.fillStyle = "#80ed99";
    ctx.beginPath();
    ctx.roundRect(96, 610, 320, 74, 37);
    ctx.fill();
    ctx.fillStyle = "#141218";
    ctx.font = "900 30px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(statusText || "✓ QR DÉTECTÉ", 256, 648);
  } else if (mode === "play") {
    // En-tête jeu instantané sur l'écran du téléphone
    ctx.fillStyle = "#ffd93d";
    ctx.beginPath();
    ctx.roundRect(72, 92, 368, 66, 33);
    ctx.fill();
    ctx.fillStyle = "#161317";
    ctx.font = "900 28px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SIMPLE COMME QR", 256, 126);

    // Cadre fenêtre rouleaux
    ctx.fillStyle = "#14101d";
    ctx.beginPath();
    ctx.roundRect(42, 230, 428, 340, 32);
    ctx.fill();
    ctx.strokeStyle = "#ebb948";
    ctx.lineWidth = 10;
    ctx.stroke();

    // Bandeau bas
    ctx.fillStyle = "#f296bd";
    ctx.beginPath();
    ctx.roundRect(76, 650, 360, 78, 39);
    ctx.fill();
    ctx.fillStyle = "#161317";
    ctx.font = "900 28px system-ui, -apple-system, sans-serif";
    ctx.fillText(statusText || "💎 JACKPOT !", 256, 690);
  } else {
    ctx.fillStyle = "#161317";
    ctx.font = "900 34px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🎉 BRAVO !", 256, 160);
    ctx.fillStyle = "#5c4a1d";
    ctx.font = "700 24px system-ui, -apple-system, sans-serif";
    ctx.fillText("Présentez votre ticket", 256, 760);
    ctx.fillText("en caisse", 256, 796);
  }

  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function drawGoldenTicketTexture(canvas, rewardTitle, ticketCode) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#fff5c2");
  grad.addColorStop(0.45, "#ffd93d");
  grad.addColorStop(1, "#f7b731");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Bordure intérieure pointillée style ticket de kermesse
  ctx.strokeStyle = "#161317";
  ctx.lineWidth = 10;
  ctx.setLineDash([18, 12]);
  ctx.beginPath();
  ctx.roundRect(26, 26, w - 52, h - 52, 28);
  ctx.stroke();
  ctx.setLineDash([]);

  // Bandeau haut
  ctx.fillStyle = "#161317";
  ctx.beginPath();
  ctx.roundRect(170, 56, w - 340, 62, 31);
  ctx.fill();
  ctx.fillStyle = "#ffd93d";
  ctx.font = "900 30px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🎉 FÉLICITATIONS !", w / 2, 88);

  // Lot gagné
  ctx.fillStyle = "#161317";
  ctx.font = "900 44px system-ui, -apple-system, sans-serif";
  const label = (rewardTitle || "-20% SUR L'ADDITION").slice(0, 26);
  ctx.fillText(label, w / 2, 215);

  // Boîte code caisse sécurisé
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(140, 290, w - 280, 128, 22);
  ctx.fill();
  ctx.strokeStyle = "#161317";
  ctx.lineWidth = 7;
  ctx.stroke();

  ctx.fillStyle = "#5c5142";
  ctx.font = "800 22px system-ui, -apple-system, sans-serif";
  ctx.fillText("CODE CAISSE UNIQUE", w / 2, 326);

  ctx.fillStyle = "#161317";
  ctx.font = "900 50px ui-monospace, SFMono-Regular, monospace";
  ctx.fillText(ticketCode || "QR-7K2M", w / 2, 380);
}

function createStampTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 176;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#047857";
  ctx.beginPath();
  ctx.roundRect(12, 12, 488, 152, 34);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 10;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 44px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("✓ VALIDÉ EN CAISSE", 256, 90);

  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function createNotchedTicketGeometry(w, h) {
  const n = 0.22;
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
    depth: 0.09,
    bevelEnabled: true,
    bevelThickness: 0.045,
    bevelSize: 0.035,
    bevelSegments: 4,
    curveSegments: 16,
  });
  geo.center();
  return geo;
}

async function initParcours3DCinema() {
  const motionStage = document.getElementById("motion-stage");
  if (!motionStage || motionStage.dataset.parcours3dInit === "1") return;
  const screenFrame = motionStage.querySelector(".motion-screen-frame");
  if (!screenFrame) return;
  motionStage.dataset.parcours3dInit = "1";

  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) return;

  const host = document.createElement("div");
  host.className = "parcours-3d-stage";
  host.setAttribute("aria-hidden", "true");
  screenFrame.appendChild(host);

  // Bandeau discret de légende synchro avec l'étape active
  const captionPill = document.createElement("div");
  captionPill.className = "parcours-3d-caption";
  captionPill.textContent = "1. Le client approche son smartphone du QR";
  host.appendChild(captionPill);

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
  canvas.className = "parcours-3d-canvas";
  host.appendChild(canvas);

  const scene = new Scene();
  const envRT = createStudioEnv(renderer);
  scene.environment = envRT.texture;

  const camera = new PerspectiveCamera(35, 1.25, 0.1, 40);
  camera.position.set(0, 0.35, 7.2);

  scene.add(new HemisphereLight(0xfff9ee, 0xf2d9c2, 0.9));
  const key = new DirectionalLight(0xfff4dd, 1.5);
  key.position.set(-4, 5, 6);
  scene.add(key);
  const rim = new DirectionalLight(0xffb8d9, 0.95);
  rim.position.set(4.5, 2.5, -3);
  scene.add(rim);
  const winGlow = new PointLight(0xffd93d, 0, 10, 1.5);
  winGlow.position.set(0, 0.2, 2.5);
  scene.add(winGlow);

  // Matériaux PBR Pixar
  const phoneChassisMat = new MeshPhysicalMaterial({
    color: 0x1e1b26,
    roughness: 0.22,
    metalness: 0.25,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
  });
  const brassMat = new MeshPhysicalMaterial({
    color: 0xebb948,
    roughness: 0.2,
    metalness: 0.9,
    clearcoat: 0.5,
  });
  const creamMat = new MeshPhysicalMaterial({
    color: 0xfffdf7,
    roughness: 0.2,
    metalness: 0.0,
    clearcoat: 0.9,
    clearcoatRoughness: 0.1,
  });
  const mintGlowMat = new MeshBasicMaterial({
    color: 0x80ed99,
    transparent: true,
    opacity: 0.22,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });

  /* ── ACTEUR A : PLAQUE QR DE TABLE (Acte 1) ── */
  const qrStandGroup = new Group();
  scene.add(qrStandGroup);

  const standBase = new Mesh(
    new RoundedBoxGeometry(1.72, 1.72, 0.2, 6, 0.2),
    creamMat,
  );
  qrStandGroup.add(standBase);

  const standRim = new Mesh(
    new RoundedBoxGeometry(1.82, 1.82, 0.16, 6, 0.22),
    brassMat,
  );
  standRim.position.z = -0.025;
  qrStandGroup.add(standRim);

  const heroQrImg = document.querySelector("#hero-qr-play-btn img.qr-bleed-img");
  const qrTex = await loadQrCanvasTexture(
    heroQrImg ? heroQrImg.getAttribute("src") || "img/qr-code.svg" : "img/qr-code.svg",
    renderer.capabilities.getMaxAnisotropy(),
  );
  const standQrFace = new Mesh(
    new PlaneGeometry(1.42, 1.42),
    new MeshStandardMaterial({ map: qrTex, roughness: 0.3 }),
  );
  standQrFace.position.z = 0.106;
  qrStandGroup.add(standQrFace);

  // Anneau vert de confirmation scan
  const scanRingMat = new MeshBasicMaterial({
    color: 0x34d399,
    transparent: true,
    opacity: 0,
    side: DoubleSide,
    depthWrite: false,
  });
  const scanRing = new Mesh(new RingGeometry(0.95, 1.12, 48), scanRingMat);
  scanRing.position.z = 0.12;
  qrStandGroup.add(scanRing);

  /* ── ACTEUR B : SMARTPHONE 3D PIXAR + ROUES CYLINDRIQUES 3D ── */
  const phoneGroup = new Group();
  scene.add(phoneGroup);

  const phoneBody = new Mesh(
    new RoundedBoxGeometry(2.05, 3.62, 0.24, 7, 0.22),
    phoneChassisMat,
  );
  phoneGroup.add(phoneBody);

  const phoneBrassRim = new Mesh(
    new RoundedBoxGeometry(2.11, 3.68, 0.18, 7, 0.24),
    brassMat,
  );
  phoneGroup.add(phoneBrassRim);

  const texScanScreen = createPhoneScreenTexture("scan", "✓ QR DÉTECTÉ !");
  const texPlayScreen = createPhoneScreenTexture("play", "💎 3 DIAMANTS !");
  const texWinScreen = createPhoneScreenTexture("win");

  const screenMat = new MeshStandardMaterial({
    map: texScanScreen,
    roughness: 0.18,
    metalness: 0.02,
  });
  const phoneScreen = new Mesh(new PlaneGeometry(1.84, 3.36), screenMat);
  phoneScreen.position.z = 0.124;
  phoneGroup.add(phoneScreen);

  // Module optique caméra arrière (visible en Acte 1 quand le tel pointe le QR)
  const camBump = new Mesh(
    new RoundedBoxGeometry(0.62, 0.62, 0.08, 4, 0.12),
    phoneChassisMat,
  );
  camBump.position.set(-0.46, 1.24, -0.14);
  phoneGroup.add(camBump);

  const lensRing = new Mesh(new TorusGeometry(0.14, 0.032, 12, 28), brassMat);
  lensRing.position.set(-0.46, 1.24, -0.185);
  phoneGroup.add(lensRing);

  // Cône lumineux de scan projeté depuis l'objectif vers le QR (Acte 1)
  const scanCone = new Mesh(new ConeGeometry(0.85, 2.1, 28, 1, true), mintGlowMat);
  scanCone.rotation.x = Math.PI / 2;
  scanCone.position.set(-0.1, 0.35, -1.25);
  phoneGroup.add(scanCone);

  // 3 VRAIS ROULEAUX CYLINDRIQUES 3D (Acte 2) sur la face du smartphone
  const reelsGroup = new Group();
  reelsGroup.position.set(0, 0.05, 0.18);
  phoneGroup.add(reelsGroup);

  const reelTex = createReelStripTexture(renderer.capabilities.getMaxAnisotropy());
  const reelGeo = new CylinderGeometry(0.46, 0.46, 0.46, 36, 1, true);
  reelGeo.rotateZ(Math.PI / 2);

  const reelMat = new MeshPhysicalMaterial({
    map: reelTex,
    roughness: 0.24,
    metalness: 0.02,
    clearcoat: 0.75,
    clearcoatRoughness: 0.14,
  });

  const reels = [-0.52, 0, 0.52].map((rx) => {
    const mesh = new Mesh(reelGeo, reelMat);
    mesh.position.set(rx, 0, 0);
    reelsGroup.add(mesh);
    return mesh;
  });

  // Cadre doré brillant autour des 3 rouleaux
  const reelFrameTop = new Mesh(new RoundedBoxGeometry(1.74, 0.09, 0.16, 4, 0.03), brassMat);
  reelFrameTop.position.set(0, 0.52, 0.36);
  reelsGroup.add(reelFrameTop);
  const reelFrameBot = reelFrameTop.clone();
  reelFrameBot.position.y = -0.52;
  reelsGroup.add(reelFrameBot);

  // Levier de machine à sous sur le flanc droit du téléphone
  const leverPivot = new Group();
  leverPivot.position.set(1.06, 0.1, 0.05);
  reelsGroup.add(leverPivot);
  const leverStick = new Mesh(new CylinderGeometry(0.035, 0.035, 0.65, 16), brassMat);
  leverStick.position.set(0.1, 0.32, 0);
  leverStick.rotation.z = -0.22;
  leverPivot.add(leverStick);
  const leverKnob = new Mesh(
    new SphereGeometry(0.14, 20, 16),
    new MeshPhysicalMaterial({
      color: 0xe11d48,
      roughness: 0.16,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    }),
  );
  leverKnob.position.set(0.18, 0.66, 0);
  leverPivot.add(leverKnob);

  // Halo circulaire de jackpot derrière le téléphone
  const winHaloMat = new MeshBasicMaterial({
    color: 0xffd93d,
    transparent: true,
    opacity: 0,
    side: DoubleSide,
    depthWrite: false,
  });
  const winHalo = new Mesh(new RingGeometry(1.35, 1.68, 48), winHaloMat);
  winHalo.position.set(0, 0, -0.4);
  phoneGroup.add(winHalo);

  /* ── ACTEUR C : TICKET D'OR 3D + TAMPON VERT VALIDÉ + CONFETTIS 3D (Acte 3) ── */
  const ticketGroup = new Group();
  scene.add(ticketGroup);

  const ticketCanvas = document.createElement("canvas");
  ticketCanvas.width = 1024;
  ticketCanvas.height = 512;
  drawGoldenTicketTexture(ticketCanvas, "-20% SUR L'ADDITION", "QR-7K2M");
  const ticketTex = new CanvasTexture(ticketCanvas);
  ticketTex.colorSpace = SRGBColorSpace;
  ticketTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const ticketBody = new Mesh(createNotchedTicketGeometry(3.25, 1.72), brassMat);
  ticketGroup.add(ticketBody);

  const ticketFace = new Mesh(
    new PlaneGeometry(3.04, 1.54),
    new MeshPhysicalMaterial({
      map: ticketTex,
      roughness: 0.24,
      metalness: 0.12,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
    }),
  );
  ticketFace.position.z = 0.095;
  ticketGroup.add(ticketFace);

  // Tampon 3D "✓ VALIDÉ EN CAISSE" qui se pose sur le ticket
  const stampMesh = new Mesh(
    new RoundedBoxGeometry(1.38, 0.44, 0.08, 4, 0.04),
    new MeshPhysicalMaterial({
      map: createStampTexture(),
      roughness: 0.28,
      clearcoat: 0.7,
    }),
  );
  stampMesh.position.set(0.68, -0.46, 0.16);
  stampMesh.rotation.z = -0.14;
  ticketGroup.add(stampMesh);

  // 34 confettis 3D physiques
  const confettiGroup = new Group();
  scene.add(confettiGroup);
  const confettiPalette = [0xffd93d, 0xf296bd, 0x80ed99, 0xf58245, 0xc4a3ff, 0x38bdf8];
  const confettiGeo = new PlaneGeometry(0.18, 0.1);
  const confettiItems = [];
  for (let i = 0; i < 34; i++) {
    const mat = new MeshStandardMaterial({
      color: confettiPalette[i % confettiPalette.length],
      roughness: 0.25,
      metalness: 0.25,
      side: DoubleSide,
    });
    const m = new Mesh(confettiGeo, mat);
    m.visible = false;
    confettiGroup.add(m);
    confettiItems.push({
      mesh: m,
      vx: 0,
      vy: 0,
      vz: 0,
      rx: 0,
      ry: 0,
      rz: 0,
    });
  }

  const spawn3DConfetti = () => {
    confettiItems.forEach((p, i) => {
      const a = (i / confettiItems.length) * Math.PI * 2 + (i % 3) * 0.2;
      const spd = 2.4 + (i % 5) * 0.72;
      p.mesh.visible = true;
      p.mesh.position.set(0, 0.2, 0.3);
      p.vx = Math.cos(a) * spd * 0.9;
      p.vy = 2.6 + Math.abs(Math.sin(a)) * 2.4;
      p.vz = (Math.sin(i * 1.7) * 0.8) + 0.4;
      p.rx = (i % 2 === 0 ? 1 : -1) * (3 + (i % 4));
      p.ry = (i % 3 === 0 ? 1 : -1) * (2.5 + (i % 3));
      p.rz = (i % 2 === 0 ? -1 : 1) * 2.2;
    });
  };

  // Ombre douce au sol
  const floorShadow = new Mesh(
    new PlaneGeometry(4.6, 1.3),
    new MeshBasicMaterial({
      map: createSoftShadowTexture(0.24),
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    }),
  );
  floorShadow.position.set(0, -1.95, -0.2);
  scene.add(floorShadow);

  // Synchronisation avec les boutons / l'état de #motion-stage (piloté par app.js)
  let currentStep = 1;
  let stepElapsed = 0;
  let isVisible = false;
  let rafId = 0;
  let lastTime = performance.now();
  let pointerX = 0;
  let pointerY = 0;

  const rewardTitleEl = document.getElementById("m-reward-title");
  const ticketCodeEl = document.getElementById("m-ticket-code");

  const readActiveStep = () => {
    const active = motionStage.querySelector(".motion-scene.is-active");
    return active ? Number(active.dataset.step) || 1 : 1;
  };

  const onStepChange = (step) => {
    currentStep = step;
    stepElapsed = 0;
    if (step === 1) {
      screenMat.map = texScanScreen;
      captionPill.textContent = "1. Le client approche son smartphone du QR";
      confettiItems.forEach((p) => {
        p.mesh.visible = false;
      });
    } else if (step === 2) {
      screenMat.map = texPlayScreen;
      captionPill.textContent = "2. Il lance la partie — les 3 rouleaux s'alignent !";
      confettiItems.forEach((p) => {
        p.mesh.visible = false;
      });
    } else {
      screenMat.map = texWinScreen;
      captionPill.textContent = "3. Son Ticket d'Or s'affiche — validé en 2 s en caisse";
      drawGoldenTicketTexture(
        ticketCanvas,
        rewardTitleEl?.textContent?.trim(),
        ticketCodeEl?.textContent?.trim(),
      );
      ticketTex.needsUpdate = true;
      spawn3DConfetti();
    }
    screenMat.needsUpdate = true;
  };

  // Observe les transitions déclenchées par app.js (boucle auto ou clic manuel)
  const sceneEls = motionStage.querySelectorAll(".motion-scene");
  const mo = new MutationObserver(() => {
    const next = readActiveStep();
    if (next !== currentStep) onStepChange(next);
  });
  sceneEls.forEach((el) =>
    mo.observe(el, { attributes: true, attributeFilter: ["class"] }),
  );

  // Suivi curseur subtil sur le lecteur
  screenFrame.addEventListener(
    "pointermove",
    (e) => {
      const r = screenFrame.getBoundingClientRect();
      pointerX = MathUtils.clamp(((e.clientX - r.left) / Math.max(1, r.width) - 0.5) * 2, -1, 1);
      pointerY = MathUtils.clamp(((e.clientY - r.top) / Math.max(1, r.height) - 0.5) * 2, -1, 1);
    },
    { passive: true },
  );
  screenFrame.addEventListener(
    "pointerleave",
    () => {
      pointerX = 0;
      pointerY = 0;
    },
    { passive: true },
  );

  const resize = () => {
    const rect = host.getBoundingClientRect();
    const w = Math.max(260, Math.round(rect.width || 460));
    const h = Math.max(260, Math.round(rect.height || 380));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize, { passive: true });

  const renderAct = (dt) => {
    stepElapsed += dt;
    const ease = 1 - Math.exp(-dt * 6.5);

    // Légère orbite interactive au pointeur
    camera.position.x += (pointerX * 0.45 - camera.position.x) * ease;
    camera.position.y += (0.28 - pointerY * 0.28 - camera.position.y) * ease;
    camera.lookAt(0, 0, 0);

    if (currentStep === 1) {
      // ACTE 1 : Smartphone qui s'approche du QR posé sur table et le scanne
      const approach = Math.min(1, stepElapsed / 1.1);
      const smooth = 1 - Math.pow(1 - approach, 3);
      const scanned = stepElapsed > 1.35;

      qrStandGroup.visible = true;
      qrStandGroup.position.x += (-1.05 - qrStandGroup.position.x) * ease;
      qrStandGroup.position.y += (Math.sin(stepElapsed * 2.2) * 0.05 - qrStandGroup.position.y) * ease;
      qrStandGroup.position.z += (-0.25 - qrStandGroup.position.z) * ease;
      qrStandGroup.rotation.y += (0.32 - qrStandGroup.rotation.y) * ease;
      qrStandGroup.rotation.x += (-0.08 - qrStandGroup.rotation.x) * ease;
      const qrScale = scanned ? 1.06 + Math.sin((stepElapsed - 1.35) * 9) * 0.03 * Math.exp(-(stepElapsed - 1.35) * 2.5) : 1;
      qrStandGroup.scale.setScalar(qrScale);

      // Le smartphone arrive de la droite en se penchant vers le QR
      const targetPhoneX = MathUtils.lerp(2.55, 0.98, smooth);
      const targetPhoneY = MathUtils.lerp(-0.9, 0.08, smooth) + Math.sin(stepElapsed * 2.6) * 0.05;
      const targetPhoneZ = MathUtils.lerp(1.4, 0.45, smooth);
      phoneGroup.visible = true;
      phoneGroup.position.x += (targetPhoneX - phoneGroup.position.x) * ease;
      phoneGroup.position.y += (targetPhoneY - phoneGroup.position.y) * ease;
      phoneGroup.position.z += (targetPhoneZ - phoneGroup.position.z) * ease;
      phoneGroup.rotation.y += (-0.68 - phoneGroup.rotation.y) * ease;
      phoneGroup.rotation.x += (0.14 - phoneGroup.rotation.x) * ease;
      phoneGroup.rotation.z += (0.12 - phoneGroup.rotation.z) * ease;
      phoneGroup.scale.setScalar(0.84);

      scanCone.visible = true;
      mintGlowMat.opacity = scanned
        ? 0.34 + Math.sin(stepElapsed * 14) * 0.1
        : 0.16 + smooth * 0.12;

      scanRingMat.opacity = scanned ? Math.max(0, 1 - (stepElapsed - 1.35) * 0.9) : 0;
      const ringScale = scanned ? 1 + (stepElapsed - 1.35) * 0.8 : 0.7;
      scanRing.scale.setScalar(ringScale);

      reelsGroup.visible = false;
      ticketGroup.visible = false;
      winHaloMat.opacity = 0;
      winGlow.intensity += (0.3 - winGlow.intensity) * ease;
    } else if (currentStep === 2) {
      // ACTE 2 : Le smartphone se place face caméra, levier tiré, 3 rouleaux 3D qui s'alignent !
      qrStandGroup.position.x += (-4.2 - qrStandGroup.position.x) * ease;
      qrStandGroup.scale.setScalar(Math.max(0.01, qrStandGroup.scale.x * (1 - dt * 5)));
      if (qrStandGroup.scale.x < 0.05) qrStandGroup.visible = false;

      phoneGroup.visible = true;
      phoneGroup.position.x += (0 - phoneGroup.position.x) * ease;
      phoneGroup.position.y += (Math.sin(stepElapsed * 2.4) * 0.05 - phoneGroup.position.y) * ease;
      phoneGroup.position.z += (1.15 - phoneGroup.position.z) * ease;
      phoneGroup.rotation.y += (Math.sin(stepElapsed * 1.4) * 0.14 - phoneGroup.rotation.y) * ease;
      phoneGroup.rotation.x += (-0.04 - phoneGroup.rotation.x) * ease;
      phoneGroup.rotation.z += (0 - phoneGroup.rotation.z) * ease;
      phoneGroup.scale.setScalar(1.02);

      scanCone.visible = false;
      reelsGroup.visible = true;
      ticketGroup.visible = false;

      // Levier tiré vers le bas puis remonte avec ressort
      const leverAngle = stepElapsed < 0.45 ? Math.sin((stepElapsed / 0.45) * Math.PI) * 1.05 : 0;
      leverPivot.rotation.x = leverAngle;

      // Les 3 rouleaux cylindriques tournent vite puis se verrouillent 1 par 1 sur 💎 (angle 0)
      const stopTimes = [0.85, 1.3, 1.75];
      reels.forEach((reel, idx) => {
        const stopT = stopTimes[idx];
        if (stepElapsed < stopT) {
          reel.rotation.x = (stepElapsed * (15 + idx * 2.2)) % (Math.PI * 2);
        } else {
          const over = stepElapsed - stopT;
          // Rebond mécanique amorti sur le symbole 💎
          reel.rotation.x = Math.sin(over * 22) * 0.24 * Math.exp(-over * 7.5);
        }
      });

      const won = stepElapsed > 1.78;
      winHaloMat.opacity = won ? 0.55 + Math.sin(stepElapsed * 10) * 0.2 : 0;
      winHalo.scale.setScalar(won ? 1.08 + Math.sin(stepElapsed * 8) * 0.06 : 0.8);
      winGlow.intensity += ((won ? 1.65 : 0.5) - winGlow.intensity) * ease;
    } else {
      // ACTE 3 : Le Ticket d'Or 3D jaillit de l'écran vers nous + tampon vert + confettis 3D
      qrStandGroup.visible = false;
      scanCone.visible = false;
      reelsGroup.visible = false;

      phoneGroup.visible = true;
      phoneGroup.position.x += (-1.2 - phoneGroup.position.x) * ease;
      phoneGroup.position.y += (-0.35 - phoneGroup.position.y) * ease;
      phoneGroup.position.z += (-0.65 - phoneGroup.position.z) * ease;
      phoneGroup.rotation.y += (0.45 - phoneGroup.rotation.y) * ease;
      phoneGroup.rotation.x += (-0.18 - phoneGroup.rotation.x) * ease;
      phoneGroup.scale.setScalar(0.76);

      ticketGroup.visible = true;
      const popT = Math.min(1, stepElapsed / 0.65);
      // Courbe ressort élastique à l'apparition du ticket
      const elastic =
        popT >= 1
          ? 1
          : 1 + Math.pow(2, -8 * popT) * Math.sin((popT * 10 - 0.75) * ((2 * Math.PI) / 3));

      ticketGroup.position.set(
        0.22,
        Math.sin(stepElapsed * 2.1) * 0.07,
        MathUtils.lerp(-0.2, 1.35, Math.min(1, popT * 1.2)),
      );
      ticketGroup.rotation.y = -0.1 + Math.sin(stepElapsed * 1.6) * 0.16;
      ticketGroup.rotation.x = 0.04 + Math.cos(stepElapsed * 1.3) * 0.06;
      ticketGroup.rotation.z = -0.04;
      ticketGroup.scale.setScalar(Math.max(0.05, elastic * 0.96));

      // Tampon vert qui "claque" à t = 0.95s
      const stampStart = 0.95;
      if (stepElapsed < stampStart) {
        stampMesh.visible = false;
      } else {
        stampMesh.visible = true;
        const st = Math.min(1, (stepElapsed - stampStart) / 0.22);
        const sScale = MathUtils.lerp(2.2, 1.0, 1 - Math.pow(1 - st, 3));
        stampMesh.scale.setScalar(sScale);
        stampMesh.position.z = MathUtils.lerp(0.85, 0.16, st);
      }

      // Physique 3D des confettis
      confettiItems.forEach((p) => {
        if (!p.mesh.visible) return;
        p.vy -= 5.8 * dt;
        p.vx *= 1 - 0.8 * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.rotation.x += p.rx * dt;
        p.mesh.rotation.y += p.ry * dt;
        p.mesh.rotation.z += p.rz * dt;
        if (p.mesh.position.y < -3.2) p.mesh.visible = false;
      });

      winHaloMat.opacity = 0;
      winGlow.intensity += (1.3 - winGlow.intensity) * ease;
    }

    renderer.render(scene, camera);
  };

  onStepChange(readActiveStep());
  renderAct(0.016);
  screenFrame.classList.add("is-3d-parcours-ready");

  function tick(now) {
    if (!isVisible) {
      rafId = 0;
      return;
    }
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;
    renderAct(dt);
    rafId = requestAnimationFrame(tick);
  }

  if (typeof IntersectionObserver === "function") {
    const io = new IntersectionObserver(
      (entries) => {
        isVisible = entries[0]?.isIntersecting ?? false;
        if (isVisible && !rafId) {
          lastTime = performance.now();
          rafId = requestAnimationFrame(tick);
        }
      },
      { threshold: 0.08 },
    );
    io.observe(screenFrame);
  } else {
    isVisible = true;
    rafId = requestAnimationFrame(tick);
  }

  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    screenFrame.classList.remove("is-3d-parcours-ready");
  });
}

/* ==========================================================================
   AMORÇAGE DIFFÉRÉ (LCP INTACT, ZERO BLOQUAGE)
   ========================================================================== */
const bootAll = () => {
  if (!hasWebGL()) return;
  const run = () => {
    void initHeroPureQr3D();
    void initParcours3DCinema();
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 700 });
  } else {
    setTimeout(run, 60);
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootAll, { once: true });
} else {
  bootAll();
}

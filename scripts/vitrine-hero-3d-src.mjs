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

  // Softboxes studio chaudes + touches pastel pour l'iridescence de la bulle
  addPanel(0xffffff, 2.8, [-2.5, 7, 3], [Math.PI / 2.2, 0.2, 0], [10, 9]);
  addPanel(0xffe6a8, 2.2, [-7, 2.8, 4.5], [0, Math.PI / 2.6, 0], [8, 7]);
  addPanel(0xffb8db, 1.85, [7.5, 1.8, 3.8], [0, -Math.PI / 2.6, 0], [7, 7]);
  addPanel(0xa2f5cc, 1.75, [1.8, 4.8, -6.5], [0.25, 0, 0], [9, 5]);
  addPanel(0xd8c4ff, 1.45, [-5, -3.5, -4], [-0.4, 0.6, 0], [8, 6]);
  addPanel(0xf7e4c5, 1.15, [0, -6, 0], [-Math.PI / 2, 0, 0], [14, 14]);

  const rt = pmrem.fromScene(envScene, 0.035);
  pmrem.dispose();
  envScene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
  return rt;
}

function createSoftShadowTexture(alpha = 0.26) {
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
  grad.addColorStop(0.52, `rgba(22, 19, 23, ${alpha * 0.34})`);
  grad.addColorStop(1, "rgba(22, 19, 23, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function createBubbleGlintTexture() {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");

  // Croissant brillant façon bulle de savon Pixar (haut gauche)
  ctx.save();
  ctx.translate(size * 0.32, size * 0.28);
  ctx.rotate(-0.62);
  const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, 56);
  grad.addColorStop(0, "rgba(255, 255, 255, 0.92)");
  grad.addColorStop(0.42, "rgba(255, 255, 255, 0.45)");
  grad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = grad;
  ctx.scale(1.45, 0.62);
  ctx.beginPath();
  ctx.arc(0, 0, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Contre-reflet pastel doux en bas à droite
  ctx.save();
  ctx.translate(size * 0.72, size * 0.74);
  const rimGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 42);
  rimGrad.addColorStop(0, "rgba(242, 150, 189, 0.38)");
  rimGrad.addColorStop(0.5, "rgba(128, 237, 153, 0.22)");
  rimGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = rimGrad;
  ctx.beginPath();
  ctx.arc(0, 0, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function loadQrImage(imgSrc) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = imgSrc;
  });
}

function buildQrCanvasTextureFromImage(img, maxAniso) {
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  if (img) {
    const pad = 70;
    ctx.drawImage(img, pad, pad, size - pad * 2, size - pad * 2);
  } else {
    ctx.fillStyle = "#161317";
    ctx.fillRect(150, 150, 190, 190);
    ctx.fillRect(684, 150, 190, 190);
    ctx.fillRect(150, 684, 190, 190);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAniso || 4);
  tex.needsUpdate = true;
  return tex;
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
   1. HERO — QR CODE 3D PUR DANS UNE BULLE 3D GÉLATINEUSE HYPER-TRANSPARENTE
      - Rappelle les bulles pastel du site
      - Ondulation organique type gelée au repos et au survol
      - Éclate en gouttelettes irisées + onde au clic avant d'ouvrir la modale
      - Se regonfle avec un rebond élastique quand la modale se referme
   ========================================================================== */
async function initHeroBubbleQr3D() {
  const btn = document.getElementById("hero-qr-play-btn");
  if (!btn || btn.dataset.hero3dInit === "1") return;
  btn.dataset.hero3dInit = "1";

  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const qrImgEl = btn.querySelector("img.qr-bleed-img");
  const qrSrc = qrImgEl ? qrImgEl.getAttribute("src") || "img/qr-code.svg" : "img/qr-code.svg";
  const qrImg = await loadQrImage(qrSrc);

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
  const envRT = createStudioEnv(renderer);
  scene.environment = envRT.texture;

  const camera = new PerspectiveCamera(32, 1, 0.1, 30);
  camera.position.set(0, 0.04, 7.15);

  scene.add(new HemisphereLight(0xffffff, 0xf6e6d5, 0.9));
  const keyLight = new DirectionalLight(0xfff9ee, 1.5);
  keyLight.position.set(-3.4, 4.6, 5.6);
  scene.add(keyLight);
  const rimLight = new DirectionalLight(0xffc2e2, 1.0);
  rimLight.position.set(4.0, 2.2, -2.6);
  scene.add(rimLight);
  const mintRim = new DirectionalLight(0x9cf5c4, 0.7);
  mintRim.position.set(-3.2, -2.5, -2.5);
  scene.add(mintRim);

  // 1. Bloc QR 3D pur centré à l'intérieur de la bulle (rien d'autre autour)
  const qrTile = new Group();
  scene.add(qrTile);

  const inkBack = new Mesh(
    new RoundedBoxGeometry(1.74, 1.74, 0.18, 7, 0.2),
    new MeshPhysicalMaterial({
      color: 0x18151b,
      roughness: 0.25,
      metalness: 0.08,
      clearcoat: 0.85,
      clearcoatRoughness: 0.14,
    }),
  );
  inkBack.position.z = -0.02;
  qrTile.add(inkBack);

  const whiteBody = new Mesh(
    new RoundedBoxGeometry(1.66, 1.66, 0.18, 7, 0.17),
    new MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.16,
      clearcoat: 0.95,
      clearcoatRoughness: 0.08,
    }),
  );
  whiteBody.position.z = 0.012;
  qrTile.add(whiteBody);

  const qrTexture = buildQrCanvasTextureFromImage(
    qrImg,
    renderer.capabilities.getMaxAnisotropy(),
  );
  const qrPlane = new Mesh(
    new PlaneGeometry(1.44, 1.44),
    new MeshStandardMaterial({
      map: qrTexture,
      roughness: 0.26,
      metalness: 0.01,
      envMapIntensity: 0.5,
    }),
  );
  qrPlane.position.z = 0.106;
  qrTile.add(qrPlane);

  // 2. Bulle 3D gélatineuse hyper-transparente irisée autour du QR
  const bubbleGroup = new Group();
  scene.add(bubbleGroup);

  const bubbleGeo = new SphereGeometry(1.72, 44, 34);
  const baseBubblePos = new Float32Array(bubbleGeo.attributes.position.array);

  const bubbleMat = new MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.24,
    roughness: 0.03,
    metalness: 0.02,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    iridescence: 1.0,
    iridescenceIOR: 1.33,
    iridescenceThicknessRange: [150, 520],
    reflectivity: 0.98,
    envMapIntensity: 2.35,
    depthWrite: false,
  });
  const bubbleMesh = new Mesh(bubbleGeo, bubbleMat);
  bubbleMesh.renderOrder = 3;
  bubbleGroup.add(bubbleMesh);

  // Contour fin irisé + reflet croissant brillant (signature visuelle bulle)
  const glintMat = new MeshBasicMaterial({
    map: createBubbleGlintTexture(),
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const bubbleGlint = new Mesh(new PlaneGeometry(3.38, 3.38), glintMat);
  bubbleGlint.position.z = 1.74;
  bubbleGlint.renderOrder = 4;
  bubbleGroup.add(bubbleGlint);

  // Anneau d'onde de choc à l'éclatement
  const shockMat = new MeshBasicMaterial({
    color: 0xfff6d6,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const shockRing = new Mesh(new TorusGeometry(1.65, 0.045, 12, 48), shockMat);
  shockRing.renderOrder = 5;
  scene.add(shockRing);

  // 28 gouttelettes gélatineuses irisées projetées lors de l'éclatement
  const dropletsGroup = new Group();
  scene.add(dropletsGroup);
  const dropletGeo = new SphereGeometry(1, 14, 12);
  const dropletPalette = [0xffffff, 0xffd93d, 0xf296bd, 0x80ed99, 0xd4bfff];
  const droplets = [];
  for (let i = 0; i < 28; i++) {
    const dMat = new MeshPhysicalMaterial({
      color: dropletPalette[i % dropletPalette.length],
      transparent: true,
      opacity: 0.72,
      roughness: 0.04,
      clearcoat: 1.0,
      iridescence: 0.9,
      iridescenceThicknessRange: [180, 460],
      envMapIntensity: 2.0,
      depthWrite: false,
    });
    const m = new Mesh(dropletGeo, dMat);
    m.visible = false;
    dropletsGroup.add(m);
    droplets.push({
      mesh: m,
      mat: dMat,
      vx: 0,
      vy: 0,
      vz: 0,
      size: 0.05 + (i % 5) * 0.022,
    });
  }

  // Ombre douce au sol
  const shadowMat = new MeshBasicMaterial({
    map: createSoftShadowTexture(0.24),
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });
  const shadowPlane = new Mesh(new PlaneGeometry(2.8, 0.75), shadowMat);
  shadowPlane.position.set(0, -1.84, -0.1);
  scene.add(shadowPlane);

  const resize = () => {
    const rect = stageHost.getBoundingClientRect();
    const w = Math.max(240, Math.round(rect.width || 310));
    const h = Math.max(240, Math.round(rect.height || 310));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();

  const heroSection = document.getElementById("top") || btn;
  const modalHeroPlay = document.getElementById("modal-hero-play");

  let targetRotY = -0.1;
  let targetRotX = 0.05;
  let curRotY = -0.14;
  let curRotX = 0.06;
  let isHovering = false;
  let hoverAmt = 0;
  let isVisible = true;
  let rafId = 0;
  let lastTime = performance.now();

  // Machine à états de la bulle : "intact" | "bursting" | "popped" | "reforming"
  let bubbleState = "intact";
  let burstTime = 0;
  let reformTime = 0;
  let bypassCapture = false;
  let qrPopImpulse = 0;

  const triggerBubbleBurst = () => {
    bubbleState = "bursting";
    burstTime = 0;
    qrPopImpulse = 1;
    bubbleGroup.visible = false;

    shockRing.visible = true;
    shockRing.scale.setScalar(0.95);
    shockMat.opacity = 0.85;

    droplets.forEach((d, i) => {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / droplets.length);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.sin(phi) * Math.sin(theta);
      const nz = Math.cos(phi);
      const speed = 3.2 + (i % 4) * 1.1;
      d.mesh.visible = true;
      d.mesh.position.set(nx * 1.55, ny * 1.55, nz * 1.1);
      d.mesh.scale.setScalar(d.size);
      d.mat.opacity = 0.85;
      d.vx = nx * speed;
      d.vy = ny * speed + 0.8;
      d.vz = nz * speed * 0.6;
    });
  };

  const reformBubble = () => {
    if (bubbleState === "intact") return;
    bubbleState = "reforming";
    reformTime = 0;
    bubbleGroup.visible = true;
    bubbleGroup.scale.setScalar(0.08);
  };

  // Capture du clic pour éclater la bulle (260 ms) avant l'ouverture de la modale
  if (!reducedMotion) {
    btn.addEventListener(
      "click",
      (e) => {
        if (bypassCapture || bubbleState !== "intact") return;
        e.preventDefault();
        e.stopImmediatePropagation();
        triggerBubbleBurst();
        window.setTimeout(() => {
          bypassCapture = true;
          btn.click();
          bypassCapture = false;
        }, 250);
      },
      true,
    );

    // Quand la modale se referme, la bulle gélatineuse se regonfle proprement
    if (modalHeroPlay) {
      const modalObs = new MutationObserver(() => {
        if (modalHeroPlay.hidden && (bubbleState === "popped" || bubbleState === "bursting")) {
          reformBubble();
        }
      });
      modalObs.observe(modalHeroPlay, { attributes: true, attributeFilter: ["hidden"] });
    }
  }

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
      targetRotY = -0.1;
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
    const idleYaw = reducedMotion ? -0.1 : Math.sin(t * 0.85) * 0.08;
    const idlePitch = reducedMotion ? 0.05 : Math.cos(t * 0.65) * 0.045;

    curRotY += (targetRotY + idleYaw - curRotY) * ease;
    curRotX += (targetRotX + idlePitch - curRotX) * ease;
    hoverAmt += ((isHovering ? 1 : 0) - hoverAmt) * (1 - Math.exp(-dt * 8));

    const floatY = reducedMotion ? 0 : Math.sin(t * 1.55) * 0.085;
    qrPopImpulse *= Math.exp(-dt * 7.5);
    const qrScale = 1 + hoverAmt * 0.04 + Math.sin(qrPopImpulse * Math.PI) * 0.14;

    qrTile.position.y = floatY;
    qrTile.rotation.y = curRotY;
    qrTile.rotation.x = curRotX;
    qrTile.rotation.z = -curRotY * 0.08;
    qrTile.scale.setScalar(qrScale);

    // Déformation organique "gelée" de la bulle 3D
    if (bubbleState === "intact" || bubbleState === "reforming") {
      bubbleGroup.position.y = floatY;
      const posAttr = bubbleGeo.attributes.position;
      const jellyAmp = reducedMotion ? 0 : 0.032 + hoverAmt * 0.028;
      if (jellyAmp > 0) {
        const speed = 2.4 + hoverAmt * 1.6;
        for (let i = 0; i < posAttr.count; i++) {
          const i3 = i * 3;
          const bx = baseBubblePos[i3];
          const by = baseBubblePos[i3 + 1];
          const bz = baseBubblePos[i3 + 2];
          const wave =
            Math.sin(bx * 2.3 + t * speed) *
            Math.cos(by * 2.1 - t * (speed * 0.85)) *
            Math.sin(bz * 1.9 + t * 1.6);
          const factor = 1 + wave * jellyAmp;
          posAttr.array[i3] = bx * factor;
          posAttr.array[i3 + 1] = by * factor;
          posAttr.array[i3 + 2] = bz * factor;
        }
        posAttr.needsUpdate = true;
      }

      if (bubbleState === "reforming") {
        reformTime += dt;
        const p = Math.min(1, reformTime / 0.55);
        const elastic =
          p >= 1
            ? 1
            : 1 + Math.pow(2, -8 * p) * Math.sin((p * 9 - 0.75) * ((2 * Math.PI) / 3));
        bubbleGroup.scale.setScalar(Math.max(0.05, elastic));
        if (p >= 1) bubbleState = "intact";
      } else {
        const sx = 1 + hoverAmt * 0.045 + Math.sin(t * 2.3) * 0.018;
        const sy = 1 + hoverAmt * 0.035 - Math.sin(t * 2.3) * 0.018;
        bubbleGroup.scale.set(sx, sy, 1 + hoverAmt * 0.04);
      }

      bubbleMat.opacity = 0.23 + hoverAmt * 0.06;
      bubbleGlint.position.x = curRotY * 0.25;
      bubbleGlint.position.y = -curRotX * 0.25;
    }

    // Animation des gouttelettes et de l'onde lors de l'éclatement
    if (bubbleState === "bursting") {
      burstTime += dt;
      shockRing.scale.setScalar(1 + burstTime * 3.8);
      shockMat.opacity = Math.max(0, 0.85 - burstTime * 2.6);

      let anyVisible = false;
      droplets.forEach((d) => {
        if (!d.mesh.visible) return;
        d.vy -= 5.2 * dt;
        d.vx *= 1 - 1.2 * dt;
        d.mesh.position.x += d.vx * dt;
        d.mesh.position.y += d.vy * dt;
        d.mesh.position.z += d.vz * dt;
        d.mat.opacity = Math.max(0, 0.85 - burstTime * 1.45);
        d.mesh.scale.setScalar(Math.max(0.001, d.size * (1 - burstTime * 1.1)));
        if (d.mat.opacity > 0.02) anyVisible = true;
        else d.mesh.visible = false;
      });
      if (!anyVisible && burstTime > 0.65) {
        shockRing.visible = false;
        bubbleState = "popped";
        // Sécurité : si la modale n'est pas ouverte, regonfle après 1.8 s
        if (!modalHeroPlay || modalHeroPlay.hidden) {
          reformBubble();
        }
      }
    }

    const sScale = 1 - floatY * 0.45 - hoverAmt * 0.06;
    shadowPlane.scale.set(sScale, sScale, 1);
    shadowMat.opacity = 0.78 - floatY * 0.75;

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
      - Se lance uniquement quand le visiteur scrolle sur #parcours
      - Acte 1 : Aperçu caméra EN DIRECT sur l'écran du téléphone qui vise le QR,
                 cadrage vert qui se verrouille + notification "Ouvrir le jeu"
      - Acte 2 : 3 vrais tambours cylindriques 3D avec symboles droits bien
                 orientés, arrêt net 1 par 1 sur 💎 💎 💎 + longue pause lisible
                 avec bandeau de gain sur l'écran
      - Acte 3 : Ticket d'Or 3D + tampon vert VALIDÉ + confettis 3D
   ========================================================================== */

/**
 * Texture de tambour 1024×256 (u = circonférence = 6 symboles, v = largeur).
 * Associée à CylinderGeometry(..., thetaStart = -Math.PI) + rotateZ(-Math.PI/2)
 * et ctx.rotate(-Math.PI/2), chaque symbole est parfaitement droit et 💎 (index 3,
 * centré à u = 0.5) fait FACE à la caméra exactement à rotation.x = 0 !
 */
function createReelDrumTexture(maxAniso) {
  const w = 1024;
  const h = 256;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");

  // 6 cases autour du tambour ; l'index 3 (💎) est pile au centre u = 0.5
  const symbols = [
    { bg: "#fff2f7", icon: "🎁", ring: "#f296bd" },
    { bg: "#eefdf3", icon: "⭐", ring: "#ffd93d" },
    { bg: "#f4f0ff", icon: "🍒", ring: "#fb7185" },
    { bg: "#fff9dc", icon: "💎", ring: "#3b82f6" },
    { bg: "#fff7e8", icon: "7️⃣", ring: "#f59e0b" },
    { bg: "#eef8ff", icon: "🎟️", ring: "#10b981" },
  ];

  const bandW = w / symbols.length;
  // Décale de -bandW/2 pour que le CENTRE de l'index 3 (💎) soit exactement à x = 512 (u = 0.5)
  const startOffset = w / 2 - 3 * bandW - bandW / 2;

  for (let pass = -1; pass <= 1; pass++) {
    symbols.forEach((s, idx) => {
      const x = startOffset + idx * bandW + pass * w;
      if (x + bandW < 0 || x > w) return;

      ctx.fillStyle = s.bg;
      ctx.fillRect(x, 0, bandW, h);

      // Filet doré entre cases
      ctx.fillStyle = "rgba(232, 184, 75, 0.5)";
      ctx.fillRect(x, 0, 4, h);

      // Médaillon blanc + cercle coloré + icône parfaitement droite
      const cx = x + bandW / 2;
      const cy = h / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-Math.PI / 2);

      ctx.beginPath();
      ctx.arc(0, 0, 62, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = s.ring;
      ctx.stroke();

      ctx.font = "76px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(s.icon, 0, 5);
      ctx.restore();
    });
  }

  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAniso || 4);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Dessine dynamiquement l'écran du smartphone pour chaque acte :
 * - Acte 1 : VRAI aperçu caméra montrant le QR qui grossit dans le viseur,
 *            ligne de scan, verrouillage vert et notification cliquable !
 * - Acte 2 : Interface jeu avec LEDs d'arrêt et bandeau résultat GAGNÉ !
 * - Acte 3 : Écran victoire doux derrière le Ticket d'Or 3D.
 */
function drawDynamicPhoneScreen(canvas, state, qrImg) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  if (state.mode === "scan") {
    // Fond viseur caméra sombre légèrement chaud (comme un vrai appareil photo sur table)
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#1d1a24");
    bg.addColorStop(0.5, "#2b2530");
    bg.addColorStop(1, "#18151e");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Barre caméra haute
    ctx.fillStyle = "rgba(16, 14, 20, 0.78)";
    ctx.fillRect(0, 0, w, 108);
    ctx.fillStyle = "#111015";
    ctx.beginPath();
    ctx.roundRect(176, 22, 160, 28, 14);
    ctx.fill();
    ctx.fillStyle = "#ffd93d";
    ctx.font = "800 22px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("📷 APPAREIL PHOTO · SCAN QR", w / 2, 78);

    // Aperçu en direct du QR vu par l'objectif (grossit et se centre au fil de l'approche)
    const zoom = state.zoom || 0.72;
    const locked = Boolean(state.locked);
    const cardSize = 230 * zoom;
    const cardX = w / 2 - cardSize / 2 + (1 - zoom) * 55;
    const cardY = 415 - cardSize / 2 + (1 - zoom) * 45;

    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardSize, cardSize, 20);
    ctx.fill();
    if (qrImg) {
      const pad = cardSize * 0.09;
      ctx.drawImage(qrImg, cardX + pad, cardY + pad, cardSize - pad * 2, cardSize - pad * 2);
    } else {
      ctx.fillStyle = "#161317";
      ctx.fillRect(cardX + 24, cardY + 24, cardSize - 48, cardSize - 48);
    }
    ctx.restore();

    // 4 coins du viseur qui se resserrent et passent au vert émeraude au verrouillage
    const padFrame = locked ? 18 : 34;
    const fx = cardX - padFrame;
    const fy = cardY - padFrame;
    const fw = cardSize + padFrame * 2;
    const fh = cardSize + padFrame * 2;
    const arm = 44;
    ctx.strokeStyle = locked ? "#34d399" : "#ffd93d";
    ctx.lineWidth = locked ? 13 : 10;
    ctx.lineCap = "round";

    [
      [fx, fy, 1, 1],
      [fx + fw, fy, -1, 1],
      [fx, fy + fh, 1, -1],
      [fx + fw, fy + fh, -1, -1],
    ].forEach(([x, y, dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(x + dx * arm, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * arm);
      ctx.stroke();
    });

    // Faisceau de lecture qui balaie le QR dans l'écran
    const scanY = cardY + ((state.scanPhase || 0) * cardSize);
    const beamGrad = ctx.createLinearGradient(0, scanY - 22, 0, scanY + 22);
    beamGrad.addColorStop(0, "rgba(52, 211, 153, 0)");
    beamGrad.addColorStop(0.5, locked ? "rgba(52, 211, 153, 0.85)" : "rgba(255, 217, 61, 0.7)");
    beamGrad.addColorStop(1, "rgba(52, 211, 153, 0)");
    ctx.fillStyle = beamGrad;
    ctx.fillRect(cardX, scanY - 22, cardSize, 44);

    // Notification système en bas quand le QR est détecté
    if (locked) {
      const pulse = state.tapping ? 1.04 : 1.0;
      ctx.save();
      ctx.translate(w / 2, 705);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = "#ffd93d";
      ctx.beginPath();
      ctx.roundRect(-210, -48, 420, 96, 48);
      ctx.fill();
      ctx.strokeStyle = "#161317";
      ctx.lineWidth = 6;
      ctx.stroke();

      ctx.fillStyle = "#161317";
      ctx.font = "900 24px system-ui, -apple-system, sans-serif";
      ctx.fillText("🔗 simplecommeqr.fr", 0, -14);
      ctx.fillStyle = "#047857";
      ctx.font = "800 22px system-ui, -apple-system, sans-serif";
      ctx.fillText("✓ Ouvrir le jeu sans appli ↗", 0, 20);
      ctx.restore();
    } else {
      ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
      ctx.font = "700 24px system-ui, -apple-system, sans-serif";
      ctx.fillText("Visez simplement le QR code…", w / 2, 710);
    }

    // Bouton déclencheur en bas façon appareil photo
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(w / 2, 825, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(w / 2, 825, 25, 0, Math.PI * 2);
    ctx.fill();
  } else if (state.mode === "play") {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#231a36");
    bg.addColorStop(1, "#3b2254");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#111015";
    ctx.beginPath();
    ctx.roundRect(176, 22, 160, 28, 14);
    ctx.fill();

    // Titre du jeu
    ctx.fillStyle = "#ffd93d";
    ctx.beginPath();
    ctx.roundRect(68, 76, 376, 64, 32);
    ctx.fill();
    ctx.fillStyle = "#161317";
    ctx.font = "900 26px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🎰 SIMPLE COMME QR", w / 2, 108);

    // 3 voyants d'arrêt au-dessus des rouleaux
    const lockedCount = state.lockedCount || 0;
    [136, 256, 376].forEach((lx, i) => {
      ctx.beginPath();
      ctx.arc(lx, 184, 16, 0, Math.PI * 2);
      ctx.fillStyle = i < lockedCount ? "#34d399" : "rgba(255,255,255,0.22)";
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = i < lockedCount ? "#ffffff" : "rgba(255,255,255,0.35)";
      ctx.stroke();
    });

    // Cadre fenêtre rouleaux
    ctx.fillStyle = "#14101d";
    ctx.beginPath();
    ctx.roundRect(38, 220, 436, 360, 30);
    ctx.fill();
    ctx.strokeStyle = state.won ? "#34d399" : "#ebb948";
    ctx.lineWidth = state.won ? 12 : 9;
    ctx.stroke();

    // Bandeau résultat en bas : montre CLAIREMENT le lot sur lequel on tombe !
    if (state.won) {
      ctx.fillStyle = "#34d399";
      ctx.beginPath();
      ctx.roundRect(42, 620, 428, 148, 32);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 6;
      ctx.stroke();

      ctx.fillStyle = "#062b22";
      ctx.font = "900 28px system-ui, -apple-system, sans-serif";
      ctx.fillText("💎 3 DIAMANTS ALIGNÉS !", w / 2, 666);

      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(68, 696, 376, 52, 22);
      ctx.fill();
      ctx.fillStyle = "#161317";
      ctx.font = "900 22px system-ui, -apple-system, sans-serif";
      ctx.fillText((state.prize || "-20% SUR L'ADDITION").slice(0, 26), w / 2, 723);
    } else {
      ctx.fillStyle = "#f296bd";
      ctx.beginPath();
      ctx.roundRect(64, 650, 384, 78, 39);
      ctx.fill();
      ctx.fillStyle = "#161317";
      ctx.font = "900 26px system-ui, -apple-system, sans-serif";
      ctx.fillText("✨ LES ROULEAUX TOURNENT…", w / 2, 690);
    }
  } else {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#fff8dc");
    bg.addColorStop(1, "#ffe08a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#161317";
    ctx.font = "900 34px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🎉 GAIN DÉBLOQUÉ !", w / 2, 165);
    ctx.fillStyle = "#5c4a1d";
    ctx.font = "700 24px system-ui, -apple-system, sans-serif";
    ctx.fillText("À montrer directement", w / 2, 756);
    ctx.fillText("en caisse", w / 2, 792);
  }
}

function drawGoldenTicketTexture(canvas, rewardTitle, ticketCode) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#fff6c8");
  grad.addColorStop(0.45, "#ffd93d");
  grad.addColorStop(1, "#f7b731");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "#161317";
  ctx.lineWidth = 10;
  ctx.setLineDash([18, 12]);
  ctx.beginPath();
  ctx.roundRect(26, 26, w - 52, h - 52, 28);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#161317";
  ctx.beginPath();
  ctx.roundRect(170, 56, w - 340, 62, 31);
  ctx.fill();
  ctx.fillStyle = "#ffd93d";
  ctx.font = "900 30px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🎉 FÉLICITATIONS !", w / 2, 88);

  ctx.fillStyle = "#161317";
  ctx.font = "900 44px system-ui, -apple-system, sans-serif";
  ctx.fillText((rewardTitle || "-20% SUR L'ADDITION").slice(0, 26), w / 2, 212);

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(140, 286, w - 280, 130, 22);
  ctx.fill();
  ctx.strokeStyle = "#161317";
  ctx.lineWidth = 7;
  ctx.stroke();

  ctx.fillStyle = "#5c5142";
  ctx.font = "800 22px system-ui, -apple-system, sans-serif";
  ctx.fillText("CODE CAISSE À USAGE UNIQUE", w / 2, 324);

  ctx.fillStyle = "#161317";
  ctx.font = "900 50px ui-monospace, SFMono-Regular, monospace";
  ctx.fillText(ticketCode || "QR-7K2M", w / 2, 378);
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

  // Attente paresseuse : ne crée le contexte WebGL que lorsque le visiteur approche #parcours !
  const mountScene = async () => {
    if (screenFrame.dataset.parcours3dMounted === "1") return;
    screenFrame.dataset.parcours3dMounted = "1";

    const heroQrImgEl = document.querySelector("#hero-qr-play-btn img.qr-bleed-img");
    const qrSrc = heroQrImgEl
      ? heroQrImgEl.getAttribute("src") || "img/qr-code.svg"
      : "img/qr-code.svg";
    const qrImg = await loadQrImage(qrSrc);

    const host = document.createElement("div");
    host.className = "parcours-3d-stage";
    host.setAttribute("aria-hidden", "true");
    screenFrame.appendChild(host);

    const captionPill = document.createElement("div");
    captionPill.className = "parcours-3d-caption";
    captionPill.textContent = "1. Le client vise le QR avec son appareil photo";
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
    camera.position.set(0, 0.25, 7.15);

    scene.add(new HemisphereLight(0xfff9ee, 0xf2d9c2, 0.92));
    const key = new DirectionalLight(0xfff4dd, 1.5);
    key.position.set(-4, 5, 6);
    scene.add(key);
    const rim = new DirectionalLight(0xffb8d9, 0.95);
    rim.position.set(4.5, 2.5, -3);
    scene.add(rim);
    const winGlow = new PointLight(0xffd93d, 0, 10, 1.5);
    winGlow.position.set(0, 0.2, 2.5);
    scene.add(winGlow);

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
      opacity: 0.2,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });

    /* ── ACTEUR A : PLAQUE QR SUR COMPTOIR (Acte 1) ── */
    const qrStandGroup = new Group();
    scene.add(qrStandGroup);

    qrStandGroup.add(
      new Mesh(new RoundedBoxGeometry(1.66, 1.66, 0.18, 6, 0.2), creamMat),
    );
    const standRim = new Mesh(
      new RoundedBoxGeometry(1.76, 1.76, 0.14, 6, 0.22),
      brassMat,
    );
    standRim.position.z = -0.025;
    qrStandGroup.add(standRim);

    const qrTex = buildQrCanvasTextureFromImage(
      qrImg,
      renderer.capabilities.getMaxAnisotropy(),
    );
    const standQrFace = new Mesh(
      new PlaneGeometry(1.38, 1.38),
      new MeshStandardMaterial({ map: qrTex, roughness: 0.28 }),
    );
    standQrFace.position.z = 0.095;
    qrStandGroup.add(standQrFace);

    const scanRingMat = new MeshBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0,
      side: DoubleSide,
      depthWrite: false,
    });
    const scanRing = new Mesh(new RingGeometry(0.92, 1.1, 48), scanRingMat);
    scanRing.position.z = 0.11;
    qrStandGroup.add(scanRing);

    /* ── ACTEUR B : SMARTPHONE 3D + ÉCRAN DYNAMIQUE + 3 TAMBOURS 3D ── */
    const phoneGroup = new Group();
    scene.add(phoneGroup);

    phoneGroup.add(
      new Mesh(new RoundedBoxGeometry(2.12, 3.74, 0.24, 7, 0.22), phoneChassisMat),
    );
    phoneGroup.add(
      new Mesh(new RoundedBoxGeometry(2.18, 3.8, 0.18, 7, 0.24), brassMat),
    );

    const screenCanvas = document.createElement("canvas");
    screenCanvas.width = 512;
    screenCanvas.height = 896;
    drawDynamicPhoneScreen(
      screenCanvas,
      { mode: "scan", zoom: 0.72, locked: false, scanPhase: 0.2 },
      qrImg,
    );
    const screenTex = new CanvasTexture(screenCanvas);
    screenTex.colorSpace = SRGBColorSpace;
    screenTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const screenMat = new MeshStandardMaterial({
      map: screenTex,
      roughness: 0.16,
      metalness: 0.02,
    });
    const phoneScreen = new Mesh(new PlaneGeometry(1.92, 3.48), screenMat);
    phoneScreen.position.z = 0.125;
    phoneGroup.add(phoneScreen);

    // Cône lumineux subtil depuis l'arrière du smartphone vers le QR (Acte 1)
    const scanCone = new Mesh(new ConeGeometry(0.76, 1.85, 28, 1, true), mintGlowMat);
    scanCone.rotation.x = Math.PI / 2;
    scanCone.position.set(-0.35, 0.15, -1.1);
    phoneGroup.add(scanCone);

    // 3 VRAIS TAMBOURS CYLINDRIQUES 3D (Acte 2) avec orientation UV corrigée !
    const reelsGroup = new Group();
    reelsGroup.position.set(0, 0.12, 0.2);
    phoneGroup.add(reelsGroup);

    const reelTex = createReelDrumTexture(renderer.capabilities.getMaxAnisotropy());
    const reelGeo = new CylinderGeometry(0.46, 0.46, 0.48, 48, 1, true, -Math.PI, Math.PI * 2);
    reelGeo.rotateZ(-Math.PI / 2);

    const reelMat = new MeshPhysicalMaterial({
      map: reelTex,
      roughness: 0.22,
      metalness: 0.02,
      clearcoat: 0.8,
      clearcoatRoughness: 0.12,
    });

    const reels = [-0.54, 0, 0.54].map((rx) => {
      const m = new Mesh(reelGeo, reelMat);
      m.position.set(rx, 0, 0);
      reelsGroup.add(m);
      return m;
    });

    const reelFrameTop = new Mesh(new RoundedBoxGeometry(1.82, 0.085, 0.16, 4, 0.03), brassMat);
    reelFrameTop.position.set(0, 0.52, 0.36);
    reelsGroup.add(reelFrameTop);
    const reelFrameBot = reelFrameTop.clone();
    reelFrameBot.position.y = -0.52;
    reelsGroup.add(reelFrameBot);

    // Levier 3D latéral
    const leverPivot = new Group();
    leverPivot.position.set(1.09, 0.1, 0.04);
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

    const winHaloMat = new MeshBasicMaterial({
      color: 0xffd93d,
      transparent: true,
      opacity: 0,
      side: DoubleSide,
      depthWrite: false,
    });
    const winHalo = new Mesh(new RingGeometry(1.4, 1.74, 48), winHaloMat);
    winHalo.position.set(0, 0, -0.4);
    phoneGroup.add(winHalo);

    /* ── ACTEUR C : TICKET D'OR 3D + TAMPON VERT VALIDÉ + CONFETTIS 3D ── */
    const ticketGroup = new Group();
    scene.add(ticketGroup);

    const ticketCanvas = document.createElement("canvas");
    ticketCanvas.width = 1024;
    ticketCanvas.height = 512;
    drawGoldenTicketTexture(ticketCanvas, "-20% SUR L'ADDITION", "QR-7K2M");
    const ticketTex = new CanvasTexture(ticketCanvas);
    ticketTex.colorSpace = SRGBColorSpace;
    ticketTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    ticketGroup.add(new Mesh(createNotchedTicketGeometry(3.25, 1.72), brassMat));
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

    const confettiGroup = new Group();
    scene.add(confettiGroup);
    const confettiPalette = [0xffd93d, 0xf296bd, 0x80ed99, 0xf58245, 0xc4a3ff, 0x38bdf8];
    const confettiGeo = new PlaneGeometry(0.18, 0.1);
    const confettiItems = [];
    for (let i = 0; i < 36; i++) {
      const mat = new MeshStandardMaterial({
        color: confettiPalette[i % confettiPalette.length],
        roughness: 0.25,
        metalness: 0.25,
        side: DoubleSide,
      });
      const m = new Mesh(confettiGeo, mat);
      m.visible = false;
      confettiGroup.add(m);
      confettiItems.push({ mesh: m, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0 });
    }

    const spawn3DConfetti = () => {
      confettiItems.forEach((p, i) => {
        const a = (i / confettiItems.length) * Math.PI * 2 + (i % 3) * 0.2;
        const spd = 2.4 + (i % 5) * 0.7;
        p.mesh.visible = true;
        p.mesh.position.set(0, 0.2, 0.35);
        p.vx = Math.cos(a) * spd * 0.9;
        p.vy = 2.6 + Math.abs(Math.sin(a)) * 2.4;
        p.vz = Math.sin(i * 1.7) * 0.8 + 0.4;
        p.rx = (i % 2 === 0 ? 1 : -1) * (3 + (i % 4));
        p.ry = (i % 3 === 0 ? 1 : -1) * (2.5 + (i % 3));
        p.rz = (i % 2 === 0 ? -1 : 1) * 2.2;
      });
    };

    const floorShadow = new Mesh(
      new PlaneGeometry(4.8, 1.3),
      new MeshBasicMaterial({
        map: createSoftShadowTexture(0.22),
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    );
    floorShadow.position.set(0, -2.02, -0.2);
    scene.add(floorShadow);

    let currentStep = 1;
    let stepElapsed = 0;
    let isVisible = true;
    let rafId = 0;
    let lastTime = performance.now();
    let pointerX = 0;
    let pointerY = 0;
    let lastScreenDrawT = -1;
    let lastPlayStateKey = "";

    const rewardTitleEl = document.getElementById("m-reward-title");
    const ticketCodeEl = document.getElementById("m-ticket-code");

    const readActiveStep = () => {
      const active = motionStage.querySelector(".motion-scene.is-active");
      return active ? Number(active.dataset.step) || 1 : 1;
    };

    const onStepChange = (step) => {
      currentStep = step;
      stepElapsed = 0;
      lastScreenDrawT = -1;
      lastPlayStateKey = "";
      if (step === 1) {
        captionPill.textContent = "1. Le client vise le QR avec son appareil photo";
        confettiItems.forEach((p) => {
          p.mesh.visible = false;
        });
      } else if (step === 2) {
        captionPill.textContent = "2. Les 3 rouleaux tournent puis s'arrêtent sur le gain";
        confettiItems.forEach((p) => {
          p.mesh.visible = false;
        });
      } else {
        captionPill.textContent = "3. Ticket d'Or immédiat, validé en 2 s en caisse";
        drawDynamicPhoneScreen(screenCanvas, { mode: "win" }, qrImg);
        screenTex.needsUpdate = true;
        drawGoldenTicketTexture(
          ticketCanvas,
          rewardTitleEl?.textContent?.trim(),
          ticketCodeEl?.textContent?.trim(),
        );
        ticketTex.needsUpdate = true;
        spawn3DConfetti();
      }
    };

    const sceneEls = motionStage.querySelectorAll(".motion-scene");
    const mo = new MutationObserver(() => {
      const next = readActiveStep();
      if (next !== currentStep) onStepChange(next);
    });
    sceneEls.forEach((el) =>
      mo.observe(el, { attributes: true, attributeFilter: ["class"] }),
    );

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

      camera.position.x += (pointerX * 0.4 - camera.position.x) * ease;
      camera.position.y += (0.22 - pointerY * 0.24 - camera.position.y) * ease;
      camera.lookAt(0, 0, 0);

      if (currentStep === 1) {
        // ACTE 1 : Smartphone orienté face à nous (aperçu caméra EN DIRECT !) qui approche du QR
        const approach = Math.min(1, stepElapsed / 1.35);
        const smooth = 1 - Math.pow(1 - approach, 3);
        const locked = stepElapsed > 1.55;
        const tapping = stepElapsed > 2.65 && stepElapsed < 3.15;

        // Mise à jour fluide (~24 fps) de l'écran caméra en direct
        if (stepElapsed - lastScreenDrawT > 0.04) {
          lastScreenDrawT = stepElapsed;
          drawDynamicPhoneScreen(
            screenCanvas,
            {
              mode: "scan",
              zoom: MathUtils.lerp(0.64, 1.0, smooth),
              locked,
              tapping,
              scanPhase: (stepElapsed * 0.85) % 1,
            },
            qrImg,
          );
          screenTex.needsUpdate = true;
        }

        if (locked) {
          captionPill.textContent = "1. QR détecté instantanément — ouverture sans appli !";
        }

        // Plaque QR au fond à gauche (bien lisible en perspective)
        qrStandGroup.visible = true;
        qrStandGroup.position.x += (-1.38 - qrStandGroup.position.x) * ease;
        qrStandGroup.position.y += (0.18 + Math.sin(stepElapsed * 2.1) * 0.04 - qrStandGroup.position.y) * ease;
        qrStandGroup.position.z += (-0.75 - qrStandGroup.position.z) * ease;
        qrStandGroup.rotation.y += (0.36 - qrStandGroup.rotation.y) * ease;
        qrStandGroup.rotation.x += (-0.06 - qrStandGroup.rotation.x) * ease;
        qrStandGroup.scale.setScalar(
          locked
            ? 1.05 + Math.sin((stepElapsed - 1.55) * 9) * 0.03 * Math.exp(-(stepElapsed - 1.55) * 2.5)
            : 0.96,
        );

        // Smartphone au premier plan à droite, tourné vers nous pour voir l'écran caméra !
        const targetPhoneX = MathUtils.lerp(2.1, 0.72, smooth);
        const targetPhoneY = MathUtils.lerp(-0.65, -0.04, smooth) + Math.sin(stepElapsed * 2.3) * 0.04;
        const targetPhoneZ = MathUtils.lerp(1.5, 0.95, smooth);
        phoneGroup.visible = true;
        phoneGroup.position.x += (targetPhoneX - phoneGroup.position.x) * ease;
        phoneGroup.position.y += (targetPhoneY - phoneGroup.position.y) * ease;
        phoneGroup.position.z += (targetPhoneZ - phoneGroup.position.z) * ease;
        phoneGroup.rotation.y += (-0.28 - phoneGroup.rotation.y) * ease;
        phoneGroup.rotation.x += (0.06 - phoneGroup.rotation.x) * ease;
        phoneGroup.rotation.z += (0.04 - phoneGroup.rotation.z) * ease;
        phoneGroup.scale.setScalar(0.92);

        scanCone.visible = true;
        mintGlowMat.opacity = locked
          ? 0.28 + Math.sin(stepElapsed * 12) * 0.08
          : 0.14 + smooth * 0.1;

        scanRingMat.opacity = locked ? Math.max(0, 1 - (stepElapsed - 1.55) * 0.8) : 0;
        scanRing.scale.setScalar(locked ? 1 + (stepElapsed - 1.55) * 0.75 : 0.75);

        reelsGroup.visible = false;
        ticketGroup.visible = false;
        winHaloMat.opacity = 0;
        winGlow.intensity += (0.35 - winGlow.intensity) * ease;
      } else if (currentStep === 2) {
        // ACTE 2 : Arrêt net 1 par 1 sur 💎 💎 💎 + longue pause lisible sur le gain !
        qrStandGroup.position.x += (-4.4 - qrStandGroup.position.x) * ease;
        qrStandGroup.scale.setScalar(Math.max(0.01, qrStandGroup.scale.x * (1 - dt * 5)));
        if (qrStandGroup.scale.x < 0.05) qrStandGroup.visible = false;

        phoneGroup.visible = true;
        phoneGroup.position.x += (0 - phoneGroup.position.x) * ease;
        phoneGroup.position.y += (Math.sin(stepElapsed * 2.1) * 0.035 - phoneGroup.position.y) * ease;
        phoneGroup.position.z += (1.18 - phoneGroup.position.z) * ease;
        phoneGroup.rotation.y += (Math.sin(stepElapsed * 1.1) * 0.09 - phoneGroup.rotation.y) * ease;
        phoneGroup.rotation.x += (-0.02 - phoneGroup.rotation.x) * ease;
        phoneGroup.rotation.z += (0 - phoneGroup.rotation.z) * ease;
        phoneGroup.scale.setScalar(1.02);

        scanCone.visible = false;
        reelsGroup.visible = true;
        ticketGroup.visible = false;

        // Levier tiré au démarrage
        leverPivot.rotation.x =
          stepElapsed < 0.5 ? Math.sin((stepElapsed / 0.5) * Math.PI) * 1.05 : 0;

        // Arrêt progressif des 3 tambours sur 💎 (rotation.x = 0 = 💎 centré face caméra !)
        const stopTimes = [0.95, 1.45, 1.95];
        let lockedCount = 0;
        reels.forEach((reel, idx) => {
          const stopT = stopTimes[idx];
          if (stepElapsed < stopT) {
            // Tourne vite vers l'avant puis freine doucement sur les derniers 0.35s
            const rem = stopT - stepElapsed;
            const turnsLeft = rem * (2.6 + idx * 0.35);
            reel.rotation.x = -(turnsLeft * Math.PI * 2);
          } else {
            lockedCount++;
            const over = stepElapsed - stopT;
            // Rebond élastique amorti puis IMMOBILE exactement sur 💎 (0 rad) !
            reel.rotation.x = Math.sin(over * 20) * 0.19 * Math.exp(-over * 7.5);
          }
        });

        const won = lockedCount === 3;
        const prizeText = rewardTitleEl?.textContent?.trim() || "-20% SUR L'ADDITION";
        const stateKey = `${lockedCount}:${won}:${prizeText}`;
        if (stateKey !== lastPlayStateKey) {
          lastPlayStateKey = stateKey;
          drawDynamicPhoneScreen(
            screenCanvas,
            { mode: "play", lockedCount, won, prize: prizeText },
            qrImg,
          );
          screenTex.needsUpdate = true;
          if (won) {
            captionPill.textContent = "2. 💎 3 diamants alignés — le lot est remporté !";
          }
        }

        winHaloMat.opacity = won ? 0.55 + Math.sin(stepElapsed * 8) * 0.18 : 0;
        winHalo.scale.setScalar(won ? 1.08 + Math.sin(stepElapsed * 7) * 0.05 : 0.8);
        winGlow.intensity += ((won ? 1.65 : 0.5) - winGlow.intensity) * ease;
      } else {
        // ACTE 3 : Ticket d'Or 3D + tampon vert VALIDÉ + confettis 3D
        qrStandGroup.visible = false;
        scanCone.visible = false;
        reelsGroup.visible = false;

        phoneGroup.visible = true;
        phoneGroup.position.x += (-1.28 - phoneGroup.position.x) * ease;
        phoneGroup.position.y += (-0.32 - phoneGroup.position.y) * ease;
        phoneGroup.position.z += (-0.7 - phoneGroup.position.z) * ease;
        phoneGroup.rotation.y += (0.45 - phoneGroup.rotation.y) * ease;
        phoneGroup.rotation.x += (-0.16 - phoneGroup.rotation.x) * ease;
        phoneGroup.scale.setScalar(0.75);

        ticketGroup.visible = true;
        const popT = Math.min(1, stepElapsed / 0.65);
        const elastic =
          popT >= 1
            ? 1
            : 1 + Math.pow(2, -8 * popT) * Math.sin((popT * 10 - 0.75) * ((2 * Math.PI) / 3));

        ticketGroup.position.set(
          0.22,
          Math.sin(stepElapsed * 2.0) * 0.065,
          MathUtils.lerp(-0.2, 1.35, Math.min(1, popT * 1.2)),
        );
        ticketGroup.rotation.y = -0.08 + Math.sin(stepElapsed * 1.5) * 0.14;
        ticketGroup.rotation.x = 0.03 + Math.cos(stepElapsed * 1.2) * 0.05;
        ticketGroup.rotation.z = -0.035;
        ticketGroup.scale.setScalar(Math.max(0.05, elastic * 0.96));

        const stampStart = 1.0;
        if (stepElapsed < stampStart) {
          stampMesh.visible = false;
        } else {
          stampMesh.visible = true;
          const st = Math.min(1, (stepElapsed - stampStart) / 0.22);
          stampMesh.scale.setScalar(MathUtils.lerp(2.2, 1.0, 1 - Math.pow(1 - st, 3)));
          stampMesh.position.z = MathUtils.lerp(0.85, 0.16, st);
        }

        confettiItems.forEach((p) => {
          if (!p.mesh.visible) return;
          p.vy -= 5.6 * dt;
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
      const visIo = new IntersectionObserver(
        (entries) => {
          isVisible = entries[0]?.isIntersecting ?? false;
          if (isVisible && !rafId) {
            lastTime = performance.now();
            rafId = requestAnimationFrame(tick);
          }
        },
        { threshold: 0.12 },
      );
      visIo.observe(screenFrame);
    }

    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);

    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      screenFrame.classList.remove("is-3d-parcours-ready");
    });
  };

  // Ne démarre le WebGL de #parcours qu'à l'approche de la section (0 surcharge au chargement initial)
  if (typeof IntersectionObserver === "function") {
    const lazyIo = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          lazyIo.disconnect();
          void mountScene();
        }
      },
      { rootMargin: "120px 0px", threshold: 0.05 },
    );
    lazyIo.observe(screenFrame);
  } else {
    void mountScene();
  }
}

/* ==========================================================================
   AMORÇAGE DIFFÉRÉ (LCP INTACT, ZERO BLOQUAGE)
   ========================================================================== */
const bootAll = () => {
  if (!hasWebGL()) return;
  const run = () => {
    void initHeroBubbleQr3D();
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

import {
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
  NoToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  RingGeometry,
  Scene,
  ShaderMaterial,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/* ==========================================================================
   ENVIRONNEMENT STUDIO HAUT CONTRASTE (ZÉRO VOILE BLANC)
   Secret des rendus Pixar / Apple : un fond de studio SOMBRE avec des
   softboxes nettes très lumineuses → des noirs profonds, des reflets nets
   sur les biseaux et des couleurs saturées, jamais un brouillard laiteux.
   ========================================================================== */
function createHighContrastStudioEnv(renderer) {
  const pmrem = new PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new Scene();
  // Fond sombre pour préserver le contraste et éviter le voile blanc sur les noirs
  envScene.background = new Color(0x1b1724);

  const addSoftbox = (color, intensity, pos, rot, scale) => {
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

  // Softbox principale au plafond (reflet net brillant sur les courbes)
  addSoftbox(0xffffff, 4.2, [-1.5, 6.5, 3.0], [Math.PI / 2.2, 0.15, 0], [6.5, 4.2]);
  // Key light dorée chaude à gauche
  addSoftbox(0xffdf7a, 3.2, [-7.2, 2.4, 4.2], [0, Math.PI / 2.5, 0], [4.5, 5.5]);
  // Contre-jour pop rose à droite
  addSoftbox(0xff6eb4, 2.6, [7.2, 1.8, 2.5], [0, -Math.PI / 2.4, 0], [4.0, 5.2]);
  // Rim menthe/cyan derrière pour détacher la silhouette
  addSoftbox(0x5ef2b5, 2.2, [1.0, 4.2, -7.2], [0.22, 0, 0], [7.0, 3.2]);
  // Léger rebond chaud par le dessous
  addSoftbox(0xffc978, 1.0, [0, -6.5, 1.0], [-Math.PI / 2, 0, 0], [8.0, 8.0]);

  const rt = pmrem.fromScene(envScene, 0.03);
  pmrem.dispose();
  envScene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
  return rt;
}

function createSoftShadowTexture(alpha = 0.34) {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.04,
    size / 2,
    size / 2,
    size * 0.48,
  );
  grad.addColorStop(0, `rgba(22, 19, 23, ${alpha})`);
  grad.addColorStop(0.48, `rgba(22, 19, 23, ${alpha * 0.42})`);
  grad.addColorStop(1, "rgba(22, 19, 23, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/**
 * Shader GLSL sur-mesure de bulle de savon / gelée cristalline :
 * - Centre (face au QR) = 100 % CRISTALLIN (alpha ~0.0, ZÉRO voile blanc !)
 * - Bordure Fresnel = vraie interférence film mince irisée (rose, cyan, or, menthe)
 *   + deux reflets spéculaires nets façon studio Pixar + ondulation organique GPU.
 */
function createJellyBubbleShaderMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uHover: { value: 0 },
      uJellyAmp: { value: 0.036 },
      uOpacity: { value: 1.0 },
      uLightDirA: { value: new Vector3(-0.68, 0.72, 0.26).normalize() },
      uLightDirB: { value: new Vector3(0.68, -0.52, 0.42).normalize() },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uHover;
      uniform float uJellyAmp;
      varying vec3 vNormalWorld;
      varying vec3 vViewDir;
      varying vec3 vLocalPos;

      void main() {
        float spd = 2.35 + uHover * 1.6;
        float wobble =
          sin(position.x * 2.5 + uTime * spd) *
          cos(position.y * 2.2 - uTime * (spd * 0.85)) *
          sin(position.z * 2.1 + uTime * 1.55);
        float pulse = sin(uTime * 1.9 + position.y * 1.7) * 0.35;
        float disp = (wobble + pulse * 0.45) * uJellyAmp;

        vec3 displaced = position * (1.0 + disp);
        vLocalPos = displaced;

        vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
        // Normale perturbée subtilement pour que les reflets dansent comme de la gelée
        vec3 nPerturb = normalize(normal + vec3(
          cos(position.x * 2.5 + uTime * spd) * uJellyAmp * 1.4,
          -sin(position.y * 2.2 - uTime * (spd * 0.85)) * uJellyAmp * 1.4,
          0.0
        ));
        vNormalWorld = normalize(mat3(modelMatrix) * nPerturb);
        vViewDir = normalize(cameraPosition - worldPos.xyz);

        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uHover;
      uniform float uOpacity;
      uniform vec3 uLightDirA;
      uniform vec3 uLightDirB;
      varying vec3 vNormalWorld;
      varying vec3 vViewDir;
      varying vec3 vLocalPos;

      // Spectre film mince réaliste calé sur la palette Kermesse (cyan, rose pop, or, menthe, lavande)
      vec3 thinFilmPalette(float t) {
        vec3 a = vec3(0.66, 0.64, 0.72);
        vec3 b = vec3(0.34, 0.36, 0.28);
        vec3 c = vec3(1.0, 1.0, 1.0);
        vec3 d = vec3(0.08, 0.38, 0.66);
        return clamp(a + b * cos(6.28318 * (c * t + d)), 0.0, 1.0);
      }

      void main() {
        vec3 N = normalize(vNormalWorld);
        if (!gl_FrontFacing) N = -N;
        vec3 V = normalize(vViewDir);

        float ndotv = clamp(dot(N, V), 0.0, 1.0);
        // Zéro voile au centre : Fresnel nul près du centre, puissant sur le bord courbé
        float fresnel = pow(1.0 - ndotv, 2.35);
        float outerRim = pow(1.0 - ndotv, 4.4);

        // Interférence film mince qui ondule doucement à la surface de la bulle
        float swirl = sin(vLocalPos.x * 2.1 + vLocalPos.y * 1.8 + uTime * 0.9) * 0.22;
        float filmPhase = (1.0 - ndotv) * 1.45 + swirl + uTime * 0.14;
        vec3 iridColor = thinFilmPalette(filmPhase);

        // Reflets spéculaires studio nets sur le bord courbé (sans voiler le QR au centre)
        vec3 H1 = normalize(uLightDirA + V);
        float specSharp = pow(max(dot(N, H1), 0.0), 110.0) * smoothstep(0.12, 0.48, 1.0 - ndotv);
        float specSoft = pow(max(dot(N, H1), 0.0), 22.0) * 0.28 * smoothstep(0.18, 0.55, 1.0 - ndotv);

        vec3 H2 = normalize(uLightDirB + V);
        float specRim = pow(max(dot(N, H2), 0.0), 38.0) * 0.52 * smoothstep(0.2, 0.6, 1.0 - ndotv);

        // Liséré optique légèrement contrasté sur le bord extrême pour détacher sur fond clair
        vec3 rimInkTint = vec3(0.45, 0.28, 0.62);
        vec3 baseColor = mix(iridColor, rimInkTint, outerRim * 0.32);

        vec3 finalColor =
          baseColor * (0.85 + uHover * 0.25) +
          vec3(1.0, 0.99, 0.96) * (specSharp * 1.45 + specSoft) +
          vec3(1.0, 0.85, 0.95) * specRim;

        // Alpha = 0.015 au centre (QR 100% net !) → 0.88 sur les bords et reflets spéculaires
        float alpha = clamp(
          0.012 +
          fresnel * (0.64 + uHover * 0.16) +
          outerRim * 0.36 +
          specSharp * 0.92 +
          specSoft * 0.32 +
          specRim * 0.42,
          0.0,
          0.95
        ) * uOpacity;

        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
  });
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

/**
 * Dessine une plaque QR ultra-nette, 100% contraste noir pur (#110e14) sur blanc pur (#ffffff),
 * avec une mini pastille centrale dorée discrète ou un cadre arrondi propre qui incite à scanner/cliquer.
 */
function buildCrispQrTexture(img, maxAniso) {
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  if (img) {
    const pad = 54;
    ctx.drawImage(img, pad, pad, size - pad * 2, size - pad * 2);
  } else {
    ctx.fillStyle = "#110e14";
    ctx.fillRect(140, 140, 200, 200);
    ctx.fillRect(684, 140, 200, 200);
    ctx.fillRect(140, 684, 200, 200);
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
   1. HERO — QR CODE ULTRA-NET DANS UNE VRAIE BULLE 3D GÉLATINEUSE FRESNEL
      - Centre 100 % cristallin (zéro voile blanc !) → QR noir franc & lisible
      - Bordure irisée film mince + double reflet spéculaire façon Pixar
      - Ondulation gélatineuse souple + éclatement en 28 gouttelettes au clic
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
  // NoToneMapping préserve les noirs profonds (#161317) et les couleurs vives de la DA
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(0x000000, 0);

  const canvas = renderer.domElement;
  canvas.className = "hero-3d-canvas";
  stageHost.appendChild(canvas);

  const scene = new Scene();
  const envRT = createHighContrastStudioEnv(renderer);
  scene.environment = envRT.texture;

  const camera = new PerspectiveCamera(31, 1, 0.1, 30);
  camera.position.set(0, 0.04, 7.1);

  scene.add(new HemisphereLight(0xfffaf0, 0x3b2f45, 0.72));
  const keyLight = new DirectionalLight(0xfff7e0, 1.35);
  keyLight.position.set(-3.2, 4.8, 5.4);
  scene.add(keyLight);
  const rimLight = new DirectionalLight(0xff7ec2, 0.9);
  rimLight.position.set(4.2, 2.0, -2.5);
  scene.add(rimLight);

  // 1. Bloc QR 3D ultra-net (bordure encre franche #161317 fidèle à la DA + face auto-contrastée)
  const qrTile = new Group();
  scene.add(qrTile);

  const inkShell = new Mesh(
    new RoundedBoxGeometry(1.94, 1.94, 0.22, 7, 0.24),
    new MeshPhysicalMaterial({
      color: 0x161317,
      roughness: 0.26,
      metalness: 0.12,
      clearcoat: 0.9,
      clearcoatRoughness: 0.12,
      envMapIntensity: 0.95,
    }),
  );
  inkShell.position.z = -0.02;
  qrTile.add(inkShell);

  const whiteCard = new Mesh(
    new RoundedBoxGeometry(1.80, 1.80, 0.20, 7, 0.19),
    new MeshBasicMaterial({ color: 0xffffff }),
  );
  whiteCard.position.z = 0.015;
  qrTile.add(whiteCard);

  // Face QR en MeshBasicMaterial = 100% contraste noir pur sur blanc pur, ZÉRO voile !
  const qrTexture = buildCrispQrTexture(qrImg, renderer.capabilities.getMaxAnisotropy());
  const qrPlane = new Mesh(
    new PlaneGeometry(1.66, 1.66),
    new MeshBasicMaterial({ map: qrTexture }),
  );
  qrPlane.position.z = 0.12;
  qrTile.add(qrPlane);

  // 2. Vraie Bulle 3D gélatineuse Fresnel (centre 100% transparent, bord irisé vibrant)
  const bubbleGroup = new Group();
  scene.add(bubbleGroup);

  const bubbleGeo = new SphereGeometry(1.70, 56, 42);
  const bubbleShaderMat = createJellyBubbleShaderMaterial();
  const bubbleMesh = new Mesh(bubbleGeo, bubbleShaderMat);
  bubbleMesh.renderOrder = 4;
  bubbleGroup.add(bubbleMesh);

  // Anneau d'onde de choc irisé à l'éclatement
  const shockMat = new MeshBasicMaterial({
    color: 0xffd93d,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const shockRing = new Mesh(new TorusGeometry(1.72, 0.055, 14, 52), shockMat);
  shockRing.renderOrder = 5;
  scene.add(shockRing);

  // 28 gouttelettes gélatineuses saturées projetées à l'éclatement
  const dropletsGroup = new Group();
  scene.add(dropletsGroup);
  const dropletGeo = new SphereGeometry(1, 14, 12);
  const dropletPalette = [0xffffff, 0xffd93d, 0xff5ca8, 0x34d399, 0x9f7aea, 0x38bdf8];
  const droplets = [];
  for (let i = 0; i < 28; i++) {
    const dMat = new MeshPhysicalMaterial({
      color: dropletPalette[i % dropletPalette.length],
      transparent: true,
      opacity: 0.9,
      roughness: 0.04,
      clearcoat: 1.0,
      iridescence: 1.0,
      iridescenceThicknessRange: [160, 480],
      envMapIntensity: 1.8,
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
      size: 0.055 + (i % 5) * 0.024,
    });
  }

  // Ombre douce au sol
  const shadowMat = new MeshBasicMaterial({
    map: createSoftShadowTexture(0.32),
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const shadowPlane = new Mesh(new PlaneGeometry(2.65, 0.68), shadowMat);
  shadowPlane.position.set(0, -1.82, -0.1);
  scene.add(shadowPlane);

  const resize = () => {
    const rect = stageHost.getBoundingClientRect();
    const w = Math.max(240, Math.round(rect.width || 320));
    const h = Math.max(240, Math.round(rect.height || 320));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();

  const heroSection = document.getElementById("top") || btn;
  const modalHeroPlay = document.getElementById("modal-hero-play");

  let targetRotY = -0.09;
  let targetRotX = 0.04;
  let curRotY = -0.12;
  let curRotX = 0.05;
  let isHovering = false;
  let hoverAmt = 0;
  let isVisible = true;
  let rafId = 0;
  let lastTime = performance.now();

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
    shockMat.opacity = 0.92;

    droplets.forEach((d, i) => {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / droplets.length);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.sin(phi) * Math.sin(theta);
      const nz = Math.cos(phi);
      const speed = 3.5 + (i % 4) * 1.15;
      d.mesh.visible = true;
      d.mesh.position.set(nx * 1.68, ny * 1.68, nz * 1.15);
      d.mesh.scale.setScalar(d.size);
      d.mat.opacity = 0.94;
      d.vx = nx * speed;
      d.vy = ny * speed + 0.9;
      d.vz = nz * speed * 0.65;
    });
  };

  const reformBubble = () => {
    if (bubbleState === "intact") return;
    bubbleState = "reforming";
    reformTime = 0;
    bubbleGroup.visible = true;
    bubbleGroup.scale.setScalar(0.08);
  };

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
      targetRotY = nx * 0.32;
      targetRotX = ny * 0.22;
    },
    { passive: true },
  );
  heroSection.addEventListener(
    "pointerleave",
    () => {
      targetRotY = -0.09;
      targetRotX = 0.04;
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
    const idleYaw = reducedMotion ? -0.09 : Math.sin(t * 0.85) * 0.075;
    const idlePitch = reducedMotion ? 0.04 : Math.cos(t * 0.65) * 0.04;

    curRotY += (targetRotY + idleYaw - curRotY) * ease;
    curRotX += (targetRotX + idlePitch - curRotX) * ease;
    hoverAmt += ((isHovering ? 1 : 0) - hoverAmt) * (1 - Math.exp(-dt * 8));

    const floatY = reducedMotion ? 0 : Math.sin(t * 1.5) * 0.08;
    qrPopImpulse *= Math.exp(-dt * 7.5);
    const qrScale = 1 + hoverAmt * 0.045 + Math.sin(qrPopImpulse * Math.PI) * 0.14;

    qrTile.position.y = floatY;
    qrTile.rotation.y = curRotY;
    qrTile.rotation.x = curRotX;
    qrTile.rotation.z = -curRotY * 0.08;
    qrTile.scale.setScalar(qrScale);

    // Mise à jour GPU du shader bulle gélatineuse
    bubbleShaderMat.uniforms.uTime.value = reducedMotion ? 0.4 : t;
    bubbleShaderMat.uniforms.uHover.value = hoverAmt;
    bubbleShaderMat.uniforms.uJellyAmp.value = reducedMotion ? 0 : 0.032 + hoverAmt * 0.026;

    if (bubbleState === "intact" || bubbleState === "reforming") {
      bubbleGroup.position.y = floatY;
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
        const sx = 1 + hoverAmt * 0.04 + Math.sin(t * 2.2) * 0.016;
        const sy = 1 + hoverAmt * 0.032 - Math.sin(t * 2.2) * 0.016;
        bubbleGroup.scale.set(sx, sy, 1 + hoverAmt * 0.035);
      }
    }

    if (bubbleState === "bursting") {
      burstTime += dt;
      shockRing.scale.setScalar(1 + burstTime * 4.0);
      shockMat.opacity = Math.max(0, 0.92 - burstTime * 2.7);

      let anyVisible = false;
      droplets.forEach((d) => {
        if (!d.mesh.visible) return;
        d.vy -= 5.2 * dt;
        d.vx *= 1 - 1.15 * dt;
        d.mesh.position.x += d.vx * dt;
        d.mesh.position.y += d.vy * dt;
        d.mesh.position.z += d.vz * dt;
        d.mat.opacity = Math.max(0, 0.94 - burstTime * 1.45);
        d.mesh.scale.setScalar(Math.max(0.001, d.size * (1 - burstTime * 1.05)));
        if (d.mat.opacity > 0.02) anyVisible = true;
        else d.mesh.visible = false;
      });
      if (!anyVisible && burstTime > 0.65) {
        shockRing.visible = false;
        bubbleState = "popped";
        if (!modalHeroPlay || modalHeroPlay.hidden) {
          reformBubble();
        }
      }
    }

    const sScale = 1 - floatY * 0.45 - hoverAmt * 0.05;
    shadowPlane.scale.set(sScale, sScale, 1);
    shadowMat.opacity = 0.85 - floatY * 0.7;

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
   2. PARCOURS 3D HAUT CONTRASTE — ILS SCANNENT · ILS JOUENT · ILS GAGNENT
      - ZÉRO voile blanc : écran OLED auto-illuminé (MeshBasicMaterial) +
        NoToneMapping + studio sombre haute brillance + contours Kermesse #161317
      - Icônes vectorielles custom sur les 3 tambours 3D (zéro emoji flou !)
      - Démarrage paresseux uniquement quand le visiteur arrive sur #parcours
   ========================================================================== */

/** Dessine des icônes vectorielles pop ultra-nettes & saturées sur les 3 tambours. */
function drawCrispSlotIcon(ctx, kind) {
  ctx.save();
  if (kind === "diamond") {
    // Diamant bleu-cyan facetté style Pixar
    ctx.beginPath();
    ctx.moveTo(0, 48);
    ctx.lineTo(-48, -6);
    ctx.lineTo(-28, -38);
    ctx.lineTo(28, -38);
    ctx.lineTo(48, -6);
    ctx.closePath();
    const g = ctx.createLinearGradient(-40, -38, 40, 48);
    g.addColorStop(0, "#7dd3fc");
    g.addColorStop(0.45, "#0ea5e9");
    g.addColorStop(1, "#1d4ed8");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#161317";
    ctx.lineJoin = "round";
    ctx.stroke();

    // Facette centrale lumineuse
    ctx.beginPath();
    ctx.moveTo(-22, -6);
    ctx.lineTo(0, -38);
    ctx.lineTo(22, -6);
    ctx.lineTo(0, 46);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.42)";
    ctx.fill();

    // Trait brillant supérieur
    ctx.beginPath();
    ctx.moveTo(-45, -6);
    ctx.lineTo(45, -6);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.stroke();
  } else if (kind === "star") {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 46 : 21;
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = "#ffd93d";
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#161317";
    ctx.lineJoin = "round";
    ctx.stroke();
  } else if (kind === "gift") {
    ctx.fillStyle = "#ff5c93";
    ctx.beginPath();
    ctx.roundRect(-36, -18, 72, 58, 10);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#161317";
    ctx.stroke();
    ctx.fillStyle = "#ffd93d";
    ctx.fillRect(-10, -18, 20, 58);
    ctx.fillRect(-36, 4, 72, 16);
    // Nœud du dessus
    ctx.beginPath();
    ctx.ellipse(-16, -26, 16, 11, -0.35, 0, Math.PI * 2);
    ctx.ellipse(16, -26, 16, 11, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (kind === "cherry") {
    ctx.strokeStyle = "#15803d";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-18, 8);
    ctx.quadraticCurveTo(-8, -32, 12, -38);
    ctx.moveTo(20, 12);
    ctx.quadraticCurveTo(18, -22, 12, -38);
    ctx.stroke();
    [
      [-20, 18],
      [20, 22],
    ].forEach(([cx, cy]) => {
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.fillStyle = "#e11d48";
      ctx.fill();
      ctx.lineWidth = 5.5;
      ctx.strokeStyle = "#161317";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx - 6, cy - 6, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    });
  } else if (kind === "seven") {
    ctx.font = "900 84px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 12;
    ctx.strokeStyle = "#161317";
    ctx.strokeText("7", 0, 4);
    ctx.fillStyle = "#f97316";
    ctx.fillText("7", 0, 4);
  } else {
    // Ticket menthe
    ctx.fillStyle = "#34d399";
    ctx.beginPath();
    ctx.roundRect(-40, -24, 80, 48, 10);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#161317";
    ctx.stroke();
    ctx.fillStyle = "#161317";
    ctx.font = "900 28px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("WIN", 0, 2);
  }
  ctx.restore();
}

function createReelDrumTexture(maxAniso) {
  const w = 1024;
  const h = 256;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");

  const symbols = [
    { bg: "#ffe4ef", kind: "gift", ring: "#ec4899" },
    { bg: "#fef3c7", kind: "star", ring: "#f59e0b" },
    { bg: "#fce7f3", kind: "cherry", ring: "#e11d48" },
    { bg: "#e0f2fe", kind: "diamond", ring: "#0284c7" },
    { bg: "#ffedd5", kind: "seven", ring: "#ea580c" },
    { bg: "#d1fae5", kind: "ticket", ring: "#059669" },
  ];

  const bandW = w / symbols.length;
  // Index 3 (diamond) pile centré à x = 512 (u = 0.5 → rotation.x = 0 face caméra)
  const startOffset = w / 2 - 3 * bandW - bandW / 2;

  for (let pass = -1; pass <= 1; pass++) {
    symbols.forEach((s, idx) => {
      const x = startOffset + idx * bandW + pass * w;
      if (x + bandW < 0 || x > w) return;

      ctx.fillStyle = s.bg;
      ctx.fillRect(x, 0, bandW, h);

      ctx.fillStyle = "#161317";
      ctx.fillRect(x, 0, 5, h);

      const cx = x + bandW / 2;
      const cy = h / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-Math.PI / 2);

      ctx.beginPath();
      ctx.arc(0, 0, 68, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 7;
      ctx.strokeStyle = s.ring;
      ctx.stroke();

      drawCrispSlotIcon(ctx, s.kind);
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
 * Écran OLED du smartphone — rendu auto-illuminé haute saturation (ZÉRO voile blanc).
 */
function drawCrispPhoneScreen(canvas, state, qrImg) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  if (state.mode === "scan") {
    // Aperçu caméra réaliste (fond comptoir chaud vu par l'objectif)
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#12101a");
    bg.addColorStop(0.5, "#1e1a2b");
    bg.addColorStop(1, "#12101a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // En-tête caméra net
    ctx.fillStyle = "#0a090e";
    ctx.fillRect(0, 0, w, 108);
    ctx.fillStyle = "#1e1b26";
    ctx.beginPath();
    ctx.roundRect(176, 20, 160, 28, 14);
    ctx.fill();

    ctx.fillStyle = "#ffd93d";
    ctx.font = "900 22px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("APPAREIL PHOTO · SCAN QR", w / 2, 78);

    // Aperçu EN DIRECT du QR dans le viseur
    const zoom = state.zoom || 0.72;
    const locked = Boolean(state.locked);
    const cardSize = 248 * zoom;
    const cardX = w / 2 - cardSize / 2 + (1 - zoom) * 52;
    const cardY = 408 - cardSize / 2 + (1 - zoom) * 40;

    // Cadre noir + carte blanche + QR ultra-net vu par la caméra
    ctx.fillStyle = "#161317";
    ctx.beginPath();
    ctx.roundRect(cardX - 7, cardY - 7, cardSize + 14, cardSize + 14, 24);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardSize, cardSize, 18);
    ctx.fill();
    if (qrImg) {
      const pad = cardSize * 0.08;
      ctx.drawImage(qrImg, cardX + pad, cardY + pad, cardSize - pad * 2, cardSize - pad * 2);
    }

    // 4 équerres de cadrage (jaune vif → vert émeraude net au verrouillage)
    const padFrame = locked ? 20 : 38;
    const fx = cardX - padFrame;
    const fy = cardY - padFrame;
    const fw = cardSize + padFrame * 2;
    const fh = cardSize + padFrame * 2;
    const arm = 48;
    ctx.strokeStyle = locked ? "#10b981" : "#ffd93d";
    ctx.lineWidth = 14;
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

    // Faisceau laser de lecture franc
    const scanY = cardY + (state.scanPhase || 0) * cardSize;
    const beamGrad = ctx.createLinearGradient(0, scanY - 18, 0, scanY + 18);
    beamGrad.addColorStop(0, "rgba(16, 185, 129, 0)");
    beamGrad.addColorStop(0.5, locked ? "rgba(16, 185, 129, 0.95)" : "rgba(255, 217, 61, 0.9)");
    beamGrad.addColorStop(1, "rgba(16, 185, 129, 0)");
    ctx.fillStyle = beamGrad;
    ctx.fillRect(cardX, scanY - 18, cardSize, 36);

    // Notification pop jaune vif qui apparaît dès détection
    if (locked) {
      const s = state.tapping ? 1.05 : 1.0;
      ctx.save();
      ctx.translate(w / 2, 704);
      ctx.scale(s, s);
      ctx.fillStyle = "#ffd93d";
      ctx.beginPath();
      ctx.roundRect(-218, -50, 436, 100, 50);
      ctx.fill();
      ctx.strokeStyle = "#161317";
      ctx.lineWidth = 8;
      ctx.stroke();

      ctx.fillStyle = "#161317";
      ctx.font = "900 25px system-ui, -apple-system, sans-serif";
      ctx.fillText("simplecommeqr.fr", 0, -14);
      ctx.fillStyle = "#047857";
      ctx.font = "900 22px system-ui, -apple-system, sans-serif";
      ctx.fillText("✓ Ouvrir le jeu sans appli ↗", 0, 21);
      ctx.restore();
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 25px system-ui, -apple-system, sans-serif";
      ctx.fillText("Visez le QR sur le comptoir…", w / 2, 708);
    }

    // Déclencheur appareil photo
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(w / 2, 828, 32, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(w / 2, 828, 22, 0, Math.PI * 2);
    ctx.fill();
  } else if (state.mode === "play") {
    // Univers Kermesse pop ultra-saturé (violet profond + jaune vif + rose pop)
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#1c1330");
    bg.addColorStop(1, "#331954");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#0e0a16";
    ctx.beginPath();
    ctx.roundRect(176, 20, 160, 28, 14);
    ctx.fill();

    // En-tête Kermesse jaune vif encadré noir
    ctx.fillStyle = "#ffd93d";
    ctx.beginPath();
    ctx.roundRect(62, 74, 388, 66, 33);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#161317";
    ctx.stroke();
    ctx.fillStyle = "#161317";
    ctx.font = "900 26px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SIMPLE COMME QR", w / 2, 108);

    // 3 voyants lumineux d'arrêt des rouleaux
    const lockedCount = state.lockedCount || 0;
    [136, 256, 376].forEach((lx, i) => {
      ctx.beginPath();
      ctx.arc(lx, 182, 17, 0, Math.PI * 2);
      ctx.fillStyle = i < lockedCount ? "#10b981" : "#3b2c59";
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = i < lockedCount ? "#ffffff" : "#6d5894";
      ctx.stroke();
    });

    // Fenêtre des 3 rouleaux
    ctx.fillStyle = "#0f0c18";
    ctx.beginPath();
    ctx.roundRect(36, 218, 440, 366, 30);
    ctx.fill();
    ctx.strokeStyle = state.won ? "#10b981" : "#ffd93d";
    ctx.lineWidth = 10;
    ctx.stroke();

    if (state.won) {
      // Bandeau GAGNÉ haute visibilité
      ctx.fillStyle = "#10b981";
      ctx.beginPath();
      ctx.roundRect(36, 616, 440, 162, 30);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 7;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "900 30px system-ui, -apple-system, sans-serif";
      ctx.fillText("3 DIAMANTS ALIGNÉS !", w / 2, 664);

      ctx.fillStyle = "#ffd93d";
      ctx.beginPath();
      ctx.roundRect(62, 698, 388, 56, 24);
      ctx.fill();
      ctx.strokeStyle = "#161317";
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.fillStyle = "#161317";
      ctx.font = "900 22px system-ui, -apple-system, sans-serif";
      ctx.fillText((state.prize || "-20% SUR L'ADDITION").slice(0, 26), w / 2, 727);
    } else {
      ctx.fillStyle = "#ff5c93";
      ctx.beginPath();
      ctx.roundRect(58, 650, 396, 82, 41);
      ctx.fill();
      ctx.strokeStyle = "#161317";
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 26px system-ui, -apple-system, sans-serif";
      ctx.fillText("LES ROULEAUX TOURNENT…", w / 2, 692);
    }
  } else {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#ffd93d");
    bg.addColorStop(1, "#f59e0b");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#161317";
    ctx.font = "900 34px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("GAIN DÉBLOQUÉ !", w / 2, 165);
    ctx.font = "800 24px system-ui, -apple-system, sans-serif";
    ctx.fillText("Présentez en caisse", w / 2, 775);
  }
}

function drawCrispGoldenTicketTexture(canvas, rewardTitle, ticketCode) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#ffe45e");
  grad.addColorStop(0.5, "#ffd028");
  grad.addColorStop(1, "#f59e0b");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "#161317";
  ctx.lineWidth = 12;
  ctx.setLineDash([20, 12]);
  ctx.beginPath();
  ctx.roundRect(24, 24, w - 48, h - 48, 28);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#161317";
  ctx.beginPath();
  ctx.roundRect(160, 52, w - 320, 66, 33);
  ctx.fill();
  ctx.fillStyle = "#ffd93d";
  ctx.font = "900 32px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("FÉLICITATIONS !", w / 2, 86);

  ctx.fillStyle = "#161317";
  ctx.font = "900 46px system-ui, -apple-system, sans-serif";
  ctx.fillText((rewardTitle || "-20% SUR L'ADDITION").slice(0, 26), w / 2, 210);

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(130, 284, w - 260, 136, 22);
  ctx.fill();
  ctx.strokeStyle = "#161317";
  ctx.lineWidth = 8;
  ctx.stroke();

  ctx.fillStyle = "#4b4338";
  ctx.font = "900 22px system-ui, -apple-system, sans-serif";
  ctx.fillText("CODE CAISSE À USAGE UNIQUE", w / 2, 322);

  ctx.fillStyle = "#161317";
  ctx.font = "900 54px ui-monospace, SFMono-Regular, monospace";
  ctx.fillText(ticketCode || "QR-7K2M", w / 2, 378);
}

function createCrispStampTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 176;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#047857";
  ctx.beginPath();
  ctx.roundRect(10, 10, 492, 156, 34);
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
    depth: 0.1,
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
    // NoToneMapping = zéro délavage, couleurs Kermesse franches & noirs profonds !
    renderer.toneMapping = NoToneMapping;
    renderer.setClearColor(0x000000, 0);

    const canvas = renderer.domElement;
    canvas.className = "parcours-3d-canvas";
    host.appendChild(canvas);

    const scene = new Scene();
    const envRT = createHighContrastStudioEnv(renderer);
    scene.environment = envRT.texture;

    const camera = new PerspectiveCamera(35, 1.25, 0.1, 40);
    camera.position.set(0, 0.08, 8.2);

    scene.add(new HemisphereLight(0xfffaf0, 0x3b2c4a, 0.72));
    const key = new DirectionalLight(0xfff5db, 1.45);
    key.position.set(-4, 5, 6);
    scene.add(key);
    const rim = new DirectionalLight(0xff74b8, 0.95);
    rim.position.set(4.5, 2.5, -3);
    scene.add(rim);
    const winGlow = new PointLight(0xffd93d, 0, 10, 1.5);
    winGlow.position.set(0, 0.2, 2.5);
    scene.add(winGlow);

    // Matériaux contrastés fidèles à la DA Kermesse (#161317 + or riche + blanc franc)
    const inkChassisMat = new MeshPhysicalMaterial({
      color: 0x161317,
      roughness: 0.24,
      metalness: 0.18,
      clearcoat: 0.9,
      clearcoatRoughness: 0.12,
      envMapIntensity: 0.95,
    });
    const brassMat = new MeshPhysicalMaterial({
      color: 0xf5b82e,
      roughness: 0.22,
      metalness: 0.85,
      clearcoat: 0.55,
      envMapIntensity: 1.2,
    });
    const yellowPopMat = new MeshPhysicalMaterial({
      color: 0xffd93d,
      roughness: 0.25,
      metalness: 0.04,
      clearcoat: 0.85,
      envMapIntensity: 0.9,
    });
    const emeraldConeMat = new MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.24,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });

    /* ── ACTEUR A : PLAQUE QR SUR COMPTOIR (Acte 1) ── */
    const qrStandGroup = new Group();
    scene.add(qrStandGroup);

    // Contour noir franc Kermesse + pied jaune pop + QR auto-contrasté
    qrStandGroup.add(
      new Mesh(new RoundedBoxGeometry(1.78, 1.78, 0.20, 6, 0.22), inkChassisMat),
    );
    const standBaseFoot = new Mesh(
      new RoundedBoxGeometry(1.88, 0.24, 0.36, 5, 0.09),
      yellowPopMat,
    );
    standBaseFoot.position.set(0, -0.88, 0.04);
    qrStandGroup.add(standBaseFoot);

    const qrTex = buildCrispQrTexture(qrImg, renderer.capabilities.getMaxAnisotropy());
    const standQrFace = new Mesh(
      new PlaneGeometry(1.52, 1.52),
      new MeshBasicMaterial({ map: qrTex }),
    );
    standQrFace.position.z = 0.106;
    qrStandGroup.add(standQrFace);

    const scanRingMat = new MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0,
      side: DoubleSide,
      depthWrite: false,
    });
    const scanRing = new Mesh(new RingGeometry(0.95, 1.16, 48), scanRingMat);
    scanRing.position.z = 0.12;
    qrStandGroup.add(scanRing);

    /* ── ACTEUR B : SMARTPHONE 3D + ÉCRAN OLED NET + 3 TAMBOURS 3D ── */
    const phoneGroup = new Group();
    scene.add(phoneGroup);

    phoneGroup.add(
      new Mesh(new RoundedBoxGeometry(2.14, 3.76, 0.24, 7, 0.22), inkChassisMat),
    );
    phoneGroup.add(
      new Mesh(new RoundedBoxGeometry(2.20, 3.82, 0.17, 7, 0.24), brassMat),
    );

    const screenCanvas = document.createElement("canvas");
    screenCanvas.width = 512;
    screenCanvas.height = 896;
    drawCrispPhoneScreen(
      screenCanvas,
      { mode: "scan", zoom: 0.72, locked: false, scanPhase: 0.2 },
      qrImg,
    );
    const screenTex = new CanvasTexture(screenCanvas);
    screenTex.colorSpace = SRGBColorSpace;
    screenTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    // Écran OLED en MeshBasicMaterial : 100 % lumineux, contraste maximal, ZÉRO voile !
    const phoneScreen = new Mesh(
      new PlaneGeometry(1.94, 3.50),
      new MeshBasicMaterial({ map: screenTex }),
    );
    phoneScreen.position.z = 0.126;
    phoneGroup.add(phoneScreen);

    const scanCone = new Mesh(new ConeGeometry(0.76, 1.85, 28, 1, true), emeraldConeMat);
    scanCone.rotation.x = Math.PI / 2;
    scanCone.position.set(-0.35, 0.15, -1.1);
    phoneGroup.add(scanCone);

    // 3 VRAIS TAMBOURS CYLINDRIQUES 3D avec icônes vectorielles ultra-nettes !
    const reelsGroup = new Group();
    reelsGroup.position.set(0, 0.11, 0.22);
    phoneGroup.add(reelsGroup);

    const reelTex = createReelDrumTexture(renderer.capabilities.getMaxAnisotropy());
    const reelGeo = new CylinderGeometry(0.46, 0.46, 0.48, 48, 1, true, -Math.PI, Math.PI * 2);
    reelGeo.rotateZ(-Math.PI / 2);

    // MeshStandardMaterial doux avec envMapIntensity bas pour garder les couleurs vives & le volume 3D
    const reelMat = new MeshStandardMaterial({
      map: reelTex,
      roughness: 0.38,
      metalness: 0.0,
      envMapIntensity: 0.28,
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

    const leverPivot = new Group();
    leverPivot.position.set(1.1, 0.1, 0.04);
    reelsGroup.add(leverPivot);
    const leverStick = new Mesh(new CylinderGeometry(0.036, 0.036, 0.66, 16), brassMat);
    leverStick.position.set(0.1, 0.32, 0);
    leverStick.rotation.z = -0.22;
    leverPivot.add(leverStick);
    const leverKnob = new Mesh(
      new SphereGeometry(0.145, 20, 16),
      new MeshPhysicalMaterial({
        color: 0xe11d48,
        roughness: 0.15,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
        envMapIntensity: 0.9,
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
    const winHalo = new Mesh(new RingGeometry(1.42, 1.78, 48), winHaloMat);
    winHalo.position.set(0, 0, -0.4);
    phoneGroup.add(winHalo);

    /* ── ACTEUR C : TICKET D'OR 3D ULTRA-NET + TAMPON VERT + CONFETTIS 3D ── */
    const ticketGroup = new Group();
    scene.add(ticketGroup);

    const ticketCanvas = document.createElement("canvas");
    ticketCanvas.width = 1024;
    ticketCanvas.height = 512;
    drawCrispGoldenTicketTexture(ticketCanvas, "-20% SUR L'ADDITION", "QR-7K2M");
    const ticketTex = new CanvasTexture(ticketCanvas);
    ticketTex.colorSpace = SRGBColorSpace;
    ticketTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    // Corps du ticket en contour encre franc #161317 + face dorée saturée auto-contrastée
    ticketGroup.add(new Mesh(createNotchedTicketGeometry(3.32, 1.78), inkChassisMat));
    const ticketFace = new Mesh(
      new PlaneGeometry(3.06, 1.56),
      new MeshBasicMaterial({ map: ticketTex }),
    );
    ticketFace.position.z = 0.098;
    ticketGroup.add(ticketFace);

    const stampMesh = new Mesh(
      new RoundedBoxGeometry(1.22, 0.38, 0.08, 4, 0.04),
      new MeshBasicMaterial({ map: createCrispStampTexture() }),
    );
    stampMesh.position.set(1.04, -0.74, 0.16);
    stampMesh.rotation.z = -0.14;
    ticketGroup.add(stampMesh);

    const confettiGroup = new Group();
    scene.add(confettiGroup);
    const confettiPalette = [0xffd93d, 0xff5c93, 0x10b981, 0xf97316, 0x8b5cf6, 0x0ea5e9];
    const confettiGeo = new PlaneGeometry(0.2, 0.11);
    const confettiItems = [];
    for (let i = 0; i < 38; i++) {
      const mat = new MeshBasicMaterial({
        color: confettiPalette[i % confettiPalette.length],
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
        const spd = 2.5 + (i % 5) * 0.72;
        p.mesh.visible = true;
        p.mesh.position.set(0, 0.2, 0.35);
        p.vx = Math.cos(a) * spd * 0.9;
        p.vy = 2.7 + Math.abs(Math.sin(a)) * 2.5;
        p.vz = Math.sin(i * 1.7) * 0.8 + 0.4;
        p.rx = (i % 2 === 0 ? 1 : -1) * (3 + (i % 4));
        p.ry = (i % 3 === 0 ? 1 : -1) * (2.5 + (i % 3));
        p.rz = (i % 2 === 0 ? -1 : 1) * 2.2;
      });
    };

    const floorShadow = new Mesh(
      new PlaneGeometry(4.8, 1.3),
      new MeshBasicMaterial({
        map: createSoftShadowTexture(0.26),
        transparent: true,
        opacity: 0.78,
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
        captionPill.textContent = "3. Code gagnant immédiat, validé en 2 s en caisse";
        drawCrispPhoneScreen(screenCanvas, { mode: "win" }, qrImg);
        screenTex.needsUpdate = true;
        drawCrispGoldenTicketTexture(
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
      const domStep = readActiveStep();
      if (domStep !== currentStep) {
        onStepChange(domStep);
      }
      stepElapsed += dt;
      const ease = 1 - Math.exp(-dt * 6.8);

      camera.position.x += (pointerX * 0.4 - camera.position.x) * ease;
      camera.position.y += (0.12 - pointerY * 0.22 - camera.position.y) * ease;
      camera.lookAt(0, 0.12, 0);

      if (currentStep === 1) {
        const approach = Math.min(1, stepElapsed / 1.35);
        const smooth = 1 - Math.pow(1 - approach, 3);
        const locked = stepElapsed > 1.55;
        const tapping = stepElapsed > 2.65 && stepElapsed < 3.15;

        if (stepElapsed - lastScreenDrawT > 0.04) {
          lastScreenDrawT = stepElapsed;
          drawCrispPhoneScreen(
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

        qrStandGroup.visible = true;
        qrStandGroup.position.x += (-1.36 - qrStandGroup.position.x) * ease;
        qrStandGroup.position.y += (0.30 + Math.sin(stepElapsed * 2.1) * 0.04 - qrStandGroup.position.y) * ease;
        qrStandGroup.position.z += (-0.55 - qrStandGroup.position.z) * ease;
        qrStandGroup.rotation.y += (0.34 - qrStandGroup.rotation.y) * ease;
        qrStandGroup.rotation.x += (-0.04 - qrStandGroup.rotation.x) * ease;
        qrStandGroup.scale.setScalar(
          locked
            ? 1.04 + Math.sin((stepElapsed - 1.55) * 9) * 0.03 * Math.exp(-(stepElapsed - 1.55) * 2.5)
            : 0.96,
        );

        const targetPhoneX = MathUtils.lerp(2.25, 0.84, smooth);
        const targetPhoneY = MathUtils.lerp(-0.35, 0.24, smooth) + Math.sin(stepElapsed * 2.3) * 0.04;
        const targetPhoneZ = MathUtils.lerp(1.15, 0.55, smooth);
        phoneGroup.visible = true;
        phoneGroup.position.x += (targetPhoneX - phoneGroup.position.x) * ease;
        phoneGroup.position.y += (targetPhoneY - phoneGroup.position.y) * ease;
        phoneGroup.position.z += (targetPhoneZ - phoneGroup.position.z) * ease;
        phoneGroup.rotation.y += (-0.24 - phoneGroup.rotation.y) * ease;
        phoneGroup.rotation.x += (0.04 - phoneGroup.rotation.x) * ease;
        phoneGroup.rotation.z += (0.03 - phoneGroup.rotation.z) * ease;
        phoneGroup.scale.setScalar(0.84);

        scanCone.visible = true;
        emeraldConeMat.opacity = locked
          ? 0.28 + Math.sin(stepElapsed * 12) * 0.08
          : 0.15 + smooth * 0.1;

        scanRingMat.opacity = locked ? Math.max(0, 1 - (stepElapsed - 1.55) * 0.8) : 0;
        scanRing.scale.setScalar(locked ? 1 + (stepElapsed - 1.55) * 0.75 : 0.75);

        reelsGroup.visible = false;
        ticketGroup.visible = false;
        winHaloMat.opacity = 0;
        winGlow.intensity += (0.3 - winGlow.intensity) * ease;
      } else if (currentStep === 2) {
        qrStandGroup.position.x += (-4.4 - qrStandGroup.position.x) * ease;
        qrStandGroup.scale.setScalar(Math.max(0.01, qrStandGroup.scale.x * (1 - dt * 5)));
        if (qrStandGroup.scale.x < 0.05) qrStandGroup.visible = false;

        phoneGroup.visible = true;
        phoneGroup.position.x += (0 - phoneGroup.position.x) * ease;
        phoneGroup.position.y += (0.26 + Math.sin(stepElapsed * 2.1) * 0.03 - phoneGroup.position.y) * ease;
        phoneGroup.position.z += (0.38 - phoneGroup.position.z) * ease;
        phoneGroup.rotation.y += (Math.sin(stepElapsed * 1.1) * 0.08 - phoneGroup.rotation.y) * ease;
        phoneGroup.rotation.x += (-0.02 - phoneGroup.rotation.x) * ease;
        phoneGroup.rotation.z += (0 - phoneGroup.rotation.z) * ease;
        phoneGroup.scale.setScalar(0.92);

        scanCone.visible = false;
        reelsGroup.visible = true;
        ticketGroup.visible = false;

        leverPivot.rotation.x =
          stepElapsed < 0.5 ? Math.sin((stepElapsed / 0.5) * Math.PI) * 1.05 : 0;

        const stopTimes = [0.95, 1.45, 1.95];
        let lockedCount = 0;
        reels.forEach((reel, idx) => {
          const stopT = stopTimes[idx];
          if (stepElapsed < stopT) {
            const rem = stopT - stepElapsed;
            const turnsLeft = rem * (2.6 + idx * 0.35);
            reel.rotation.x = -(turnsLeft * Math.PI * 2);
          } else {
            lockedCount++;
            const over = stepElapsed - stopT;
            reel.rotation.x = Math.sin(over * 20) * 0.19 * Math.exp(-over * 7.5);
          }
        });

        const won = lockedCount === 3;
        const prizeText = rewardTitleEl?.textContent?.trim() || "-20% SUR L'ADDITION";
        const stateKey = `${lockedCount}:${won}:${prizeText}`;
        if (stateKey !== lastPlayStateKey) {
          lastPlayStateKey = stateKey;
          drawCrispPhoneScreen(
            screenCanvas,
            { mode: "play", lockedCount, won, prize: prizeText },
            qrImg,
          );
          screenTex.needsUpdate = true;
          if (won) {
            captionPill.textContent = "2. 3 diamants alignés — le lot est remporté !";
          }
        }

        winHaloMat.opacity = won ? 0.65 + Math.sin(stepElapsed * 8) * 0.2 : 0;
        winHalo.scale.setScalar(won ? 1.08 + Math.sin(stepElapsed * 7) * 0.05 : 0.8);
        winGlow.intensity += ((won ? 1.4 : 0.4) - winGlow.intensity) * ease;
      } else {
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
          0.18,
          0.24 + Math.sin(stepElapsed * 2.0) * 0.06,
          MathUtils.lerp(-0.2, 1.05, Math.min(1, popT * 1.2)),
        );
        ticketGroup.rotation.y = -0.08 + Math.sin(stepElapsed * 1.5) * 0.14;
        ticketGroup.rotation.x = 0.03 + Math.cos(stepElapsed * 1.2) * 0.05;
        ticketGroup.rotation.z = -0.035;
        ticketGroup.scale.setScalar(Math.max(0.05, elastic * 0.96));

        const stampStart = 0.95;
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
        winGlow.intensity += (1.0 - winGlow.intensity) * ease;
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
   3. HÉRO PAGE FIDÉLITÉ — VRAI PASSEPORT FIDÉLITÉ 3D AVEC QR CODE & TAMPONS
      Couverture cuir/émail bleu nuit profond, tranche dorée, pages crème
      feuilletées sur le côté, dorure « PASSEPORT FIDÉLITÉ », QR net intégré
      (synchronisé en direct avec les 3 pilules), rangée 5 tampons étoiles et
      sceau doré 3D qui tamponne au survol.
   ========================================================================== */
function drawPassportCoverTexture(canvas, mode, qrImg) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  const palettes = {
    passeport: {
      top: "#1b1538",
      bot: "#2d1f59",
      accent: "#ffd93d",
      pillBg: "#ffd93d",
      pillFg: "#161317",
      title: "PASSEPORT",
      subtitle: "CARTE DE FIDÉLITÉ",
      progressLabel: "4 / 5 VISITES · 1 CADEAU OFFERT",
    },
    jackpot: {
      top: "#291436",
      bot: "#4a1b54",
      accent: "#ffd93d",
      pillBg: "#ff5c93",
      pillFg: "#ffffff",
      title: "JACKPOT",
      subtitle: "CAGNOTTE COLLECTIVE",
      progressLabel: "OBJECTIF 86 / 100 PASSAGES",
    },
    parrainage: {
      top: "#0e2b27",
      bot: "#164e44",
      accent: "#ffd93d",
      pillBg: "#34d399",
      pillFg: "#161317",
      title: "PARRAINAGE",
      subtitle: "INVITEZ VOS PROCHES",
      progressLabel: "DOUBLE RÉCOMPENSE IMMÉDIATE",
    },
  };
  const cfg = palettes[mode] || palettes.passeport;

  // Fond couverture riche façon passeport cuir/émail haut contraste
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, cfg.top);
  grad.addColorStop(1, cfg.bot);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Double filet doré embossé tout autour (signature passeport)
  ctx.strokeStyle = cfg.accent;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(36, 36, w - 72, h - 72, 46);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 217, 61, 0.42)";
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 10]);
  ctx.beginPath();
  ctx.roundRect(56, 56, w - 112, h - 112, 34);
  ctx.stroke();
  ctx.setLineDash([]);

  // Petit écusson doré en tête
  ctx.fillStyle = cfg.accent;
  ctx.font = "900 28px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("★  SIMPLE COMME QR  ★", w / 2, 114);

  // Grand titre doré façon passeport officiel
  ctx.fillStyle = "#ffe566";
  ctx.font = "900 84px system-ui, -apple-system, sans-serif";
  ctx.fillText(cfg.title, w / 2, 198);

  // Pastille sous-titre très lisible
  ctx.fillStyle = cfg.pillBg;
  ctx.beginPath();
  ctx.roundRect(w / 2 - 220, 256, 440, 56, 28);
  ctx.fill();
  ctx.strokeStyle = "#161317";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = cfg.pillFg;
  ctx.font = "900 27px system-ui, -apple-system, sans-serif";
  ctx.fillText(cfg.subtitle, w / 2, 286);

  // Fenêtre centrale blanche ultra-nette avec le vrai QR code
  const qrBox = 510;
  const qrX = (w - qrBox) / 2;
  const qrY = 358;
  ctx.fillStyle = "#161317";
  ctx.beginPath();
  ctx.roundRect(qrX - 14, qrY - 14, qrBox + 28, qrBox + 28, 44);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(qrX, qrY, qrBox, qrBox, 34);
  ctx.fill();
  if (qrImg) {
    const pad = 34;
    ctx.drawImage(qrImg, qrX + pad, qrY + pad, qrBox - pad * 2, qrBox - pad * 2);
  }

  // Rangée de 5 tampons fidélité en bas (4 dorés validés + 5e cadeau à débloquer)
  const stampY = 988;
  const startX = 186;
  const gap = 162;
  for (let i = 0; i < 5; i++) {
    const sx = startX + i * gap;
    const isReward = i === 4;
    ctx.beginPath();
    ctx.arc(sx, stampY, 54, 0, Math.PI * 2);
    ctx.fillStyle = isReward ? "#ff5c93" : "#ffd93d";
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = "#161317";
    ctx.stroke();

    if (isReward) {
      // Petit paquet cadeau vectoriel
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(sx - 22, stampY - 12, 44, 34, 6);
      ctx.fill();
      ctx.fillStyle = "#ffd93d";
      ctx.fillRect(sx - 6, stampY - 12, 12, 34);
      ctx.fillRect(sx - 22, stampY + 1, 44, 10);
      ctx.beginPath();
      ctx.arc(sx - 9, stampY - 17, 8, 0, Math.PI * 2);
      ctx.arc(sx + 9, stampY - 17, 8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Étoile dorée tamponnée nette
      ctx.save();
      ctx.translate(sx, stampY);
      ctx.beginPath();
      for (let p = 0; p < 10; p++) {
        const r = p % 2 === 0 ? 30 : 13;
        const a = (p * Math.PI) / 5 - Math.PI / 2;
        if (p === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = "#161317";
      ctx.fill();
      ctx.restore();
    }
  }

  // Texte de jauge lisible en pied de passeport
  ctx.fillStyle = "#fff8dc";
  ctx.font = "900 28px system-ui, -apple-system, sans-serif";
  ctx.fillText(cfg.progressLabel, w / 2, 1106);

  // Petit rappel doré "ZÉRO APPLI · WALLET"
  ctx.fillStyle = "rgba(255, 217, 61, 0.85)";
  ctx.font = "800 22px system-ui, -apple-system, sans-serif";
  ctx.fillText("SANS APPLI · GOOGLE & APPLE WALLET", w / 2, 1168);
}

async function initAnnexPassport3D() {
  const btn = document.getElementById("page-hero-qr-btn");
  if (!btn || btn.dataset.hero3dInit === "1") return;
  const pageMode = (btn.dataset.emulate || "").toLowerCase();
  if (pageMode !== "passeport" && !window.location.pathname.includes("fidelite")) return;
  btn.dataset.hero3dInit = "1";

  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const qrImgEl = document.getElementById("page-hero-qr-img") || btn.querySelector("img.qr-bleed-img");
  let activeMode = "passeport";
  let activeQrImg = await loadQrImage(
    qrImgEl ? qrImgEl.getAttribute("src") || "img/qr-passeport.svg" : "img/qr-passeport.svg",
  );

  const stageHost = document.createElement("span");
  stageHost.className = "hero-3d-stage hero-3d-stage--passport";
  stageHost.setAttribute("aria-hidden", "true");
  btn.appendChild(stageHost);

  const renderer = new WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(0x000000, 0);

  const canvas = renderer.domElement;
  canvas.className = "hero-3d-canvas";
  stageHost.appendChild(canvas);

  const scene = new Scene();
  const envRT = createHighContrastStudioEnv(renderer);
  scene.environment = envRT.texture;

  const camera = new PerspectiveCamera(31, 1, 0.1, 30);
  camera.position.set(0, 0.05, 7.65);

  scene.add(new HemisphereLight(0xfffaf0, 0x2e2340, 0.75));
  const key = new DirectionalLight(0xfff4d6, 1.45);
  key.position.set(-3.6, 4.6, 5.4);
  scene.add(key);
  const rim = new DirectionalLight(0xff7ec2, 0.9);
  rim.position.set(4.2, 2.2, -2.5);
  scene.add(rim);

  const inkLeatherMat = new MeshPhysicalMaterial({
    color: 0x161317,
    roughness: 0.28,
    metalness: 0.12,
    clearcoat: 0.85,
    clearcoatRoughness: 0.14,
    envMapIntensity: 0.95,
  });
  const brassMat = new MeshPhysicalMaterial({
    color: 0xf5b82e,
    roughness: 0.2,
    metalness: 0.88,
    clearcoat: 0.55,
    envMapIntensity: 1.25,
  });
  const pagesMat = new MeshStandardMaterial({
    color: 0xfff7e3,
    roughness: 0.52,
    metalness: 0.04,
    envMapIntensity: 0.35,
  });

  const passportGroup = new Group();
  scene.add(passportGroup);

  // Couverture arrière + bloc de pages crème épaisses (visibles sur la tranche droite en 3D !)
  const backCover = new Mesh(
    new RoundedBoxGeometry(2.34, 3.12, 0.09, 6, 0.14),
    inkLeatherMat,
  );
  backCover.position.set(0.03, 0, -0.17);
  passportGroup.add(backCover);

  const pagesBlock = new Mesh(
    new RoundedBoxGeometry(2.22, 2.94, 0.24, 5, 0.06),
    pagesMat,
  );
  pagesBlock.position.set(0.07, 0, -0.05);
  passportGroup.add(pagesBlock);

  // Tranche dorée fine le long des pages (effet passeport prestige)
  const giltEdge = new Mesh(
    new RoundedBoxGeometry(0.05, 2.86, 0.21, 3, 0.02),
    brassMat,
  );
  giltEdge.position.set(1.18, 0, -0.05);
  passportGroup.add(giltEdge);

  // Dos arrondi relié à gauche + 2 bagues dorées
  const spine = new Mesh(
    new CylinderGeometry(0.18, 0.18, 3.06, 24),
    inkLeatherMat,
  );
  spine.position.set(-1.12, 0, -0.05);
  passportGroup.add(spine);

  [-0.95, 0.95].forEach((by) => {
    const band = new Mesh(new TorusGeometry(0.185, 0.025, 10, 24), brassMat);
    band.rotation.x = Math.PI / 2;
    band.position.set(-1.12, by, -0.05);
    passportGroup.add(band);
  });

  // Couverture avant biseautée + coins dorés + face passeport ultra-nette
  const frontCover = new Mesh(
    new RoundedBoxGeometry(2.36, 3.12, 0.10, 7, 0.14),
    inkLeatherMat,
  );
  frontCover.position.set(0, 0, 0.09);
  passportGroup.add(frontCover);

  // 2 protections d'angles dorées à droite (haut & bas)
  [1.46, -1.46].forEach((cy) => {
    const corner = new Mesh(new RoundedBoxGeometry(0.28, 0.28, 0.14, 4, 0.06), brassMat);
    corner.position.set(1.07, cy, 0.09);
    passportGroup.add(corner);
  });

  const coverCanvas = document.createElement("canvas");
  coverCanvas.width = 1024;
  coverCanvas.height = 1280;
  drawPassportCoverTexture(coverCanvas, activeMode, activeQrImg);
  const coverTex = new CanvasTexture(coverCanvas);
  coverTex.colorSpace = SRGBColorSpace;
  coverTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const coverFace = new Mesh(
    new PlaneGeometry(2.22, 2.94),
    new MeshBasicMaterial({ map: coverTex }),
  );
  coverFace.position.set(0, 0, 0.146);
  passportGroup.add(coverFace);

  // Sceau tampon doré 3D en relief avec étoile VIP nette dans le coin bas-droit
  const sealCanvas = document.createElement("canvas");
  sealCanvas.width = 256;
  sealCanvas.height = 256;
  const sCtx = sealCanvas.getContext("2d");
  sCtx.fillStyle = "#047857";
  sCtx.beginPath();
  sCtx.arc(128, 128, 124, 0, Math.PI * 2);
  sCtx.fill();
  sCtx.strokeStyle = "#ffd93d";
  sCtx.lineWidth = 14;
  sCtx.beginPath();
  sCtx.arc(128, 128, 108, 0, Math.PI * 2);
  sCtx.stroke();
  sCtx.fillStyle = "#ffffff";
  sCtx.font = "900 72px system-ui, -apple-system, sans-serif";
  sCtx.textAlign = "center";
  sCtx.textBaseline = "middle";
  sCtx.fillText("VIP", 128, 134);
  const sealTex = new CanvasTexture(sealCanvas);
  sealTex.colorSpace = SRGBColorSpace;

  const sealGroup = new Group();
  sealGroup.position.set(1.0, -1.28, 0.21);
  passportGroup.add(sealGroup);
  const sealDisc = new Mesh(new CylinderGeometry(0.26, 0.28, 0.08, 32), brassMat);
  sealDisc.rotation.x = Math.PI / 2;
  sealGroup.add(sealDisc);
  const sealFace = new Mesh(
    new PlaneGeometry(0.42, 0.42),
    new MeshBasicMaterial({ map: sealTex, transparent: true }),
  );
  sealFace.position.z = 0.046;
  sealGroup.add(sealFace);

  // Ombre douce au sol
  const shadowMat = new MeshBasicMaterial({
    map: createSoftShadowTexture(0.32),
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  });
  const shadowPlane = new Mesh(new PlaneGeometry(2.9, 0.72), shadowMat);
  shadowPlane.position.set(0, -1.94, -0.1);
  scene.add(shadowPlane);

  // Synchronisation en direct avec les 3 pilules Passeport / Jackpot / Parrainage
  const parentUnit = btn.closest(".qr-floating-unit");
  if (parentUnit) {
    parentUnit.querySelectorAll(".qr-mode-btn").forEach((modeBtn) => {
      modeBtn.addEventListener("click", async () => {
        const nextMode = modeBtn.dataset.emulate || "passeport";
        const nextSrc = modeBtn.dataset.qrSrc || "img/qr-passeport.svg";
        activeMode = nextMode;
        activeQrImg = await loadQrImage(nextSrc);
        drawPassportCoverTexture(coverCanvas, activeMode, activeQrImg);
        coverTex.needsUpdate = true;
      });
    });
  }

  const resize = () => {
    const rect = stageHost.getBoundingClientRect();
    const w = Math.max(260, Math.round(rect.width || 340));
    const h = Math.max(260, Math.round(rect.height || 340));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();

  const heroSection = btn.closest("section") || btn;
  let targetRotY = -0.24;
  let targetRotX = 0.06;
  let curRotY = -0.32;
  let curRotX = 0.08;
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
      const nx = MathUtils.clamp((e.clientX - (rect.left + rect.width / 2)) / 380, -1, 1);
      const ny = MathUtils.clamp((e.clientY - (rect.top + rect.height / 2)) / 320, -1, 1);
      targetRotY = -0.12 + nx * 0.36;
      targetRotX = ny * 0.2;
    },
    { passive: true },
  );
  heroSection.addEventListener(
    "pointerleave",
    () => {
      targetRotY = -0.24;
      targetRotX = 0.06;
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
    const ease = 1 - Math.exp(-dt * 7.2);
    const idleYaw = reducedMotion ? 0 : Math.sin(t * 0.85) * 0.085;
    const idlePitch = reducedMotion ? 0 : Math.cos(t * 0.65) * 0.04;

    curRotY += (targetRotY + idleYaw - curRotY) * ease;
    curRotX += (targetRotX + idlePitch - curRotX) * ease;
    hoverAmt += ((isHovering ? 1 : 0) - hoverAmt) * (1 - Math.exp(-dt * 8));

    const springF = -145 * clickPop - 14 * clickVel;
    clickVel += springF * dt;
    clickPop += clickVel * dt;

    const floatY = reducedMotion ? 0 : Math.sin(t * 1.45) * 0.08;
    passportGroup.position.y = floatY + hoverAmt * 0.05;
    passportGroup.rotation.y = curRotY;
    passportGroup.rotation.x = curRotX;
    passportGroup.rotation.z = -0.04 - curRotY * 0.08;

    const baseScale = 1 + hoverAmt * 0.045;
    passportGroup.scale.set(
      baseScale * (1 - clickPop * 0.06),
      baseScale * (1 + clickPop * 0.08),
      baseScale,
    );

    // Le sceau doré fait un léger rebond vers l'avant au survol
    sealGroup.position.z = 0.22 + hoverAmt * 0.08;
    sealGroup.scale.setScalar(1 + hoverAmt * 0.14);

    const sScale = 1 - floatY * 0.45 - hoverAmt * 0.05;
    shadowPlane.scale.set(sScale, sScale, 1);
    shadowMat.opacity = 0.8 - floatY * 0.7;

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
   4. HÉRO PAGE VITRINE & RÉSERVATION — CARTE-MENU / AGENDA 3D ARTICULÉE
      Vraie carte de menu bistrot/atelier ouverte à charnière dorée en 3D :
      - Volet gauche : La Carte du Jour (plats/prestations + pastilles prix + 0 % COMM)
      - Volet droit  : QR Code net + créneau de réservation direct confirmé
      - S'ouvre plus largement vers le visiteur au survol + synchro avec les 3 onglets !
   ========================================================================== */
function drawMenuLeftPageTexture(canvas, mode) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  // Papier crème chaud type belle carte de bistrot / salon
  ctx.fillStyle = "#fffdf6";
  ctx.fillRect(0, 0, w, h);

  // Bordure intérieure Kermesse fine + filets dorés
  ctx.strokeStyle = "#161317";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.roundRect(30, 30, w - 60, h - 60, 38);
  ctx.stroke();

  ctx.strokeStyle = "#f5b82e";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(48, 48, w - 96, h - 96, 26);
  ctx.stroke();

  // Pastille haute 0 % COMMISSION
  ctx.fillStyle = "#047857";
  ctx.beginPath();
  ctx.roundRect(w / 2 - 190, 82, 380, 54, 27);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 26px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("✓  0 % DE COMMISSION", w / 2, 110);

  const contentByMode = {
    vitrine: {
      heading: "LA CARTE DU JOUR",
      sub: "À jour en direct · Zéro PDF",
      rows: [
        { dot: "#ff5c93", title: "Menu du Marché", desc: "Entrée + Plat + Café", price: "19 €" },
        { dot: "#ffd93d", title: "Plat Signature", desc: "Produits frais locaux", price: "15 €" },
        { dot: "#34d399", title: "Douceur Maison", desc: "Dessert du pâtissier", price: "8 €" },
      ],
    },
    rdv: {
      heading: "PRENDRE RDV",
      sub: "Agenda direct · Sans appli",
      rows: [
        { dot: "#34d399", title: "Coupe & Soin", desc: "Durée 45 min · Libre", price: "38 €" },
        { dot: "#ffd93d", title: "Table 2 pers.", desc: "Terrasse ou salle", price: "19h30" },
        { dot: "#ff5c93", title: "Soin Visage", desc: "Créneau demain 14h", price: "55 €" },
      ],
    },
    moments: {
      heading: "MOMENTS VIP",
      sub: "Places limitées · Flash",
      rows: [
        { dot: "#ffd93d", title: "Soirée Dégustation", desc: "Jeudi 19h · 6 places", price: "25 €" },
        { dot: "#ff5c93", title: "Atelier Pâtisserie", desc: "Samedi 10h · Ouvert", price: "35 €" },
        { dot: "#34d399", title: "Panier Anti-Gaspi", desc: "Fin de journée 18h30", price: "-40%" },
      ],
    },
  };
  const cfg = contentByMode[mode] || contentByMode.vitrine;

  ctx.fillStyle = "#161317";
  ctx.font = "900 58px system-ui, -apple-system, sans-serif";
  ctx.fillText(cfg.heading, w / 2, 206);

  ctx.fillStyle = "#6b5e4c";
  ctx.font = "800 28px system-ui, -apple-system, sans-serif";
  ctx.fillText(cfg.sub, w / 2, 260);

  // Ligne séparatrice
  ctx.strokeStyle = "#161317";
  ctx.lineWidth = 4;
  ctx.setLineDash([12, 10]);
  ctx.beginPath();
  ctx.moveTo(92, 304);
  ctx.lineTo(w - 92, 304);
  ctx.stroke();
  ctx.setLineDash([]);

  // 3 fiches prestations / plats ultra-lisibles
  cfg.rows.forEach((row, idx) => {
    const ry = 352 + idx * 238;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(78, ry, w - 156, 198, 28);
    ctx.fill();
    ctx.strokeStyle = "#161317";
    ctx.lineWidth = 7;
    ctx.stroke();

    // Pastille couleur à gauche
    ctx.fillStyle = row.dot;
    ctx.beginPath();
    ctx.arc(146, ry + 99, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#161317";
    ctx.lineWidth = 5;
    ctx.stroke();

    // Textes alignés à gauche
    ctx.textAlign = "left";
    ctx.fillStyle = "#161317";
    ctx.font = "900 38px system-ui, -apple-system, sans-serif";
    ctx.fillText(row.title, 206, ry + 78);

    ctx.fillStyle = "#5c5247";
    ctx.font = "700 28px system-ui, -apple-system, sans-serif";
    ctx.fillText(row.desc, 206, ry + 132);

    // Pastille prix jaune Kermesse à droite
    ctx.fillStyle = "#ffd93d";
    ctx.beginPath();
    ctx.roundRect(w - 266, ry + 62, 162, 74, 37);
    ctx.fill();
    ctx.strokeStyle = "#161317";
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#161317";
    ctx.font = "900 34px system-ui, -apple-system, sans-serif";
    ctx.fillText(row.price, w - 185, ry + 101);
  });

  // Pied de carte
  ctx.textAlign = "center";
  ctx.fillStyle = "#161317";
  ctx.font = "900 26px system-ui, -apple-system, sans-serif";
  ctx.fillText("MODIFIABLE EN 1 CLIC DEPUIS VOTRE TÉLÉPHONE", w / 2, 1142);
}

function drawMenuRightPageTexture(canvas, mode, qrImg) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "#161317";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.roundRect(30, 30, w - 60, h - 60, 38);
  ctx.stroke();

  // En-tête jaune Kermesse
  ctx.fillStyle = "#ffd93d";
  ctx.beginPath();
  ctx.roundRect(96, 74, w - 192, 76, 38);
  ctx.fill();
  ctx.strokeStyle = "#161317";
  ctx.lineWidth = 7;
  ctx.stroke();

  ctx.fillStyle = "#161317";
  ctx.font = "900 32px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const topLabel =
    mode === "rdv"
      ? "SCANNER POUR RÉSERVER"
      : mode === "moments"
        ? "SCANNER L'OFFRE VIP"
        : "SCANNER LA VITRINE";
  ctx.fillText(topLabel, w / 2, 114);

  // Grand QR Code net central
  const qrSize = 560;
  const qx = (w - qrSize) / 2;
  const qy = 200;
  ctx.fillStyle = "#161317";
  ctx.beginPath();
  ctx.roundRect(qx - 14, qy - 14, qrSize + 28, qrSize + 28, 42);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(qx, qy, qrSize, qrSize, 32);
  ctx.fill();
  if (qrImg) {
    const pad = 34;
    ctx.drawImage(qrImg, qx + pad, qy + pad, qrSize - pad * 2, qrSize - pad * 2);
  }

  // Encart réservation directe en bas de la page droite
  ctx.fillStyle = "#ecfdf5";
  ctx.beginPath();
  ctx.roundRect(80, 836, w - 160, 290, 32);
  ctx.fill();
  ctx.strokeStyle = "#047857";
  ctx.lineWidth = 8;
  ctx.stroke();

  ctx.fillStyle = "#064e3b";
  ctx.font = "900 32px system-ui, -apple-system, sans-serif";
  ctx.fillText("RÉSERVATION DIRECTE", w / 2, 896);

  ctx.fillStyle = "#161317";
  ctx.font = "900 44px system-ui, -apple-system, sans-serif";
  ctx.fillText("Sam. 19h30 · 2 pers.", w / 2, 964);

  // Bouton confirmé vert émeraude
  ctx.fillStyle = "#047857";
  ctx.beginPath();
  ctx.roundRect(w / 2 - 210, 1020, 420, 72, 36);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 30px system-ui, -apple-system, sans-serif";
  ctx.fillText("✓ CONFIRMÉ EN 2 CLICS", w / 2, 1058);
}

async function initAnnexMenuVitrine3D() {
  const btn = document.getElementById("page-hero-qr-btn");
  if (!btn || btn.dataset.hero3dInit === "1") return;
  const pageMode = (btn.dataset.emulate || "").toLowerCase();
  if (pageMode !== "vitrine" && !window.location.pathname.includes("vitrine-reservation")) return;
  btn.dataset.hero3dInit = "1";

  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const qrImgEl = document.getElementById("page-hero-qr-img") || btn.querySelector("img.qr-bleed-img");
  let activeMode = "vitrine";
  let activeQrImg = await loadQrImage(
    qrImgEl ? qrImgEl.getAttribute("src") || "img/qr-vitrine.svg" : "img/qr-vitrine.svg",
  );

  const stageHost = document.createElement("span");
  stageHost.className = "hero-3d-stage hero-3d-stage--menu";
  stageHost.setAttribute("aria-hidden", "true");
  btn.appendChild(stageHost);

  const renderer = new WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(0x000000, 0);

  const canvas = renderer.domElement;
  canvas.className = "hero-3d-canvas";
  stageHost.appendChild(canvas);

  const scene = new Scene();
  const envRT = createHighContrastStudioEnv(renderer);
  scene.environment = envRT.texture;

  const camera = new PerspectiveCamera(31, 1.18, 0.1, 30);
  camera.position.set(0, 0.06, 7.55);

  scene.add(new HemisphereLight(0xfffaf0, 0x2f253c, 0.78));
  const key = new DirectionalLight(0xfff4d6, 1.45);
  key.position.set(-3.8, 4.8, 5.5);
  scene.add(key);
  const rim = new DirectionalLight(0xff7ec2, 0.85);
  rim.position.set(4.4, 2.2, -2.6);
  scene.add(rim);

  const inkCoverMat = new MeshPhysicalMaterial({
    color: 0x161317,
    roughness: 0.26,
    metalness: 0.14,
    clearcoat: 0.88,
    clearcoatRoughness: 0.12,
    envMapIntensity: 0.95,
  });
  const brassMat = new MeshPhysicalMaterial({
    color: 0xf5b82e,
    roughness: 0.2,
    metalness: 0.88,
    clearcoat: 0.55,
    envMapIntensity: 1.25,
  });

  const menuGroup = new Group();
  scene.add(menuGroup);

  // Charnière / reliure dorée centrale
  const spine = new Mesh(new CylinderGeometry(0.085, 0.085, 2.86, 20), brassMat);
  menuGroup.add(spine);

  const pageW = 2.02;
  const pageH = 2.82;

  // Volet GAUCHE (La Carte / Menu) articulé sur la charnière centrale
  const leftPivot = new Group();
  menuGroup.add(leftPivot);

  const leftBoard = new Mesh(
    new RoundedBoxGeometry(pageW, pageH, 0.11, 6, 0.12),
    inkCoverMat,
  );
  leftBoard.position.set(-pageW / 2 - 0.04, 0, 0);
  leftPivot.add(leftBoard);

  const leftCanvas = document.createElement("canvas");
  leftCanvas.width = 1024;
  leftCanvas.height = 1280;
  drawMenuLeftPageTexture(leftCanvas, activeMode);
  const leftTex = new CanvasTexture(leftCanvas);
  leftTex.colorSpace = SRGBColorSpace;
  leftTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const leftFace = new Mesh(
    new PlaneGeometry(pageW - 0.12, pageH - 0.14),
    new MeshBasicMaterial({ map: leftTex }),
  );
  leftFace.position.set(-pageW / 2 - 0.04, 0, 0.062);
  leftPivot.add(leftFace);

  // Volet DROIT (QR Code + Réservation directe) articulé sur la charnière centrale
  const rightPivot = new Group();
  menuGroup.add(rightPivot);

  const rightBoard = new Mesh(
    new RoundedBoxGeometry(pageW, pageH, 0.11, 6, 0.12),
    inkCoverMat,
  );
  rightBoard.position.set(pageW / 2 + 0.04, 0, 0);
  rightPivot.add(rightBoard);

  const rightCanvas = document.createElement("canvas");
  rightCanvas.width = 1024;
  rightCanvas.height = 1280;
  drawMenuRightPageTexture(rightCanvas, activeMode, activeQrImg);
  const rightTex = new CanvasTexture(rightCanvas);
  rightTex.colorSpace = SRGBColorSpace;
  rightTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const rightFace = new Mesh(
    new PlaneGeometry(pageW - 0.12, pageH - 0.14),
    new MeshBasicMaterial({ map: rightTex }),
  );
  rightFace.position.set(pageW / 2 + 0.04, 0, 0.062);
  rightPivot.add(rightFace);

  // Petit marque-page / pince dorée en haut de la page droite
  const goldClip = new Mesh(new RoundedBoxGeometry(0.42, 0.24, 0.16, 4, 0.05), brassMat);
  goldClip.position.set(pageW / 2 + 0.04, pageH / 2 + 0.02, 0.02);
  rightPivot.add(goldClip);

  // Ombre douce au sol
  const shadowMat = new MeshBasicMaterial({
    map: createSoftShadowTexture(0.32),
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  });
  const shadowPlane = new Mesh(new PlaneGeometry(4.2, 0.78), shadowMat);
  shadowPlane.position.set(0, -1.78, -0.1);
  scene.add(shadowPlane);

  // Synchronisation avec les 3 pilules Carte & Tarifs / Rendez-vous / Moments VIP
  const parentUnit = btn.closest(".qr-floating-unit");
  if (parentUnit) {
    parentUnit.querySelectorAll(".qr-mode-btn").forEach((modeBtn) => {
      modeBtn.addEventListener("click", async () => {
        const nextMode = modeBtn.dataset.emulate || "vitrine";
        const nextSrc = modeBtn.dataset.qrSrc || "img/qr-vitrine.svg";
        activeMode = nextMode;
        activeQrImg = await loadQrImage(nextSrc);
        drawMenuLeftPageTexture(leftCanvas, activeMode);
        leftTex.needsUpdate = true;
        drawMenuRightPageTexture(rightCanvas, activeMode, activeQrImg);
        rightTex.needsUpdate = true;
      });
    });
  }

  const resize = () => {
    const rect = stageHost.getBoundingClientRect();
    const w = Math.max(300, Math.round(rect.width || 400));
    const h = Math.max(250, Math.round(rect.height || 320));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();

  const heroSection = btn.closest("section") || btn;
  let targetRotY = -0.1;
  let targetRotX = 0.06;
  let curRotY = -0.16;
  let curRotX = 0.08;
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
      const nx = MathUtils.clamp((e.clientX - (rect.left + rect.width / 2)) / 420, -1, 1);
      const ny = MathUtils.clamp((e.clientY - (rect.top + rect.height / 2)) / 320, -1, 1);
      targetRotY = nx * 0.28;
      targetRotX = ny * 0.18;
    },
    { passive: true },
  );
  heroSection.addEventListener(
    "pointerleave",
    () => {
      targetRotY = -0.1;
      targetRotX = 0.06;
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
    clickVel = -3.2;
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
    const ease = 1 - Math.exp(-dt * 7.2);
    const idleYaw = reducedMotion ? 0 : Math.sin(t * 0.8) * 0.07;
    const idlePitch = reducedMotion ? 0 : Math.cos(t * 0.6) * 0.035;

    curRotY += (targetRotY + idleYaw - curRotY) * ease;
    curRotX += (targetRotX + idlePitch - curRotX) * ease;
    hoverAmt += ((isHovering ? 1 : 0) - hoverAmt) * (1 - Math.exp(-dt * 8));

    const springF = -145 * clickPop - 14 * clickVel;
    clickVel += springF * dt;
    clickPop += clickVel * dt;

    const floatY = reducedMotion ? 0 : Math.sin(t * 1.4) * 0.075;
    menuGroup.position.y = floatY + hoverAmt * 0.05;
    menuGroup.rotation.y = curRotY;
    menuGroup.rotation.x = curRotX;
    menuGroup.rotation.z = -curRotY * 0.06;

    // Ouverture articulée des 2 volets : s'ouvrent plus largement au survol !
    const hingeAngle = MathUtils.lerp(0.28, 0.09, hoverAmt);
    leftPivot.rotation.y = hingeAngle;
    rightPivot.rotation.y = -hingeAngle;

    const baseScale = 1 + hoverAmt * 0.045;
    menuGroup.scale.set(
      baseScale * (1 - clickPop * 0.055),
      baseScale * (1 + clickPop * 0.075),
      baseScale,
    );

    const sScale = 1 - floatY * 0.45 - hoverAmt * 0.05;
    shadowPlane.scale.set(sScale, sScale, 1);
    shadowMat.opacity = 0.8 - floatY * 0.7;

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

const bootAll = () => {
  if (!hasWebGL()) return;
  const run = () => {
    void initHeroBubbleQr3D();
    void initParcours3DCinema();
    void initAnnexPassport3D();
    void initAnnexMenuVitrine3D();
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

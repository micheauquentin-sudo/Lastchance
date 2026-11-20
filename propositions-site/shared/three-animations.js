/**
 * Animations 3D Three.js pour Simple comme QR (Lastchance).
 *
 * Charge Three.js en local (`./vendor/three.module.js`, compatible CSP `'self'`).
 * Trois scènes déclaratives via `data-three-scene`:
 *   - `hero`   : objets 3D cartoon flottants + parallaxe souris dans le héro
 *   - `wheel`  : roue de la fortune 3D interactive (clic / glisser / bouton + confettis 3D)
 *   - `finale` : pluie douce de pièces dorées, étoiles et rubans 3D dans la bannière finale
 *
 * Dégradation gracieuse : si WebGL est indisponible ou si
 * `prefers-reduced-motion: reduce` est actif, aucun blocage ni erreur console.
 */
import * as THREE from "./vendor/three.module.js";

const REDUCED_MOTION =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const PALETTES = {
  pixar: [0xffd93d, 0xff4da6, 0x00d084, 0x389bff, 0xa55eea, 0xff7b3b],
  jeux: [0xffd000, 0xff358b, 0x05d38a, 0x389bff, 0xc084fc, 0xff6b35],
  fidelite: [0xffd700, 0xf59e0b, 0xff4da6, 0xa855f7, 0x05d38a, 0xffffff],
  vitrine: [0x05d38a, 0xffd93d, 0x389bff, 0xff4da6, 0xff7b3b, 0xfbbf24],
};

function createRenderer(canvas) {
  try {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    return renderer;
  } catch {
    return null;
  }
}

function createStarShape(outerR, innerR, points = 5) {
  const shape = new THREE.Shape();
  const step = Math.PI / points;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = i * step - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function createStarMesh(color, scale = 1) {
  const shape = createStarShape(0.48 * scale, 0.22 * scale, 5);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.16 * scale,
    bevelEnabled: true,
    bevelThickness: 0.06 * scale,
    bevelSize: 0.05 * scale,
    bevelSegments: 3,
  });
  geo.center();
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.25,
    metalness: 0.22,
  });
  return new THREE.Mesh(geo, mat);
}

function createGiftMesh(boxColor, ribbonColor, scale = 1) {
  const group = new THREE.Group();
  const boxGeo = new THREE.BoxGeometry(0.65 * scale, 0.65 * scale, 0.65 * scale);
  const boxMat = new THREE.MeshStandardMaterial({
    color: boxColor,
    roughness: 0.3,
    metalness: 0.1,
  });
  const box = new THREE.Mesh(boxGeo, boxMat);
  group.add(box);

  const ribbonMat = new THREE.MeshStandardMaterial({
    color: ribbonColor,
    roughness: 0.22,
    metalness: 0.28,
  });
  const bandA = new THREE.Mesh(
    new THREE.BoxGeometry(0.7 * scale, 0.7 * scale, 0.14 * scale),
    ribbonMat,
  );
  const bandB = new THREE.Mesh(
    new THREE.BoxGeometry(0.14 * scale, 0.7 * scale, 0.7 * scale),
    ribbonMat,
  );
  group.add(bandA, bandB);

  const bow = new THREE.Mesh(
    new THREE.TorusGeometry(0.14 * scale, 0.045 * scale, 10, 20),
    ribbonMat,
  );
  bow.position.y = 0.38 * scale;
  bow.rotation.x = Math.PI / 2;
  group.add(bow);
  return group;
}

function createCoinMesh(color, scale = 1) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.22,
    metalness: 0.55,
  });
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42 * scale, 0.42 * scale, 0.11 * scale, 28),
    mat,
  );
  disc.rotation.x = Math.PI / 2;
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.39 * scale, 0.055 * scale, 10, 28),
    mat,
  );
  group.add(disc, rim);
  return group;
}

function createPlayfulLights(scene) {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x3b2d54, 1.35);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff6e5, 1.65);
  key.position.set(5, 8, 7);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xff4da6, 0.85);
  rim.position.set(-6, -3, 4);
  scene.add(rim);
}

/**
 * Observe la visibilité d'un canvas pour mettre en pause la boucle
 * d'animation dès qu'il sort de l'écran.
 */
function createVisibilityController(canvas, renderFrame) {
  let rafId = 0;
  let visible = true;
  let active = true;

  const loop = (now) => {
    if (!active || !visible) {
      rafId = 0;
      return;
    }
    renderFrame(now * 0.001);
    rafId = window.requestAnimationFrame(loop);
  };

  const start = () => {
    if (REDUCED_MOTION) {
      renderFrame(0);
      return;
    }
    if (!rafId && active && visible) {
      rafId = window.requestAnimationFrame(loop);
    }
  };

  const stop = () => {
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  let observer = null;
  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(
      (entries) => {
        visible = Boolean(entries[0]?.isIntersecting);
        if (visible) start();
        else stop();
      },
      { threshold: 0.05 },
    );
    observer.observe(canvas);
  }

  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    active = false;
    stop();
  });

  start();

  return {
    destroy: () => {
      active = false;
      stop();
      if (observer) observer.disconnect();
    },
  };
}

/* ============================================================================
   SCÈNE 1 : HERO 3D FLOTTANT + PARALLAXE POINTEUR
   ============================================================================ */
function initHeroScene(canvas) {
  const renderer = createRenderer(canvas);
  if (!renderer) return;

  const theme = canvas.dataset.threeTheme || "pixar";
  const palette = PALETTES[theme] || PALETTES.pixar;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 11);

  createPlayfulLights(scene);

  const root = new THREE.Group();
  scene.add(root);

  // Coordonnées périphériques pour encadrer le texte sans le masquer
  const slots = [
    [-5.6, 2.7, -1.2],
    [5.8, 2.5, -1.0],
    [-6.1, -1.6, -0.8],
    [6.2, -1.9, -1.4],
    [-3.8, 3.3, -2.5],
    [3.5, 3.2, -2.2],
    [-4.6, -2.8, -2.0],
    [4.4, -2.9, -2.3],
    [0.2, 3.6, -3.2],
    [-7.1, 0.6, -2.4],
    [7.1, 0.5, -2.0],
    [-2.0, -3.3, -2.8],
  ];

  const items = slots.map(([x, y, z], idx) => {
    const color = palette[idx % palette.length];
    const nextColor = palette[(idx + 1) % palette.length];
    let mesh;
    const kind = idx % 5;
    if (kind === 0) {
      mesh = createStarMesh(color, 0.95);
    } else if (kind === 1) {
      mesh = new THREE.Mesh(
        new THREE.TorusGeometry(0.38, 0.15, 16, 32),
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.25,
          metalness: 0.18,
        }),
      );
    } else if (kind === 2) {
      mesh = createGiftMesh(color, nextColor, 0.88);
    } else if (kind === 3) {
      mesh = createCoinMesh(0xffd93d, 0.92);
    } else {
      mesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.42, 0),
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.18,
          metalness: 0.32,
          flatShading: true,
        }),
      );
    }

    mesh.position.set(x, y, z);
    mesh.rotation.set(idx * 0.6, idx * 0.8, idx * 0.3);
    root.add(mesh);

    return {
      mesh,
      baseY: y,
      baseX: x,
      phase: idx * 0.9,
      amp: 0.22 + (idx % 3) * 0.08,
      rotX: (idx % 2 === 0 ? 1 : -1) * (0.28 + (idx % 4) * 0.08),
      rotY: (idx % 3 === 0 ? -1 : 1) * (0.35 + (idx % 3) * 0.1),
    };
  });

  const resize = () => {
    const parent = canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : 600;
    if (w <= 0 || h <= 0) return;
    camera.aspect = w / h;
    // Sur mobile étroit, rapprocher légèrement les objets latéraux
    camera.position.z = w < 720 ? 13.5 : 11;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };

  resize();
  const ro = new ResizeObserver(resize);
  if (canvas.parentElement) ro.observe(canvas.parentElement);

  const targetPointer = { x: 0, y: 0 };
  const currentPointer = { x: 0, y: 0 };
  window.addEventListener(
    "pointermove",
    (e) => {
      targetPointer.x = (e.clientX / window.innerWidth - 0.5) * 2;
      targetPointer.y = (e.clientY / window.innerHeight - 0.5) * 2;
    },
    { passive: true },
  );

  createVisibilityController(canvas, (t) => {
    currentPointer.x += (targetPointer.x - currentPointer.x) * 0.06;
    currentPointer.y += (targetPointer.y - currentPointer.y) * 0.06;

    root.rotation.y = currentPointer.x * 0.12;
    root.rotation.x = currentPointer.y * 0.08;

    for (const item of items) {
      item.mesh.position.y =
        item.baseY + Math.sin(t * 1.35 + item.phase) * item.amp;
      item.mesh.rotation.x += 0.008 * item.rotX;
      item.mesh.rotation.y += 0.01 * item.rotY;
    }

    renderer.render(scene, camera);
  });
}

/* ============================================================================
   SCÈNE 2 : ROUE DE LA FORTUNE 3D INTERACTIVE + CONFETTIS 3D
   ============================================================================ */
const WHEEL_SEGMENTS = [
  { label: "-20%", color: "#ff4da6", text: "#ffffff", prize: "-20 % sur l'addition" },
  { label: "CAFÉ", color: "#ffd93d", text: "#161317", prize: "Un café ou boisson offert" },
  { label: "DESSERT", color: "#00d084", text: "#161317", prize: "Un dessert maison offert" },
  { label: "JACKPOT", color: "#a55eea", text: "#ffffff", prize: "Jackpot : bon de 15 € !" },
  { label: "CADEAU", color: "#389bff", text: "#ffffff", prize: "Un cadeau surprise au comptoir" },
  { label: "SURPRISE", color: "#ff7b3b", text: "#ffffff", prize: "Menu ou formule surclassée" },
  { label: "-10%", color: "#ffd93d", text: "#161317", prize: "-10 % sur la prochaine visite" },
  { label: "VIP", color: "#ff4da6", text: "#ffffff", prize: "Statut VIP + 2 tampons fidélité" },
];

function createWheelTexture() {
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.47;
  const n = WHEEL_SEGMENTS.length;
  const arc = (Math.PI * 2) / n;

  ctx.clearRect(0, 0, size, size);

  for (let i = 0; i < n; i++) {
    const start = i * arc - Math.PI / 2 - arc / 2;
    const end = start + arc;
    const seg = WHEEL_SEGMENTS[i];

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();

    ctx.lineWidth = 8;
    ctx.strokeStyle = "#161317";
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(start + arc / 2);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = seg.text;
    ctx.font = "900 46px 'Unbounded', 'Fredoka', sans-serif";
    ctx.fillText(seg.label, r - 48, 0);
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function initWheelScene(canvas) {
  const renderer = createRenderer(canvas);
  if (!renderer) return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.35, 7.6);

  createPlayfulLights(scene);

  const stageGroup = new THREE.Group();
  scene.add(stageGroup);

  // Socle 3D stable
  const standMat = new THREE.MeshStandardMaterial({
    color: 0x161317,
    roughness: 0.45,
    metalness: 0.25,
  });
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.4, 0.3, 32),
    standMat,
  );
  base.position.y = -2.35;
  stageGroup.add(base);

  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.26, 2.2, 20),
    standMat,
  );
  pillar.position.set(0, -1.25, -0.35);
  stageGroup.add(pillar);

  // Groupe tournant de la roue
  const wheelGroup = new THREE.Group();
  wheelGroup.position.y = 0.08;
  stageGroup.add(wheelGroup);

  const wheelTex = createWheelTexture();
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(2.05, 2.05, 0.28, 48),
    [
      new THREE.MeshStandardMaterial({ color: 0x161317, roughness: 0.4 }),
      new THREE.MeshStandardMaterial({ map: wheelTex, roughness: 0.32 }),
      new THREE.MeshStandardMaterial({ color: 0x161317, roughness: 0.4 }),
    ],
  );
  disc.rotation.x = Math.PI / 2;
  wheelGroup.add(disc);

  // Anneau extérieur doré + contour noir
  const outerRim = new THREE.Mesh(
    new THREE.TorusGeometry(2.08, 0.11, 16, 48),
    new THREE.MeshStandardMaterial({
      color: 0xffd93d,
      roughness: 0.22,
      metalness: 0.45,
    }),
  );
  outerRim.position.z = 0.08;
  wheelGroup.add(outerRim);

  // 8 chevilles dorées autour de la roue
  const pegGeo = new THREE.SphereGeometry(0.085, 14, 14);
  const pegMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.15,
    metalness: 0.65,
  });
  const segCount = WHEEL_SEGMENTS.length;
  for (let i = 0; i < segCount; i++) {
    const angle = (i * Math.PI * 2) / segCount + Math.PI / segCount;
    const peg = new THREE.Mesh(pegGeo, pegMat);
    peg.position.set(Math.cos(angle) * 1.96, Math.sin(angle) * 1.96, 0.18);
    wheelGroup.add(peg);
  }

  // Moyeu central + étoile 3D
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.46, 0.36, 28),
    new THREE.MeshStandardMaterial({
      color: 0x161317,
      roughness: 0.25,
      metalness: 0.3,
    }),
  );
  hub.rotation.x = Math.PI / 2;
  hub.position.z = 0.12;
  wheelGroup.add(hub);

  const hubStar = createStarMesh(0xffd93d, 0.46);
  hubStar.position.z = 0.33;
  wheelGroup.add(hubStar);

  // Cliquet supérieur (rebondit au passage des chevilles)
  const pointerGroup = new THREE.Group();
  pointerGroup.position.set(0, 2.32, 0.22);
  const pointerMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.24, 0.56, 4),
    new THREE.MeshStandardMaterial({
      color: 0xff4da6,
      roughness: 0.25,
      metalness: 0.2,
    }),
  );
  pointerMesh.rotation.z = Math.PI;
  pointerMesh.position.y = -0.18;
  pointerGroup.add(pointerMesh);
  stageGroup.add(pointerGroup);

  // Particules confettis 3D lors d'un gain
  const confetti = [];
  const confettiPalette = PALETTES.pixar;
  const confettiGeo = new THREE.BoxGeometry(0.14, 0.08, 0.03);

  function spawnConfettiBurst() {
    for (let i = 0; i < 42; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: confettiPalette[i % confettiPalette.length],
        roughness: 0.3,
        metalness: 0.2,
      });
      const piece = new THREE.Mesh(confettiGeo, mat);
      const a = Math.random() * Math.PI * 2;
      const speed = 2.4 + Math.random() * 3.4;
      piece.position.set(0, 0.2, 0.5);
      scene.add(piece);
      confetti.push({
        mesh: piece,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed + 2.2,
        vz: (Math.random() - 0.5) * 2.5,
        rx: (Math.random() - 0.5) * 10,
        ry: (Math.random() - 0.5) * 10,
        life: 1.8 + Math.random() * 0.6,
      });
    }
  }

  let angularVel = 0;
  let spinning = false;
  let pointerKick = 0;
  let lastPegIndex = -1;
  let tiltTarget = { x: 0, y: 0 };

  const spinBtn = document.getElementById("lc-three-wheel-spin");
  const resultEl = document.getElementById("lc-three-wheel-result");

  function triggerSpin(extraPower = 0) {
    if (spinning) return;
    spinning = true;
    angularVel = 0.26 + Math.random() * 0.14 + extraPower;
    if (resultEl) {
      resultEl.textContent = "🎡 La roue tourne… bonne chance !";
    }
    if (spinBtn) {
      spinBtn.disabled = true;
      spinBtn.textContent = "⏳ Tour en cours…";
    }
  }

  if (spinBtn) {
    spinBtn.addEventListener("click", () => triggerSpin(0));
  }

  canvas.addEventListener("click", () => triggerSpin(0));
  canvas.addEventListener(
    "pointermove",
    (e) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      tiltTarget.y = ((e.clientX - rect.left) / rect.width - 0.5) * 0.35;
      tiltTarget.x = ((e.clientY - rect.top) / rect.height - 0.5) * 0.22;
    },
    { passive: true },
  );
  canvas.addEventListener(
    "pointerleave",
    () => {
      tiltTarget.x = 0;
      tiltTarget.y = 0;
    },
    { passive: true },
  );

  const resize = () => {
    const w = canvas.clientWidth || 380;
    const h = canvas.clientHeight || 380;
    if (w <= 0 || h <= 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  let prevTime = 0;
  createVisibilityController(canvas, (t) => {
    const dt = prevTime ? Math.min(t - prevTime, 0.05) : 0.016;
    prevTime = t;

    stageGroup.rotation.y += (tiltTarget.y - stageGroup.rotation.y) * 0.08;
    stageGroup.rotation.x += (tiltTarget.x - stageGroup.rotation.x) * 0.08;

    if (spinning) {
      wheelGroup.rotation.z -= angularVel;
      angularVel *= 0.985;

      const step = (Math.PI * 2) / segCount;
      const pegIdx = Math.floor(
        (((wheelGroup.rotation.z % (Math.PI * 2)) + Math.PI * 2) %
          (Math.PI * 2)) /
          step,
      );
      if (pegIdx !== lastPegIndex) {
        lastPegIndex = pegIdx;
        pointerKick = -0.45;
      }

      if (angularVel < 0.0025) {
        spinning = false;
        angularVel = 0;
        const norm =
          ((-wheelGroup.rotation.z % (Math.PI * 2)) + Math.PI * 2) %
          (Math.PI * 2);
        const winIdx = Math.floor((norm + step / 2) / step) % segCount;
        const won = WHEEL_SEGMENTS[winIdx];
        if (resultEl && won) {
          resultEl.textContent = `🎉 Lot remporté : ${won.prize} !`;
        }
        if (spinBtn) {
          spinBtn.disabled = false;
          spinBtn.textContent = "🎡 Relancer la roue 3D";
        }
        spawnConfettiBurst();
      }
    } else {
      // Oscillation douce au repos pour montrer la profondeur 3D
      stageGroup.rotation.y += Math.sin(t * 1.1) * 0.002;
    }

    pointerKick += (0 - pointerKick) * 0.22;
    pointerGroup.rotation.z = pointerKick;

    for (let i = confetti.length - 1; i >= 0; i--) {
      const p = confetti[i];
      p.life -= dt;
      if (p.life <= 0) {
        scene.remove(p.mesh);
        p.mesh.material.dispose();
        confetti.splice(i, 1);
        continue;
      }
      p.vy -= 5.8 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += p.rx * dt;
      p.mesh.rotation.y += p.ry * dt;
    }

    renderer.render(scene, camera);
  });
}

/* ============================================================================
   SCÈNE 3 : GRAND FINALE (PIÈCES DORÉES, ÉTOILES & RUBANS 3D)
   ============================================================================ */
function initFinaleScene(canvas) {
  const renderer = createRenderer(canvas);
  if (!renderer) return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  createPlayfulLights(scene);

  const items = [];
  const colors = [0xff4da6, 0x00d084, 0x389bff, 0xffffff, 0xa55eea];

  for (let i = 0; i < 16; i++) {
    const isCoin = i % 2 === 0;
    const mesh = isCoin
      ? createCoinMesh(0xffffff, 0.65)
      : createStarMesh(colors[i % colors.length], 0.72);

    const x = (Math.random() - 0.5) * 14;
    const y = (Math.random() - 0.5) * 6;
    const z = -1.5 - Math.random() * 2.5;
    mesh.position.set(x, y, z);
    scene.add(mesh);

    items.push({
      mesh,
      baseY: y,
      phase: Math.random() * Math.PI * 2,
      speedY: 0.7 + Math.random() * 0.8,
      rotSpeed: (Math.random() - 0.5) * 1.4,
    });
  }

  const resize = () => {
    const parent = canvas.parentElement;
    const w = parent ? parent.clientWidth : 900;
    const h = parent ? parent.clientHeight : 340;
    if (w <= 0 || h <= 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  resize();
  const ro = new ResizeObserver(resize);
  if (canvas.parentElement) ro.observe(canvas.parentElement);

  createVisibilityController(canvas, (t) => {
    for (const item of items) {
      item.mesh.position.y =
        item.baseY + Math.sin(t * item.speedY + item.phase) * 0.35;
      item.mesh.rotation.y += 0.014 * item.rotSpeed;
      item.mesh.rotation.x += 0.008 * item.rotSpeed;
    }
    renderer.render(scene, camera);
  });
}

function boot() {
  const canvases = document.querySelectorAll("canvas[data-three-scene]");
  canvases.forEach((canvas) => {
    const kind = canvas.dataset.threeScene;
    if (kind === "hero") initHeroScene(canvas);
    else if (kind === "wheel") initWheelScene(canvas);
    else if (kind === "finale") initFinaleScene(canvas);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

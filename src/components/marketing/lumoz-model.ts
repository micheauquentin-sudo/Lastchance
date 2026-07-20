import * as THREE from "three";

/**
 * Lumoz — mascotte 3D de Lastchance, modelée en primitives Three.js
 * (style toon + contours encre, même langage graphique que le site).
 *
 * Module volontairement sans React : la classe pilote son propre canvas
 * et expose une petite API d'animations (coucou, saut, surprise,
 * parole). Chargée dynamiquement par LumozGuide pour ne rien coûter au
 * chargement initial de la landing.
 */

const C = {
  fur: 0xe89b3f,
  cream: 0xfaf3e3,
  ink: 0x211d16,
  white: 0xffffff,
  gold: 0xd9a63f,
  brown: 0x3a2418,
  pink: 0xf2c9a8,
  tongue: 0xe8607f,
};

export type LumozExpression = "happy" | "surprised";

export class LumozModel {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private root = new THREE.Group();
  private head = new THREE.Group();
  private rightArm = new THREE.Group();
  private eyes: THREE.Mesh[] = [];
  private smile!: THREE.Mesh;
  private tongue!: THREE.Mesh;
  private mouthO!: THREE.Mesh;
  private brows: THREE.Mesh[] = [];

  private raf = 0;
  private last = 0;
  private start = performance.now();
  private waveStart = 0;
  private waveUntil = 0;
  private hopStart = 0;
  private hopUntil = 0;
  private talking = false;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));

    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 30);
    this.camera.position.set(0, 1.25, 5.6);
    this.camera.lookAt(0, 1.16, 0);

    this.scene.add(new THREE.AmbientLight(0xfff4e0, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(2.5, 4, 3);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffe9c4, 0.45);
    fill.position.set(-3, 2, -2);
    this.scene.add(fill);

    this.build();
    this.scene.add(this.root);
    this.resize();

    document.addEventListener("visibilitychange", this.onVisibility);
    this.raf = requestAnimationFrame(this.tick);
  }

  /* ── Construction du personnage ─────────────────────────── */

  private build() {
    const grad = new Uint8Array([120, 200, 255]);
    const gradMap = new THREE.DataTexture(grad, 3, 1, THREE.RedFormat);
    gradMap.minFilter = gradMap.magFilter = THREE.NearestFilter;
    gradMap.needsUpdate = true;

    const toon = (color: number) =>
      new THREE.MeshToonMaterial({ color, gradientMap: gradMap });
    const M = {
      fur: toon(C.fur),
      cream: toon(C.cream),
      ink: toon(C.ink),
      white: toon(C.white),
      gold: toon(C.gold),
      brown: toon(C.brown),
      pink: toon(C.pink),
      tongue: toon(C.tongue),
      basicInk: new THREE.MeshBasicMaterial({ color: C.ink }),
      eyeWhite: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      outline: new THREE.MeshBasicMaterial({ color: C.ink, side: THREE.BackSide }),
    };

    const add = (
      parent: THREE.Object3D,
      geo: THREE.BufferGeometry,
      material: THREE.Material,
      opts: {
        p?: [number, number, number];
        r?: [number, number, number];
        s?: [number, number, number];
        outline?: number;
      } = {},
    ): THREE.Mesh => {
      const { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], outline = 0.035 } = opts;
      const m = new THREE.Mesh(geo, material);
      m.position.set(...p);
      m.rotation.set(...r);
      m.scale.set(...s);
      parent.add(m);
      if (outline > 0) {
        const o = new THREE.Mesh(geo, M.outline);
        o.position.copy(m.position);
        o.rotation.copy(m.rotation);
        const box = new THREE.Box3().setFromObject(m);
        const size = box.getSize(new THREE.Vector3()).length() || 1;
        o.scale.copy(m.scale).multiplyScalar(1 + (outline * 2) / size);
        parent.add(o);
      }
      return m;
    };

    const root = this.root;

    /* Chaussures / jambes / bassin */
    for (const side of [-1, 1]) {
      add(root, new THREE.SphereGeometry(0.185, 24, 16), M.white, {
        p: [side * 0.18, 0.12, 0.06], s: [1.02, 0.62, 1.6],
      });
      add(root, new THREE.CylinderGeometry(0.14, 0.135, 0.34, 20), M.ink, {
        p: [side * 0.18, 0.38, 0],
      });
      add(root, new THREE.CylinderGeometry(0.155, 0.155, 0.08, 20), M.ink, {
        p: [side * 0.18, 0.235, 0],
      });
    }
    add(root, new THREE.CylinderGeometry(0.36, 0.33, 0.2, 24), M.ink, { p: [0, 0.6, 0] });
    add(root, new THREE.CylinderGeometry(0.375, 0.375, 0.07, 24), M.ink, { p: [0, 0.72, 0] });
    add(root, new THREE.BoxGeometry(0.11, 0.08, 0.045), M.gold, {
      p: [0, 0.72, 0.355], outline: 0.02,
    });

    /* Torse chemise + encolure + boutons */
    add(root, new THREE.CylinderGeometry(0.3, 0.37, 0.56, 24), M.white, { p: [0, 1.03, 0] });
    add(root, new THREE.SphereGeometry(0.1, 18, 12), M.fur, {
      p: [0, 1.29, 0.265], s: [0.9, 0.55, 0.4], outline: 0.018,
    });
    add(root, new THREE.SphereGeometry(0.018, 10, 8), M.ink, { p: [0, 1.05, 0.345], outline: 0 });
    add(root, new THREE.SphereGeometry(0.018, 10, 8), M.ink, { p: [0, 0.9, 0.36], outline: 0 });

    /* Bras gauche (le long du corps) */
    {
      const g = new THREE.Group();
      g.position.set(0.32, 1.16, 0);
      g.rotation.z = 0.3;
      root.add(g);
      add(g, new THREE.SphereGeometry(0.095, 16, 12), M.white);
      add(g, new THREE.CylinderGeometry(0.092, 0.08, 0.34, 16), M.white, { p: [0, -0.19, 0] });
      add(g, new THREE.CylinderGeometry(0.095, 0.095, 0.055, 16), M.white, { p: [0, -0.375, 0] });
      add(g, new THREE.SphereGeometry(0.105, 18, 14), M.fur, { p: [0, -0.46, 0] });
    }
    /* Bras droit (pouce levé) — groupe animable pour le coucou */
    {
      const g = this.rightArm;
      g.position.set(-0.33, 1.16, 0);
      root.add(g);
      add(g, new THREE.SphereGeometry(0.095, 16, 12), M.white);
      add(g, new THREE.CylinderGeometry(0.092, 0.082, 0.24, 16), M.white, {
        p: [-0.12, -0.06, 0.02], r: [0, 0, 1.25],
      });
      add(g, new THREE.CylinderGeometry(0.08, 0.086, 0.22, 16), M.white, {
        p: [-0.26, 0.02, 0.04], r: [0, 0, 0.3],
      });
      add(g, new THREE.CylinderGeometry(0.085, 0.085, 0.055, 16), M.white, {
        p: [-0.288, 0.12, 0.04], r: [0, 0, 0.3],
      });
      add(g, new THREE.SphereGeometry(0.115, 18, 14), M.fur, { p: [-0.3, 0.21, 0.04] });
      add(g, new THREE.CylinderGeometry(0.04, 0.045, 0.09, 12), M.fur, {
        p: [-0.305, 0.315, 0.04],
      });
      add(g, new THREE.SphereGeometry(0.045, 12, 10), M.fur, { p: [-0.305, 0.365, 0.04] });
    }

    /* Queue enroulée (boucle pleine) */
    {
      const g = new THREE.Group();
      g.position.set(0, 0.87, -0.43);
      g.rotation.set(0.08, 0, -0.12);
      root.add(g);
      add(g, new THREE.TorusGeometry(0.15, 0.085, 14, 28), M.fur, { r: [0, Math.PI / 2, 0] });
      add(g, new THREE.SphereGeometry(0.085, 14, 12), M.cream, {
        p: [0, 0.15, -0.07], outline: 0.02,
      });
    }

    /* Tête */
    const head = this.head;
    head.position.set(0, 1.8, 0);
    root.add(head);

    add(head, new THREE.SphereGeometry(0.52, 36, 28), M.fur, { s: [1.12, 1, 1], outline: 0.04 });
    add(head, new THREE.SphereGeometry(0.3, 28, 20), M.cream, {
      p: [0, -0.14, 0.33], s: [1.3, 0.78, 0.72],
    });
    add(head, new THREE.SphereGeometry(0.088, 18, 14), M.ink, {
      p: [0, -0.02, 0.585], s: [1.25, 0.8, 0.75], outline: 0,
    });

    /* Bouche : sourire (défaut) + bouche « O » (surprise) */
    this.smile = new THREE.Mesh(
      new THREE.TorusGeometry(0.105, 0.017, 8, 24, 2.1),
      M.basicInk,
    );
    this.smile.position.set(0, -0.175, 0.545);
    this.smile.rotation.z = Math.PI + (Math.PI - 2.1) / 2;
    head.add(this.smile);
    this.tongue = add(head, new THREE.SphereGeometry(0.055, 14, 10), M.tongue, {
      p: [0, -0.255, 0.5], s: [1.1, 0.6, 0.5], outline: 0.015,
    });
    this.mouthO = add(head, new THREE.SphereGeometry(0.055, 14, 12), M.ink, {
      p: [0, -0.21, 0.52], s: [1, 1.25, 0.45], outline: 0,
    });
    this.mouthO.visible = false;

    /* Yeux + reflets */
    for (const side of [-1, 1]) {
      const eye = add(head, new THREE.SphereGeometry(0.095, 18, 14), M.brown, {
        p: [side * 0.2, 0.05, 0.435], outline: 0.02,
      });
      this.eyes.push(eye);
      const hi = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), M.eyeWhite);
      hi.position.set(side * 0.175, 0.085, 0.498);
      eye.userData.hi = hi;
      head.add(hi);
      const hi2 = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), M.eyeWhite);
      hi2.position.set(side * 0.215, 0.02, 0.502);
      head.add(hi2);
    }

    /* Sourcils */
    for (const side of [-1, 1]) {
      const b = add(head, new THREE.SphereGeometry(0.065, 14, 10), M.cream, {
        p: [side * 0.2, 0.26, 0.42], s: [1.15, 0.7, 0.5], outline: 0.015,
      });
      this.brows.push(b);
    }

    /* Oreilles */
    for (const side of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(side * 0.3, 0.47, 0);
      g.rotation.set(-0.1, 0, side * -0.24);
      head.add(g);
      add(g, new THREE.ConeGeometry(0.19, 0.38, 20), M.fur);
      add(g, new THREE.ConeGeometry(0.115, 0.26, 20), M.pink, {
        p: [0, -0.02, 0.08], r: [0.16, 0, 0], outline: 0,
      });
    }

    /* Ombre de contact douce */
    {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 128;
      const ctx = cv.getContext("2d")!;
      const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
      g.addColorStop(0, "rgba(33,29,22,0.20)");
      g.addColorStop(1, "rgba(33,29,22,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(cv);
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.62, 32),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.004;
      shadow.scale.x = 1.2;
      this.root.add(shadow);
    }
  }

  /* ── API d'animations ───────────────────────────────────── */

  /** Coucou de la patte (pouce levé qui se balance). */
  wave(durationMs = 1900) {
    this.waveStart = performance.now();
    this.waveUntil = this.waveStart + durationMs;
  }

  /** Pirouette de saut (pendant le déplacement de bloc en bloc). */
  hop(durationMs = 650) {
    this.hopStart = performance.now();
    this.hopUntil = this.hopStart + durationMs;
  }

  setExpression(e: LumozExpression) {
    const surprised = e === "surprised";
    this.smile.visible = !surprised;
    this.tongue.visible = !surprised;
    this.mouthO.visible = surprised;
    for (const eye of this.eyes) {
      eye.scale.setScalar(surprised ? 1.32 : 1);
      const hi = eye.userData.hi as THREE.Mesh;
      hi.scale.setScalar(surprised ? 1.32 : 1);
    }
    for (const b of this.brows) b.position.y = surprised ? 0.31 : 0.26;
  }

  setTalking(t: boolean) {
    this.talking = t;
  }

  /* ── Boucle de rendu (~30 fps, en pause si onglet caché) ── */

  private onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(this.raf);
    } else if (!this.disposed) {
      this.last = 0;
      this.raf = requestAnimationFrame(this.tick);
    }
  };

  private tick = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    if (now - this.last < 33) return; // ~30 fps suffisent pour une mascotte
    this.last = now;

    const t = (now - this.start) / 1000;

    /* Respiration + balancement doux */
    this.root.position.y = Math.sin(t * 1.7) * 0.025;
    this.head.rotation.z = Math.sin(t * 0.9) * 0.03;
    this.head.rotation.x = this.talking ? Math.sin(t * 14) * 0.045 : 0;

    /* Coucou */
    if (now < this.waveUntil) {
      const e = (now - this.waveStart) / 1000;
      this.rightArm.rotation.z = Math.sin(e * 9) * 0.45;
    } else {
      this.rightArm.rotation.z *= 0.85;
    }

    /* Pirouette de saut */
    if (now < this.hopUntil) {
      const p = (now - this.hopStart) / (this.hopUntil - this.hopStart);
      const arc = Math.sin(p * Math.PI);
      this.root.rotation.y = p * Math.PI * 2;
      this.root.scale.set(1 + arc * 0.08, 1 - arc * 0.14, 1 + arc * 0.08);
    } else if (this.root.rotation.y !== 0) {
      this.root.rotation.y = 0;
      this.root.scale.set(1, 1, 1);
    }

    this.renderer.render(this.scene, this.camera);
  };

  resize() {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || 150;
    const h = canvas.clientHeight || 190;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) m.dispose();
      }
    });
    this.renderer.dispose();
  }
}

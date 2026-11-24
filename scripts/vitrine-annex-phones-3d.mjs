import {
  CanvasTexture,
  DirectionalLight,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NoToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/* ==========================================================================
   RENDU OLED ULTRA-NET (1024×2048, ZÉRO VOILE BLANC) — STATUT IOS MODERNE
   ========================================================================== */
function drawPhoneStatusBar(ctx, w, darkText = false) {
  ctx.fillStyle = darkText ? "#161317" : "#ffffff";
  ctx.font = "800 34px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("9:41", 68, 72);

  // Dynamic Island centrée
  ctx.fillStyle = "#09080d";
  ctx.beginPath();
  ctx.roundRect(w / 2 - 126, 44, 252, 58, 29);
  ctx.fill();
  // Micro lentille discrète
  ctx.fillStyle = "#1f2937";
  ctx.beginPath();
  ctx.arc(w / 2 + 78, 73, 13, 0, Math.PI * 2);
  ctx.fill();

  // Batterie moderne à droite
  const bx = w - 134;
  const by = 56;
  ctx.strokeStyle = darkText ? "#161317" : "#ffffff";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(bx, by, 68, 32, 9);
  ctx.stroke();
  ctx.fillStyle = darkText ? "#161317" : "#34d399";
  ctx.beginPath();
  ctx.roundRect(bx + 7, by + 7, 48, 18, 4);
  ctx.fill();
}

/* ==========================================================================
   ÉCRAN OLED 1 : PAGE FIDÉLITÉ (PASSEPORT / JACKPOT / PARRAINAGE)
   ========================================================================== */
function drawFidelitePhoneScreen(canvas, mode) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.save();
  // Masque aux coins arrondis épousant parfaitement l'écran du smartphone
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 118);
  ctx.clip();

  // Fond moderne crème chaud très propre
  ctx.fillStyle = "#fdf9f1";
  ctx.fillRect(0, 0, w, h);

  // En-tête dégradé sombre ultra-lisible
  const hdrH = 290;
  const hdrGrad = ctx.createLinearGradient(0, 0, w, hdrH);
  if (mode === "parrainage") {
    hdrGrad.addColorStop(0, "#0b2e26");
    hdrGrad.addColorStop(1, "#0f5143");
  } else if (mode === "jackpot") {
    hdrGrad.addColorStop(0, "#26113a");
    hdrGrad.addColorStop(1, "#581c6b");
  } else {
    hdrGrad.addColorStop(0, "#171130");
    hdrGrad.addColorStop(1, "#321f66");
  }
  ctx.fillStyle = hdrGrad;
  ctx.fillRect(0, 0, w, hdrH);

  drawPhoneStatusBar(ctx, w, false);

  // Nom de l'établissement + badge membre
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 48px system-ui, -apple-system, sans-serif";
  ctx.fillText("Bistrot L'Étoile", 64, 184);

  ctx.fillStyle = "#ffd93d";
  ctx.beginPath();
  ctx.roundRect(w - 294, 152, 232, 62, 31);
  ctx.fill();
  ctx.fillStyle = "#161317";
  ctx.font = "900 28px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("★ MEMBRE OR", w - 178, 184);

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = "700 29px system-ui, -apple-system, sans-serif";
  ctx.fillText("Votre espace fidélité · Sans appli", 64, 240);

  if (mode === "jackpot") {
    // ── MODE JACKPOT COLLECTIF ──
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(56, 336, w - 112, 760, 52);
    ctx.fill();
    ctx.strokeStyle = "#161317";
    ctx.lineWidth = 9;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#ff5c93";
    ctx.beginPath();
    ctx.roundRect(w / 2 - 220, 382, 440, 62, 31);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 28px system-ui, -apple-system, sans-serif";
    ctx.fillText("CAGNOTTE COLLECTIVE", w / 2, 414);

    // Grande jauge circulaire 86 %
    const cx = w / 2;
    const cy = 678;
    const r = 178;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "#ede9fe";
    ctx.lineWidth = 38;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.86);
    ctx.strokeStyle = "#ffd93d";
    ctx.lineCap = "round";
    ctx.lineWidth = 38;
    ctx.stroke();

    ctx.fillStyle = "#161317";
    ctx.font = "900 104px system-ui, -apple-system, sans-serif";
    ctx.fillText("86%", cx, cy - 12);
    ctx.fillStyle = "#5b4f69";
    ctx.font = "800 32px system-ui, -apple-system, sans-serif";
    ctx.fillText("86 / 100 PASSAGES", cx, cy + 62);

    ctx.fillStyle = "#161317";
    ctx.font = "900 40px system-ui, -apple-system, sans-serif";
    ctx.fillText("Dîner VIP pour 2 à gagner !", w / 2, 954);
    ctx.fillStyle = "#047857";
    ctx.font = "800 30px system-ui, -apple-system, sans-serif";
    ctx.fillText("Tirage automatique dès 100 %", w / 2, 1018);

    // Carte participation active
    ctx.fillStyle = "#fef3c7";
    ctx.beginPath();
    ctx.roundRect(56, 1144, w - 112, 220, 44);
    ctx.fill();
    ctx.strokeStyle = "#161317";
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.fillStyle = "#161317";
    ctx.font = "900 38px system-ui, -apple-system, sans-serif";
    ctx.fillText("Votre ticket est dans l'urne ✓", w / 2, 1230);
    ctx.fillStyle = "#5c4a1d";
    ctx.font = "700 30px system-ui, -apple-system, sans-serif";
    ctx.fillText("+1 chance à chaque visite validée", w / 2, 1298);
  } else if (mode === "parrainage") {
    // ── MODE PARRAINAGE ──
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(56, 336, w - 112, 540, 52);
    ctx.fill();
    ctx.strokeStyle = "#161317";
    ctx.lineWidth = 9;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#047857";
    ctx.beginPath();
    ctx.roundRect(w / 2 - 220, 382, 440, 62, 31);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 28px system-ui, -apple-system, sans-serif";
    ctx.fillText("DOUBLE RÉCOMPENSE", w / 2, 414);

    ctx.fillStyle = "#161317";
    ctx.font = "900 54px system-ui, -apple-system, sans-serif";
    ctx.fillText("Invitez vos proches", w / 2, 514);

    // Deux blocs récompenses côte à côte
    const drawRewardPill = (x, label, value, bg) => {
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect(x, 586, 404, 224, 36);
      ctx.fill();
      ctx.strokeStyle = "#161317";
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.fillStyle = "#161317";
      ctx.font = "800 28px system-ui, -apple-system, sans-serif";
      ctx.fillText(label, x + 202, 650);
      ctx.font = "900 56px system-ui, -apple-system, sans-serif";
      ctx.fillText(value, x + 202, 738);
    };
    drawRewardPill(96, "POUR VOTRE AMI", "-10 %", "#ffd93d");
    drawRewardPill(524, "POUR VOUS", "+200 pts", "#a7f3d0");

    // Carte suivi parrainages
    ctx.fillStyle = "#ecfdf5";
    ctx.beginPath();
    ctx.roundRect(56, 926, w - 112, 270, 44);
    ctx.fill();
    ctx.strokeStyle = "#047857";
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.fillStyle = "#064e3b";
    ctx.font = "900 42px system-ui, -apple-system, sans-serif";
    ctx.fillText("✓ 3 amis déjà parrainés", w / 2, 1024);
    ctx.fillStyle = "#047857";
    ctx.font = "800 32px system-ui, -apple-system, sans-serif";
    ctx.fillText("+600 points offerts sur votre carte", w / 2, 1102);

    // Bouton partage
    ctx.fillStyle = "#ffd93d";
    ctx.beginPath();
    ctx.roundRect(56, 1244, w - 112, 124, 62);
    ctx.fill();
    ctx.strokeStyle = "#161317";
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.fillStyle = "#161317";
    ctx.font = "900 36px system-ui, -apple-system, sans-serif";
    ctx.fillText("Partager mon lien · SMS / WhatsApp", w / 2, 1308);
  } else {
    // ── MODE PASSEPORT FIDÉLITÉ (DÉFAUT) ──
    // Carte Passeport digitale principale
    const cardGrad = ctx.createLinearGradient(56, 330, w - 56, 1040);
    cardGrad.addColorStop(0, "#1c1440");
    cardGrad.addColorStop(1, "#432280");
    ctx.fillStyle = cardGrad;
    ctx.beginPath();
    ctx.roundRect(56, 330, w - 112, 706, 52);
    ctx.fill();
    ctx.strokeStyle = "#161317";
    ctx.lineWidth = 10;
    ctx.stroke();

    // Filet or subtil à l'intérieur de la carte
    ctx.strokeStyle = "rgba(255, 217, 61, 0.55)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(80, 354, w - 160, 658, 36);
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.fillStyle = "#ffd93d";
    ctx.font = "900 30px system-ui, -apple-system, sans-serif";
    ctx.fillText("PASSEPORT FIDÉLITÉ", 116, 424);

    // Score points bien lisible
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 104px system-ui, -apple-system, sans-serif";
    ctx.fillText("420", 116, 536);
    ctx.fillStyle = "#ffd93d";
    ctx.font = "900 44px system-ui, -apple-system, sans-serif";
    ctx.fillText("PTS", 330, 548);

    // Pill progression à droite
    ctx.fillStyle = "#10b981";
    ctx.beginPath();
    ctx.roundRect(w - 344, 488, 228, 72, 36);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 32px system-ui, -apple-system, sans-serif";
    ctx.fillText("4 / 5 VISITES", w - 230, 526);

    // Rangée de 5 tampons modernes (4 validés dorés + 5e cadeau rose pop)
    const sy = 710;
    const sx0 = 186;
    const stepX = 163;
    for (let i = 0; i < 5; i++) {
      const cx = sx0 + i * stepX;
      const isGift = i === 4;
      ctx.beginPath();
      ctx.arc(cx, sy, 62, 0, Math.PI * 2);
      ctx.fillStyle = isGift ? "#ff5c93" : "#ffd93d";
      ctx.fill();
      ctx.lineWidth = 7;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();

      if (isGift) {
        // Icône cadeau vectorielle
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.roundRect(cx - 24, sy - 10, 48, 36, 8);
        ctx.fill();
        ctx.fillStyle = "#ffd93d";
        ctx.fillRect(cx - 7, sy - 10, 14, 36);
        ctx.fillRect(cx - 24, sy + 4, 48, 10);
      } else {
        // Coche nette vectorielle
        ctx.strokeStyle = "#161317";
        ctx.lineWidth = 12;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(cx - 22, sy + 2);
        ctx.lineTo(cx - 5, sy + 19);
        ctx.lineTo(cx + 24, sy - 16);
        ctx.stroke();
      }
    }

    // Barre de progression lumineuse
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.roundRect(116, 838, w - 232, 34, 17);
    ctx.fill();
    ctx.fillStyle = "#ffd93d";
    ctx.beginPath();
    ctx.roundRect(116, 838, (w - 232) * 0.82, 34, 17);
    ctx.fill();

    ctx.textAlign = "center";
    ctx.fillStyle = "#fff8dc";
    ctx.font = "800 32px system-ui, -apple-system, sans-serif";
    ctx.fillText("Plus qu'1 visite avant votre dessert offert !", w / 2, 944);

    // 2 cartes récompenses modernes en dessous
    const drawMiniCard = (y, title, sub, badge, badgeBg, badgeFg) => {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(56, y, w - 112, 162, 36);
      ctx.fill();
      ctx.strokeStyle = "#161317";
      ctx.lineWidth = 7;
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.fillStyle = "#161317";
      ctx.font = "900 38px system-ui, -apple-system, sans-serif";
      ctx.fillText(title, 106, y + 66);
      ctx.fillStyle = "#5c5247";
      ctx.font = "700 28px system-ui, -apple-system, sans-serif";
      ctx.fillText(sub, 106, y + 116);

      ctx.fillStyle = badgeBg;
      ctx.beginPath();
      ctx.roundRect(w - 306, y + 48, 206, 66, 33);
      ctx.fill();
      ctx.textAlign = "center";
      ctx.fillStyle = badgeFg;
      ctx.font = "900 28px system-ui, -apple-system, sans-serif";
      ctx.fillText(badge, w - 203, y + 83);
    };

    drawMiniCard(1082, "Dessert Maison Offert", "Débloqué au 5e tampon", "500 PTS", "#ffd93d", "#161317");
    drawMiniCard(1278, "Parrainer un ami", "Double bonus immédiat", "+200 PTS", "#10b981", "#ffffff");
  }

  // Bouton bas moderne Wallet (toujours visible & rassurant)
  ctx.fillStyle = "#161317";
  ctx.beginPath();
  ctx.roundRect(56, h - 220, w - 112, 122, 61);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd93d";
  ctx.font = "900 32px system-ui, -apple-system, sans-serif";
  ctx.fillText("+ Écran d'accueil & Google Wallet", w / 2, h - 158);

  // Barre d'accueil iOS
  ctx.fillStyle = "#161317";
  ctx.beginPath();
  ctx.roundRect(w / 2 - 170, h - 42, 340, 14, 7);
  ctx.fill();

  ctx.restore();
}

/* ==========================================================================
   ÉCRAN OLED 2 : PAGE VITRINE & RÉSERVATION (CARTE / RDV / MOMENTS VIP)
   ========================================================================== */
function drawVitrinePhoneScreen(canvas, mode) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 118);
  ctx.clip();

  ctx.fillStyle = "#fdf9f1";
  ctx.fillRect(0, 0, w, h);

  // Bannière moderne de l'établissement en tête
  const hdrH = 340;
  const hdrGrad = ctx.createLinearGradient(0, 0, w, hdrH);
  hdrGrad.addColorStop(0, "#1d1522");
  hdrGrad.addColorStop(1, "#3d2236");
  ctx.fillStyle = hdrGrad;
  ctx.fillRect(0, 0, w, hdrH);

  drawPhoneStatusBar(ctx, w, false);

  // Pastille verte 0 % COMMISSION bien visible
  ctx.fillStyle = "#10b981";
  ctx.beginPath();
  ctx.roundRect(64, 134, 320, 56, 28);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 26px system-ui, -apple-system, sans-serif";
  ctx.fillText("✓ 0 % DE COMMISSION", 224, 163);

  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 54px system-ui, -apple-system, sans-serif";
  ctx.fillText("Bistrot L'Étoile", 64, 242);

  ctx.fillStyle = "#ffd93d";
  ctx.font = "800 30px system-ui, -apple-system, sans-serif";
  ctx.fillText("★ 4,9  ·  Ouvert jusqu'à 22h30", 64, 298);

  if (mode === "rdv") {
    // ── MODE RENDEZ-VOUS DIRECT ──
    ctx.textAlign = "left";
    ctx.fillStyle = "#161317";
    ctx.font = "900 44px system-ui, -apple-system, sans-serif";
    ctx.fillText("Choisir un créneau", 64, 428);

    // Sélecteur de jours
    const days = [
      { d: "VEN", n: "13", act: false },
      { d: "SAM", n: "14", act: true },
      { d: "DIM", n: "15", act: false },
      { d: "LUN", n: "16", act: false },
    ];
    days.forEach((item, idx) => {
      const dx = 64 + idx * 232;
      ctx.fillStyle = item.act ? "#161317" : "#ffffff";
      ctx.beginPath();
      ctx.roundRect(dx, 476, 200, 172, 34);
      ctx.fill();
      ctx.strokeStyle = "#161317";
      ctx.lineWidth = 7;
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.fillStyle = item.act ? "#ffd93d" : "#6b5e4c";
      ctx.font = "900 28px system-ui, -apple-system, sans-serif";
      ctx.fillText(item.d, dx + 100, 532);
      ctx.fillStyle = item.act ? "#ffffff" : "#161317";
      ctx.font = "900 58px system-ui, -apple-system, sans-serif";
      ctx.fillText(item.n, dx + 100, 598);
    });

    // Grille d'horaires
    ctx.textAlign = "left";
    ctx.fillStyle = "#161317";
    ctx.font = "900 36px system-ui, -apple-system, sans-serif";
    ctx.fillText("Créneaux disponibles · 2 pers.", 64, 730);

    const slots = ["12h00", "12h30", "19h00", "19h30", "20h00", "20h30"];
    slots.forEach((slot, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const sx = 64 + col * 308;
      const sy = 776 + row * 144;
      const selected = slot === "19h30";
      ctx.fillStyle = selected ? "#047857" : "#ffffff";
      ctx.beginPath();
      ctx.roundRect(sx, sy, 276, 112, 32);
      ctx.fill();
      ctx.strokeStyle = selected ? "#047857" : "#161317";
      ctx.lineWidth = 7;
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.fillStyle = selected ? "#ffffff" : "#161317";
      ctx.font = "900 38px system-ui, -apple-system, sans-serif";
      ctx.fillText(selected ? `${slot} ✓` : slot, sx + 138, sy + 58);
    });

    // Encart récapitulatif vert
    ctx.fillStyle = "#ecfdf5";
    ctx.beginPath();
    ctx.roundRect(64, 1110, w - 128, 230, 40);
    ctx.fill();
    ctx.strokeStyle = "#047857";
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = "#064e3b";
    ctx.font = "900 40px system-ui, -apple-system, sans-serif";
    ctx.fillText("Sam. 14 · 19h30 · 2 personnes", w / 2, 1196);
    ctx.fillStyle = "#047857";
    ctx.font = "800 30px system-ui, -apple-system, sans-serif";
    ctx.fillText("Ajout Apple / Google Agenda inclus", w / 2, 1272);

    // CTA bas vert émeraude
    ctx.fillStyle = "#047857";
    ctx.beginPath();
    ctx.roundRect(56, h - 224, w - 112, 128, 64);
    ctx.fill();
    ctx.strokeStyle = "#161317";
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 38px system-ui, -apple-system, sans-serif";
    ctx.fillText("✓ Confirmer en 1 clic", w / 2, h - 158);
  } else if (mode === "moments") {
    // ── MODE MOMENTS VIP & OFFRES FLASH ──
    ctx.textAlign = "left";
    ctx.fillStyle = "#161317";
    ctx.font = "900 44px system-ui, -apple-system, sans-serif";
    ctx.fillText("Temps forts & offres", 64, 428);

    const events = [
      {
        tag: "JEUDI 19H · 4 PLACES",
        tagBg: "#ff5c93",
        title: "Soirée Dégustation",
        desc: "Accord mets & vins de vignerons",
        price: "25 €",
      },
      {
        tag: "AUJOURD'HUI 18H30",
        tagBg: "#047857",
        title: "Panier Anti-Gaspi",
        desc: "Sélection du jour à emporter",
        price: "-40%",
      },
      {
        tag: "SAMEDI 10H",
        tagBg: "#7c3aed",
        title: "Atelier Pâtisserie",
        desc: "Avec notre chef · Café inclus",
        price: "35 €",
      },
    ];

    events.forEach((ev, idx) => {
      const ey = 482 + idx * 308;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(56, ey, w - 112, 266, 42);
      ctx.fill();
      ctx.strokeStyle = "#161317";
      ctx.lineWidth = 8;
      ctx.stroke();

      ctx.fillStyle = ev.tagBg;
      ctx.beginPath();
      ctx.roundRect(96, ey + 36, 390, 52, 26);
      ctx.fill();
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 25px system-ui, -apple-system, sans-serif";
      ctx.fillText(ev.tag, 291, ey + 63);

      ctx.textAlign = "left";
      ctx.fillStyle = "#161317";
      ctx.font = "900 44px system-ui, -apple-system, sans-serif";
      ctx.fillText(ev.title, 96, ey + 144);
      ctx.fillStyle = "#5c5247";
      ctx.font = "700 30px system-ui, -apple-system, sans-serif";
      ctx.fillText(ev.desc, 96, ey + 206);

      ctx.fillStyle = "#ffd93d";
      ctx.beginPath();
      ctx.roundRect(w - 270, ey + 114, 176, 86, 43);
      ctx.fill();
      ctx.strokeStyle = "#161317";
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillStyle = "#161317";
      ctx.font = "900 40px system-ui, -apple-system, sans-serif";
      ctx.fillText(ev.price, w - 182, ey + 159);
    });

    ctx.fillStyle = "#ffd93d";
    ctx.beginPath();
    ctx.roundRect(56, h - 224, w - 112, 128, 64);
    ctx.fill();
    ctx.strokeStyle = "#161317";
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.fillStyle = "#161317";
    ctx.font = "900 38px system-ui, -apple-system, sans-serif";
    ctx.fillText("Réserver ma place VIP →", w / 2, h - 158);
  } else {
    // ── MODE VITRINE · CARTE & TARIFS (DÉFAUT) ──
    // Onglets catégories modernes
    const tabs = [
      { label: "La Carte", act: true },
      { label: "Desserts", act: false },
      { label: "Boissons", act: false },
    ];
    tabs.forEach((tab, idx) => {
      const tx = 64 + idx * 308;
      ctx.fillStyle = tab.act ? "#ffd93d" : "#ffffff";
      ctx.beginPath();
      ctx.roundRect(tx, 384, 282, 78, 39);
      ctx.fill();
      ctx.strokeStyle = "#161317";
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillStyle = "#161317";
      ctx.font = "900 32px system-ui, -apple-system, sans-serif";
      ctx.fillText(tab.label, tx + 141, 424);
    });

    // 3 fiches plats / prestations modernes bien lisibles
    const dishes = [
      { color: "#ff5c93", badge: "FAIT MAISON", title: "Menu du Marché", desc: "Entrée + Plat + Café", price: "19 €" },
      { color: "#ffd93d", badge: "BEST-SELLER", title: "Plat Signature", desc: "Produits frais de saison", price: "15 €" },
      { color: "#34d399", badge: "DU JOUR", title: "Tarte Pâtissière", desc: "Recette maison du matin", price: "8 €" },
    ];

    dishes.forEach((d, idx) => {
      const dy = 508 + idx * 294;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(56, dy, w - 112, 254, 42);
      ctx.fill();
      ctx.strokeStyle = "#161317";
      ctx.lineWidth = 8;
      ctx.stroke();

      // Pastille visuel couleur à gauche
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.roundRect(92, dy + 42, 166, 166, 36);
      ctx.fill();
      ctx.strokeStyle = "#161317";
      ctx.lineWidth = 6;
      ctx.stroke();

      // Motif assiette / cloche vectoriel propre dans la pastille
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(175, dy + 126, 48, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#161317";
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(175, dy + 126, 26, 0, Math.PI * 2);
      ctx.stroke();

      // Badge + Titre + Description
      ctx.fillStyle = "#161317";
      ctx.beginPath();
      ctx.roundRect(292, dy + 38, 224, 42, 21);
      ctx.fill();
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd93d";
      ctx.font = "900 22px system-ui, -apple-system, sans-serif";
      ctx.fillText(d.badge, 404, dy + 60);

      ctx.textAlign = "left";
      ctx.fillStyle = "#161317";
      ctx.font = "900 42px system-ui, -apple-system, sans-serif";
      ctx.fillText(d.title, 292, dy + 132);
      ctx.fillStyle = "#5c5247";
      ctx.font = "700 29px system-ui, -apple-system, sans-serif";
      ctx.fillText(d.desc, 292, dy + 188);

      // Prix jaune pop à droite
      ctx.fillStyle = "#ffd93d";
      ctx.beginPath();
      ctx.roundRect(w - 254, dy + 84, 162, 86, 43);
      ctx.fill();
      ctx.strokeStyle = "#161317";
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillStyle = "#161317";
      ctx.font = "900 40px system-ui, -apple-system, sans-serif";
      ctx.fillText(d.price, w - 173, dy + 129);
    });

    // Encart bas réservation directe 1 clic
    ctx.fillStyle = "#ffd93d";
    ctx.beginPath();
    ctx.roundRect(56, h - 224, w - 112, 128, 64);
    ctx.fill();
    ctx.strokeStyle = "#161317";
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = "#161317";
    ctx.font = "900 38px system-ui, -apple-system, sans-serif";
    ctx.fillText("Réserver une table · 0 % comm →", w / 2, h - 158);
  }

  // Barre d'accueil iOS
  ctx.fillStyle = "#161317";
  ctx.beginPath();
  ctx.roundRect(w / 2 - 170, h - 42, 340, 14, 7);
  ctx.fill();

  ctx.restore();
}

/* ==========================================================================
   MOTEUR PARTAGÉ : SMARTPHONE 3D MODERNE + MINI-CARTE QR FLOTTANTE
   ========================================================================== */
async function mountModernPhoneHero3D({
  btn,
  pageKind,
  defaultMode,
  defaultQrSrc,
  drawScreen,
  createHighContrastStudioEnv,
  createSoftShadowTexture,
  loadQrImage,
  buildCrispQrTexture,
}) {
  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const qrImgEl = document.getElementById("page-hero-qr-img") || btn.querySelector("img.qr-bleed-img");
  let activeMode = defaultMode;
  let activeQrImg = await loadQrImage(
    qrImgEl ? qrImgEl.getAttribute("src") || defaultQrSrc : defaultQrSrc,
  );

  const stageHost = document.createElement("span");
  stageHost.className = `hero-3d-stage hero-3d-stage--phone hero-3d-stage--${pageKind}`;
  stageHost.setAttribute("aria-hidden", "true");
  btn.appendChild(stageHost);

  let renderer;
  try {
    renderer = new WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
  } catch {
    stageHost.remove();
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  // NoToneMapping = zéro voile blanc, contraste OLED pur !
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(0x000000, 0);

  const canvas = renderer.domElement;
  canvas.className = "hero-3d-canvas";
  stageHost.appendChild(canvas);

  const scene = new Scene();
  const envRT = createHighContrastStudioEnv(renderer);
  scene.environment = envRT.texture;

  const camera = new PerspectiveCamera(30, 1, 0.1, 30);
  camera.position.set(0, 0.04, 8.95);

  scene.add(new HemisphereLight(0xfffaf0, 0x261d36, 0.72));
  const key = new DirectionalLight(0xfff5db, 1.45);
  key.position.set(-3.6, 4.8, 5.6);
  scene.add(key);
  const rim = new DirectionalLight(0xff7ec2, 0.9);
  rim.position.set(4.4, 2.2, -2.6);
  scene.add(rim);

  const obsidianMat = new MeshPhysicalMaterial({
    color: 0x14121a,
    roughness: 0.22,
    metalness: 0.28,
    clearcoat: 0.92,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.05,
  });
  const champagneGoldMat = new MeshPhysicalMaterial({
    color: 0xf2c14e,
    roughness: 0.18,
    metalness: 0.9,
    clearcoat: 0.55,
    envMapIntensity: 1.3,
  });

  const rootGroup = new Group();
  scene.add(rootGroup);

  /* ── 1. SMARTPHONE 3D MODERNE ── */
  const phoneGroup = new Group();
  phoneGroup.position.set(0.22, 0.06, 0);
  rootGroup.add(phoneGroup);

  const phoneBody = new Mesh(
    new RoundedBoxGeometry(2.18, 4.32, 0.22, 8, 0.28),
    obsidianMat,
  );
  phoneGroup.add(phoneBody);

  const phoneFrame = new Mesh(
    new RoundedBoxGeometry(2.24, 4.38, 0.16, 8, 0.30),
    champagneGoldMat,
  );
  phoneGroup.add(phoneFrame);

  // Boutons matériels fins sur les tranches
  const powerBtn = new Mesh(new RoundedBoxGeometry(0.05, 0.44, 0.06, 3, 0.02), champagneGoldMat);
  powerBtn.position.set(1.13, 0.62, 0);
  phoneGroup.add(powerBtn);

  [0.88, 0.38].forEach((vy) => {
    const volBtn = new Mesh(new RoundedBoxGeometry(0.05, 0.34, 0.06, 3, 0.02), champagneGoldMat);
    volBtn.position.set(-1.13, vy, 0);
    phoneGroup.add(volBtn);
  });

  // Écran OLED 2K ultra-net auto-illuminé (ZÉRO voile blanc !)
  const screenCanvas = document.createElement("canvas");
  screenCanvas.width = 1024;
  screenCanvas.height = 2048;
  drawScreen(screenCanvas, activeMode);
  const screenTex = new CanvasTexture(screenCanvas);
  screenTex.colorSpace = SRGBColorSpace;
  screenTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const screenMesh = new Mesh(
    new PlaneGeometry(2.00, 4.06),
    new MeshBasicMaterial({ map: screenTex, transparent: true }),
  );
  screenMesh.position.z = 0.114;
  phoneGroup.add(screenMesh);

  /* ── 2. MINI-CARTE QR 3D FLOTTANTE (BAS-GAUCHE DU TÉLÉPHONE) ── */
  const qrChipGroup = new Group();
  qrChipGroup.position.set(-1.14, -1.16, 0.48);
  qrChipGroup.rotation.y = 0.18;
  qrChipGroup.rotation.z = 0.05;
  rootGroup.add(qrChipGroup);

  const qrChipBack = new Mesh(
    new RoundedBoxGeometry(1.16, 1.16, 0.14, 6, 0.16),
    obsidianMat,
  );
  qrChipGroup.add(qrChipBack);

  const qrChipGoldRim = new Mesh(
    new RoundedBoxGeometry(1.20, 1.20, 0.09, 6, 0.18),
    champagneGoldMat,
  );
  qrChipGoldRim.position.z = -0.02;
  qrChipGroup.add(qrChipGoldRim);

  let qrTex = buildCrispQrTexture(activeQrImg, renderer.capabilities.getMaxAnisotropy());
  const qrChipFaceMat = new MeshBasicMaterial({ map: qrTex });
  const qrChipFace = new Mesh(new PlaneGeometry(0.98, 0.98), qrChipFaceMat);
  qrChipFace.position.z = 0.074;
  qrChipGroup.add(qrChipFace);

  // Ombre douce au sol
  const shadowMat = new MeshBasicMaterial({
    map: createSoftShadowTexture(0.34),
    transparent: true,
    opacity: 0.84,
    depthWrite: false,
  });
  const shadowPlane = new Mesh(new PlaneGeometry(3.2, 0.72), shadowMat);
  shadowPlane.position.set(0, -2.42, -0.1);
  scene.add(shadowPlane);

  // Synchronisation directe avec les 3 pilules sous le héro
  const parentUnit = btn.closest(".qr-floating-unit");
  if (parentUnit) {
    parentUnit.querySelectorAll(".qr-mode-btn").forEach((modeBtn) => {
      modeBtn.addEventListener("click", async () => {
        const nextMode = modeBtn.dataset.emulate || defaultMode;
        const nextSrc = modeBtn.dataset.qrSrc || defaultQrSrc;
        activeMode = nextMode;
        drawScreen(screenCanvas, activeMode);
        screenTex.needsUpdate = true;

        activeQrImg = await loadQrImage(nextSrc);
        const oldTex = qrTex;
        qrTex = buildCrispQrTexture(activeQrImg, renderer.capabilities.getMaxAnisotropy());
        qrChipFaceMat.map = qrTex;
        qrChipFaceMat.needsUpdate = true;
        oldTex.dispose();
      });
    });
  }

  const resize = () => {
    const rect = stageHost.getBoundingClientRect();
    const w = Math.max(280, Math.round(rect.width || 360));
    const h = Math.max(300, Math.round(rect.height || 380));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();

  const heroSection = btn.closest("section") || btn;
  let targetRotY = -0.22;
  let targetRotX = 0.05;
  let curRotY = -0.28;
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
      const nx = MathUtils.clamp((e.clientX - (rect.left + rect.width / 2)) / 400, -1, 1);
      const ny = MathUtils.clamp((e.clientY - (rect.top + rect.height / 2)) / 340, -1, 1);
      targetRotY = -0.1 + nx * 0.32;
      targetRotX = ny * 0.18;
    },
    { passive: true },
  );
  heroSection.addEventListener(
    "pointerleave",
    () => {
      targetRotY = -0.22;
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
    const idleYaw = reducedMotion ? 0 : Math.sin(t * 0.85) * 0.075;
    const idlePitch = reducedMotion ? 0 : Math.cos(t * 0.65) * 0.035;

    curRotY += (targetRotY + idleYaw - curRotY) * ease;
    curRotX += (targetRotX + idlePitch - curRotX) * ease;
    hoverAmt += ((isHovering ? 1 : 0) - hoverAmt) * (1 - Math.exp(-dt * 8));

    const springF = -145 * clickPop - 14 * clickVel;
    clickVel += springF * dt;
    clickPop += clickVel * dt;

    const floatY = reducedMotion ? 0 : Math.sin(t * 1.45) * 0.075;
    rootGroup.position.y = floatY + hoverAmt * 0.05;
    rootGroup.rotation.y = curRotY;
    rootGroup.rotation.x = curRotX;
    rootGroup.rotation.z = -curRotY * 0.06;

    // Parallaxe subtil sur la mini-carte QR flottante
    qrChipGroup.position.z = 0.48 + hoverAmt * 0.14;
    qrChipGroup.position.y = -1.16 + Math.sin(t * 1.9 + 0.8) * 0.045 * (reducedMotion ? 0 : 1);
    qrChipGroup.rotation.y = 0.18 - curRotY * 0.25;

    const baseScale = 1 + hoverAmt * 0.04;
    rootGroup.scale.set(
      baseScale * (1 - clickPop * 0.055),
      baseScale * (1 + clickPop * 0.075),
      baseScale,
    );

    const sScale = 1 - floatY * 0.4 - hoverAmt * 0.05;
    shadowPlane.scale.set(sScale, sScale, 1);
    shadowMat.opacity = 0.82 - floatY * 0.65;

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

export async function initAnnexPhoneHeroes3D(helpers) {
  const btn = document.getElementById("page-hero-qr-btn");
  if (!btn || btn.dataset.hero3dInit === "1") return;
  const emulate = (btn.dataset.emulate || "").toLowerCase();
  const pathname = window.location.pathname || "";

  if (emulate === "passeport" || pathname.includes("fidelite")) {
    btn.dataset.hero3dInit = "1";
    await mountModernPhoneHero3D({
      btn,
      pageKind: "fidelite",
      defaultMode: "passeport",
      defaultQrSrc: "img/qr-passeport.svg",
      drawScreen: drawFidelitePhoneScreen,
      ...helpers,
    });
  } else if (emulate === "vitrine" || pathname.includes("vitrine-reservation")) {
    btn.dataset.hero3dInit = "1";
    await mountModernPhoneHero3D({
      btn,
      pageKind: "vitrine",
      defaultMode: "vitrine",
      defaultQrSrc: "img/qr-vitrine.svg",
      drawScreen: drawVitrinePhoneScreen,
      ...helpers,
    });
  }
}

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8080;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split("?")[0]);
  let filePath = path.join(__dirname, reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  } else if (!fs.existsSync(filePath) && fs.existsSync(filePath + ".html")) {
    filePath = filePath + ".html";
  }

  // Fallback vers h-site-final-20k si le fichier n'est pas trouvé à la racine ou chemin legacy
  if (!fs.existsSync(filePath)) {
    const baseName = path.basename(filePath);
    const candidateH = path.join(__dirname, "h-site-final-20k", baseName);
    const candidateHHourly = path.join(__dirname, "h-site-final-20k", baseName + ".html");
    if (fs.existsSync(candidateH) && !fs.statSync(candidateH).isDirectory()) {
      filePath = candidateH;
    } else if (fs.existsSync(candidateHHourly)) {
      filePath = candidateHHourly;
    }
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h1>404 Not Found</h1><p>Page non trouvée. <a href='/'>Retour aux propositions</a></p>");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": mime });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Serveur de démo démarré sur http://localhost:${PORT}`);
});

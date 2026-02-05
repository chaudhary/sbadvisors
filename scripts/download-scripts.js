/**
 * Downloads all external scripts from htmlforscript.html, saves them to assets/js,
 * and writes an HTML file with script src replaced by local paths.
 *
 * Usage: node scripts/download-scripts.js
 * Input:  htmlforscript.html
 * Output: assets/js/*.js (downloaded files), index-with-local-scripts.html (optional)
 *         Set WRITE_HTML=1 to also write the HTML with replaced links.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";
import http from "http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const INPUT_HTML = path.join(ROOT, "htmlforscript.html");
const OUT_JS_DIR = path.join(ROOT, "assets", "js");
const OUTPUT_HTML = path.join(ROOT, "index-with-local-scripts.html");

// Skip downloading scripts from these domains (e.g. analytics that may block or change often)
const SKIP_DOMAINS = (process.env.SKIP_SCRIPT_DOMAINS || "googletagmanager.com").split(",").map((d) => d.trim().toLowerCase());

// Match <script src="https://..."> or <script src='https://...'> (capture full tag and URL)
const SCRIPT_SRC_REGEX = /<script([^>]*)\ssrc=["'](https?:\/\/[^"']+)["']([^>]*)>/gi;

function urlToSafeFilename(urlString) {
  const url = new URL(urlString);
  const pathname = url.pathname.replace(/^\//, "");
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return "script.js";
  const base = segments.join("-");
  return base.endsWith(".js") ? base : base + ".js";
}

function download(urlString) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const protocol = url.protocol === "https:" ? https : http;
    const req = protocol.get(
      urlString,
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; ScriptDownloader/1.0)" } },
      (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return download(res.headers.location).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          reject(new Error(`${urlString} => ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
  });
}

function extractScriptUrls(html) {
  const list = [];
  let m;
  SCRIPT_SRC_REGEX.lastIndex = 0;
  while ((m = SCRIPT_SRC_REGEX.exec(html)) !== null) {
    const fullTag = m[0];
    const beforeSrc = m[1];
    const url = m[2];
    const afterSrc = m[3];
    list.push({ fullTag, beforeSrc, url, afterSrc });
  }
  return list;
}

async function main() {
  if (!fs.existsSync(INPUT_HTML)) {
    console.error("Input file not found:", INPUT_HTML);
    process.exit(1);
  }

  if (!fs.existsSync(OUT_JS_DIR)) {
    fs.mkdirSync(OUT_JS_DIR, { recursive: true });
  }

  const html = fs.readFileSync(INPUT_HTML, "utf8");
  const scripts = extractScriptUrls(html);

  if (scripts.length === 0) {
    console.log("No external script URLs found.");
    return;
  }

  console.log("Found", scripts.length, "external script(s). Downloading...\n");

  const urlToLocal = new Map();
  let updatedHtml = html;

  for (const { fullTag, beforeSrc, url, afterSrc } of scripts) {
    const host = new URL(url).hostname.toLowerCase();
    if (SKIP_DOMAINS.some((d) => host === d || host.endsWith("." + d))) {
      console.log("  (skip)", url.split("?")[0], "- domain in SKIP_SCRIPT_DOMAINS");
      continue;
    }
    const filename = urlToSafeFilename(url);
    const localPath = path.join("assets", "js", filename);
    const outPath = path.join(ROOT, localPath);

    process.stdout.write(`  ${filename} ... `);
    try {
      const data = await download(url);
      fs.writeFileSync(outPath, data);
      const localHref = "/" + localPath.replace(/\\/g, "/");
      urlToLocal.set(url, localHref);
      const newTag = `<script${beforeSrc} src="${localHref}"${afterSrc}>`;
      updatedHtml = updatedHtml.replace(fullTag, newTag);
      console.log("OK");
    } catch (err) {
      console.log("FAIL:", err.message);
    }
  }

  fs.writeFileSync(OUTPUT_HTML, updatedHtml, "utf8");
  console.log("\nWrote HTML with local script links to:", path.relative(ROOT, OUTPUT_HTML));
  console.log("  Use this file as your page, or copy its content to index.html.");

  console.log("\nDone. Local paths used:");
  urlToLocal.forEach((local, url) => console.log("  ", local, " <- ", url.split("?")[0]));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Combined sync script: downloads scripts, assets, Elementor bundles;
 * syncs script blocks to pages; replaces URLs with local paths.
 *
 * Usage: node scripts/sync-all.js
 * Input:  htmlforscript.html (for script URLs), index.html (for script blocks)
 * Output: assets/js/*.js, assets/images/*, index-with-local-scripts.html,
 *         all HTML files updated with local paths.
 */

import fs from "fs";
import http from "http";
import https from "https";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Paths
const INPUT_HTML = path.join(ROOT, "htmlforscript.html");
const SOURCE_HTML = path.join(ROOT, "index.html");
const OUTPUT_HTML = path.join(ROOT, "index-with-local-scripts.html");
const OUT_JS = path.join(ROOT, "assets", "js");
const ASSETS_IMAGES = path.join(ROOT, "assets", "images");
const BASE = "https://sbadvisors.ae";

// HTML files
const ALL_HTML = [
  "index.html",
  "htmlforscript.html",
  "about-us/index.html",
  "accounting-finance-consulting-cfo-services-ras-al-khaimah-uae/index.html",
  "contact-us/index.html",
  "compliance-aml-due-diligence-esr-risk-management-ras-al-khaimah-uae/index.html",
  "financial-planning-cost-control-business-setup-ras-al-khaimah-uae/index.html",
  "tax-support-corporate-tax-vat-consultancy-ras-al-khaimah-uae/index.html",
];

const TARGET_PAGES = ALL_HTML.filter((f) => f !== "index.html" && f !== "htmlforscript.html");

// Regexes
const SKIP_SCRIPT_DOMAINS = (process.env.SKIP_SCRIPT_DOMAINS || "googletagmanager.com")
  .split(",")
  .map((d) => d.trim().toLowerCase());
const SCRIPT_SRC_REGEX = /<script([^>]*)\ssrc=["'](https?:\/\/[^"']+)["']([^>]*)>/gi;
const STYLESHEET_LINK_REGEX = /<link\s+rel=['"]stylesheet['"][^>]*\sid=['"]([^'"]+)['"][^>]*\shref=['"](https?:\/\/sbadvisors\.ae[^'"]*)['"][^>]*>/gi;
const STYLESHEET_LINK_REGEX_ALT = /<link\s+rel=['"]stylesheet['"][^>]*\shref=['"](https?:\/\/sbadvisors\.ae[^'"]*)['"][^>]*\sid=['"]([^'"]+)['"][^>]*>/gi;
const ASSET_URL_REGEX = /https:\/\/sbadvisors\.ae\/wp-content\/uploads\/[^"'\s\)]+/g;
const GITHUB_PAGES_SCRIPT_REGEX =
  /<script\b[^>]*\bsrc=["'][^"']*assets\/js\/github-pages\.js["'][^>]*>\s*<\/script>\s*/gi;

function getRelativePrefix(filePath) {
  const dir = path.dirname(filePath);
  if (dir === "." || dir === "") return "";
  const depth = dir.split(path.sep).filter(Boolean).length;
  return "../".repeat(depth);
}

function getGithubPagesScriptTag(filePath) {
  return `<script src="${getRelativePrefix(filePath)}assets/js/github-pages.js"></script>`;
}

function ensureGithubPagesScriptInHead(html, filePath) {
  const headOpenIdx = html.indexOf("<head>");
  if (headOpenIdx < 0) return html;
  const scriptTag = getGithubPagesScriptTag(filePath);
  let next = html.replace(GITHUB_PAGES_SCRIPT_REGEX, "");
  const insertIdx = headOpenIdx + "<head>".length;
  return next.slice(0, insertIdx) + `\n\t${scriptTag}` + next.slice(insertIdx);
}

const ELEMENTOR_BUNDLES = [
  "shared-frontend-handlers.03caa53373b56d3bab67.bundle.min.js",
  "text-editor.45609661e409413f1cef.bundle.min.js",
  "image-carousel.6167d20b95b33386757b.bundle.min.js",
  "nested-accordion.10705241212f7b6c432b.bundle.min.js",
];
const ELEMENTOR_PRO_BUNDLES = [
  "nav-menu.8521a0597c50611efdc6.bundle.min.js",
  "nested-carousel.db797a097fdc5532ef4a.bundle.min.js",
];

// ---- HTTP download ----
function download(urlString, userAgent = "Mozilla/5.0 (compatible; SyncAll/1.0)") {
  return new Promise((resolve, reject) => {
    const protocol = urlString.startsWith("https") ? https : http;
    const req = protocol.get(
      urlString,
      { headers: { "User-Agent": userAgent } },
      (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return download(res.headers.location, userAgent).then(resolve).catch(reject);
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

// ---- Cleanup & replace ----
function removeUnwantedLinks(html) {
  return html
    .replace(/<link(?=[^>]*rel=['"]alternate['"])(?=[^>]*href=['"][^'"]*sbadvisors\.ae)[^>]*\/?>\s*/gi, "")
    .replace(/<link\s+rel=['"]dns-prefetch['"][^>]*href=['"]\/\/www\.googletagmanager\.com['"][^>]*\/?>\s*/gi, "")
    .replace(/<script[^>]*src=['"][^'"]*googletagmanager\.com\/gtag[^'"]*['"][^>]*><\/script>\s*/gi, "")
    .replace(/<!--\s*Google tag[\s\S]*?-->\s*/gi, "")
    .replace(/<script\s+id=['"]google_gtagjs-js-after['"][\s\S]*?<\/script>\s*/gi, "")
    .replace(/<!--\s*Google Analytics snippet added by Site Kit\s*-->\s*/gi, "")
    .replace(/<link\s+rel=['"]https:\/\/api\.w\.org\/['"][^>]*href=['"][^'"]*wp-json\/['"][^>]*\/?>\s*/gi, "")
    .replace(/<link\s+rel=['"]EditURI['"][^>]*href=['"][^'"]*xmlrpc\.php[^'"]*['"][^>]*\/?>\s*/gi, "")
    .replace(/<meta\s+name=['"]generator['"][^>]*content=['"][^'"]*WordPress[^'"]*['"][^>]*\/?>\s*/gi, "")
    .replace(/<meta\s+name=['"]generator['"][^>]*content=['"][^'"]*Site Kit[^'"]*['"][^>]*\/?>\s*/gi, "")
    .replace(/<meta\s+name=['"]generator['"][^>]*content=['"][^'"]*Elementor[^'"]*['"][^>]*\/?>\s*/gi, "")
    .replace(/<!--\s*browser-theme-color for WordPress\s*-->\s*/gi, "");
}

function replaceStylesheetUrls(html) {
  const replacer = (fullMatch, id, href) => {
    const localPath = `/assets/css/${id}.css`;
    const localFile = path.join(ROOT, "assets", "css", `${id}.css`);
    if (fs.existsSync(localFile)) {
      return fullMatch.replace(/href=['"][^'"]*['"]/, `href='${localPath}'`);
    }
    return fullMatch;
  };
  return html
    .replace(STYLESHEET_LINK_REGEX, replacer)
    .replace(STYLESHEET_LINK_REGEX_ALT, (m, href, id) => replacer(m, id, href));
}

function replaceAssetUrls(html) {
  return html.replace(ASSET_URL_REGEX, (fullUrl) => {
    const filename = fullUrl.split("/").pop().split("?")[0] || "asset";
    const localFile = path.join(ASSETS_IMAGES, filename);
    return fs.existsSync(localFile) ? `/assets/images/${filename}` : fullUrl;
  });
}

function replaceElementorConfigUrls(html) {
  return html
    .replace(/"assets":\s*"https:(?:\/\/|\\\/\\\/)sbadvisors\.ae[^"]*"/g, '"assets":"./assets/"')
    .replace(/"uploadUrl":\s*"https:(?:\/\/|\\\/\\\/)sbadvisors\.ae[^"]*"/g, '"uploadUrl":"./assets/images/"')
    .replace(/"ajaxurl":\s*"https:(?:\/\/|\\\/\\\/)sbadvisors\.ae[^"]*"/g, '"ajaxurl":""')
    .replace(/"rest":\s*"https:(?:\/\/|\\\/\\\/)sbadvisors\.ae[^"]*"/g, '"rest":""')
    .replace(/"defaultAnimationUrl":\s*"https:(?:\/\/|\\\/\\\/)sbadvisors\.ae[^"]*"/g, '"defaultAnimationUrl":""');
}

function fixBackgroundVideos(html) {
  return html.replace(
    /<video class="elementor-background-video-hosted"(?![^>]*\ssrc=)([^>]*)>/gi,
    (_, attrs) => `<video class="elementor-background-video-hosted"${attrs} src="./assets/videos/SBA-home-bw.mp4">`
  );
}

// ---- Step 1: Download scripts from htmlforscript.html ----
function urlToSafeFilename(urlString) {
  const url = new URL(urlString);
  const pathname = url.pathname.replace(/^\//, "");
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return "script.js";
  const base = segments.join("-");
  return base.endsWith(".js") ? base : base + ".js";
}

function extractScriptUrls(html) {
  const list = [];
  let m;
  SCRIPT_SRC_REGEX.lastIndex = 0;
  while ((m = SCRIPT_SRC_REGEX.exec(html)) !== null) {
    list.push({ fullTag: m[0], beforeSrc: m[1], url: m[2], afterSrc: m[3] });
  }
  return list;
}

async function step1DownloadScripts() {
  console.log("\n--- Step 1: Download scripts ---\n");
  if (!fs.existsSync(INPUT_HTML)) {
    console.error("Input file not found:", INPUT_HTML);
    process.exit(1);
  }
  if (!fs.existsSync(OUT_JS)) fs.mkdirSync(OUT_JS, { recursive: true });

  const html = fs.readFileSync(INPUT_HTML, "utf8");
  const scripts = extractScriptUrls(html);
  if (scripts.length === 0) {
    console.log("No external script URLs found.");
    return "";
  }

  let updatedHtml = html;
  const urlToLocal = new Map();

  for (const { fullTag, beforeSrc, url, afterSrc } of scripts) {
    const host = new URL(url).hostname.toLowerCase();
    if (SKIP_SCRIPT_DOMAINS.some((d) => host === d || host.endsWith("." + d))) {
      console.log("  (skip)", url.split("?")[0]);
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
      const newTag = `<script${beforeSrc} src="${localHref}"${afterSrc}>`;
      updatedHtml = updatedHtml.replace(fullTag, newTag);
      urlToLocal.set(url, localHref);
      console.log("OK");
    } catch (err) {
      console.log("FAIL:", err.message);
    }
  }

  updatedHtml = removeUnwantedLinks(updatedHtml);
  updatedHtml = replaceStylesheetUrls(updatedHtml);
  fs.writeFileSync(OUTPUT_HTML, updatedHtml, "utf8");
  console.log("\nWrote:", path.relative(ROOT, OUTPUT_HTML));

  // Apply cleanup and stylesheet replacement to all HTML files
  console.log("\nCleaning and updating HTML files...");
  for (const file of ALL_HTML) {
    const fullPath = path.join(ROOT, file);
    if (fs.existsSync(fullPath)) {
      let content = fs.readFileSync(fullPath, "utf8");
      content = removeUnwantedLinks(content);
      content = replaceStylesheetUrls(content);
      content = ensureGithubPagesScriptInHead(content, file);
      fs.writeFileSync(fullPath, content, "utf8");
      console.log("  Updated:", file);
    }
  }
  return updatedHtml;
}

// ---- Step 2: Sync script blocks from index.html to pages ----
function extractBlocks(html) {
  const headStart = html.indexOf('<script src="./assets/js/wp-includes-js-jquery-jquery.min.js"');
  const headEnd = html.indexOf('<script src="./assets/js/wp-includes-js-jquery-jquery-migrate.min.js"');
  const migrateEnd = headEnd >= 0 ? html.indexOf("</script>", headEnd) + "</script>".length : 0;
  const headScripts = headStart >= 0 && migrateEnd > headStart ? html.slice(headStart, migrateEnd).trim() : "";

  const bodyStart = html.indexOf('<script type="speculationrules">');
  const bodyEnd = html.lastIndexOf("</script>", html.indexOf("</body>"));
  const bodyEndTag = bodyEnd + "</script>".length;
  const bodyScripts = bodyStart >= 0 && bodyEndTag > bodyStart ? html.slice(bodyStart, bodyEndTag).trim() : "";

  return { headScripts, bodyScripts };
}

function ensureGithubPagesScriptInIndex() {
  if (!fs.existsSync(SOURCE_HTML)) return;
  const filePath = path.relative(ROOT, SOURCE_HTML);
  let html = fs.readFileSync(SOURCE_HTML, "utf8");
  const updated = ensureGithubPagesScriptInHead(html, filePath);
  if (updated === html) return;
  fs.writeFileSync(SOURCE_HTML, updated, "utf8");
  console.log("  Updated:", path.relative(ROOT, SOURCE_HTML));
}

function step2SyncScriptsToPages() {
  console.log("\n--- Step 2: Sync scripts to pages ---\n");
  const sourceHtml = fs.readFileSync(SOURCE_HTML, "utf8");
  const { headScripts, bodyScripts } = extractBlocks(sourceHtml);
  if (!headScripts) console.warn("Warning: Could not extract head scripts.");
  if (!bodyScripts) console.warn("Warning: Could not extract body scripts.");

  for (const filePath of TARGET_PAGES) {
    const fullPath = path.join(ROOT, filePath);
    if (!fs.existsSync(fullPath)) {
      console.log("  Skip (not found):", filePath);
      continue;
    }
    let html = fs.readFileSync(fullPath, "utf8");
    html = removeUnwantedLinks(html);

    if (html.includes('id="jquery-core-js"') && html.indexOf("<head>") > html.indexOf('id="jquery-core-js"')) {
      html = html
        .replace(/<script src="\/assets\/js\/wp-includes-js-jquery-jquery\.min\.js"[^>]*><\/script>\s*/g, "")
        .replace(/<script src="\/assets\/js\/wp-includes-js-jquery-jquery-migrate\.min\.js"[^>]*><\/script>\s*/g, "");
    }

    const hasHeadScriptsInHead = html.indexOf('id="jquery-core-js"') > 0 && html.indexOf("<head>") < html.indexOf('id="jquery-core-js"');
    if (headScripts && !hasHeadScriptsInHead) {
      const headClose = html.indexOf("</head>");
      html = html.slice(0, headClose) + "\n\t" + headScripts + "\n" + html.slice(headClose);
    }

    const targetBodyStart = html.indexOf('<script type="speculationrules">');
    const bodyCloseIdx = html.indexOf("</body>");
    const targetBodyEnd = html.lastIndexOf("</script>", bodyCloseIdx);
    const targetHasBodyScripts = targetBodyStart >= 0 && targetBodyEnd > targetBodyStart;

    if (bodyScripts) {
      if (targetHasBodyScripts) {
        const targetBodyEndTag = targetBodyEnd + "</script>".length;
        html = html.slice(0, targetBodyStart) + bodyScripts + "\n\n\t" + html.slice(targetBodyEndTag);
      } else {
        html = html.slice(0, bodyCloseIdx) + "\n\t\t" + bodyScripts + "\n\n" + html.slice(bodyCloseIdx);
      }
    }

    html = replaceStylesheetUrls(html);
    html = ensureGithubPagesScriptInHead(html, filePath);
    fs.writeFileSync(fullPath, html, "utf8");
    console.log("  Updated:", filePath);
  }
}

// ---- Step 3: Download assets (images, favicons) ----
async function step3DownloadAssets() {
  console.log("\n--- Step 3: Download assets ---\n");
  if (!fs.existsSync(ASSETS_IMAGES)) fs.mkdirSync(ASSETS_IMAGES, { recursive: true });

  const assetUrls = new Set();
  for (const file of ALL_HTML) {
    const fullPath = path.join(ROOT, file);
    if (fs.existsSync(fullPath)) {
      let m;
      ASSET_URL_REGEX.lastIndex = 0;
      const content = fs.readFileSync(fullPath, "utf8");
      while ((m = ASSET_URL_REGEX.exec(content)) !== null) assetUrls.add(m[0]);
    }
  }

  const toDownload = [];
  for (const url of assetUrls) {
    const filename = url.split("/").pop().split("?")[0] || "asset";
    if (!fs.existsSync(path.join(ASSETS_IMAGES, filename))) toDownload.push({ url, filename });
  }

  if (toDownload.length === 0) {
    console.log("All assets already present locally.\n");
  } else {
    for (const { url, filename } of toDownload) {
      process.stdout.write(`  ${filename} ... `);
      try {
        const data = await download(url);
        fs.writeFileSync(path.join(ASSETS_IMAGES, filename), data);
        console.log("OK");
      } catch (err) {
        console.log("FAIL:", err.message);
      }
    }
  }

  for (const file of ALL_HTML) {
    const fullPath = path.join(ROOT, file);
    if (fs.existsSync(fullPath)) {
      let content = fs.readFileSync(fullPath, "utf8");
      content = replaceAssetUrls(content);
      content = replaceElementorConfigUrls(content);
      content = fixBackgroundVideos(content);
      fs.writeFileSync(fullPath, content, "utf8");
      console.log("  Updated:", file);
    }
  }
}

// ---- Step 4: Download Elementor bundles ----
async function step4DownloadElementorBundles() {
  console.log("\n--- Step 4: Download Elementor bundles ---\n");
  if (!fs.existsSync(OUT_JS)) fs.mkdirSync(OUT_JS, { recursive: true });

  const tasks = [
    ...ELEMENTOR_BUNDLES.map((file) => ({ url: `${BASE}/wp-content/plugins/elementor/assets/js/${file}`, file })),
    ...ELEMENTOR_PRO_BUNDLES.map((file) => ({ url: `${BASE}/wp-content/plugins/elementor-pro/assets/js/${file}`, file })),
  ];

  for (const { url, file } of tasks) {
    const outPath = path.join(OUT_JS, file);
    if (fs.existsSync(outPath)) {
      console.log(`  ${file} ... (exists)`);
      continue;
    }
    process.stdout.write(`  ${file} ... `);
    try {
      const data = await download(url);
      fs.writeFileSync(outPath, data);
      console.log("OK");
    } catch (err) {
      console.log("FAIL:", err.message);
    }
  }
}

// ---- Main ----
async function main() {
  console.log("=== Sync All ===\n");
  await step1DownloadScripts();
  ensureGithubPagesScriptInIndex();
  step2SyncScriptsToPages();
  await step3DownloadAssets();
  await step4DownloadElementorBundles();
  console.log("\n=== Done ===\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

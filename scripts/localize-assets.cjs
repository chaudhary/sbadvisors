const fs = require("fs");
const path = require("path");
const https = require("https");
const { URL } = require("url");

const workspaceRoot = process.cwd();
const targetFile = process.argv[2] || "index.html";
const fullTargetPath = path.resolve(workspaceRoot, targetFile);

if (!fs.existsSync(fullTargetPath)) {
  console.error(`File not found: ${fullTargetPath}`);
  process.exit(1);
}

const html = fs.readFileSync(fullTargetPath, "utf8");

const cssUrlRegex =
  /href=(['"])(https:\/\/sbadvisors\.ae[^'"]+?\.css(?:\?[^'"]*)?)\1/gi;
const jsUrlRegex =
  /src=(['"])(https:\/\/sbadvisors\.ae[^'"]+?\.js(?:\?[^'"]*)?)\1/gi;
const assetUrlRegex =
  /(href|src|content)=(['"])(https:\/\/sbadvisors\.ae[^'"]+?\.(?:png|jpe?g|gif|webp|svg|ico)(?:\?[^'"]*)?)\2/gi;
const anchorLinkRegex =
  /<a\b[^>]*\bhref=(['"])(https:\/\/sbadvisors\.ae[^'"]*)\1/gi;

const cssMatches = [...html.matchAll(cssUrlRegex)].map((m) => ({
  url: m[2],
  type: "css"
}));
const jsMatches = [...html.matchAll(jsUrlRegex)].map((m) => ({
  url: m[2],
  type: "js"
}));
const assetMatches = [...html.matchAll(assetUrlRegex)].map((m) => ({
  url: m[3],
  type: "img"
}));
const anchorLinkMatches = [...html.matchAll(anchorLinkRegex)].map((m) => ({
  url: m[2],
  type: "link"
}));
const canonicalTagMatch = html.match(
  /<link\b[^>]*\brel=["']canonical["'][^>]*>/i
);
const shortlinkTagMatch = html.match(
  /<link\b[^>]*\brel=["']shortlink["'][^>]*>/i
);

const matches = [...cssMatches, ...jsMatches, ...assetMatches];

const uniqueEntries = Array.from(
  new Map(matches.map((entry) => [entry.url, entry])).values()
);

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          const redirected = new URL(res.headers.location, url).toString();
          res.resume();
          return resolve(fetchUrl(redirected));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(
            new Error(`Request failed (${res.statusCode}): ${url}`)
          );
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

function toRelativeInternalLink(url, htmlDir) {
  const parsed = new URL(url);
  const pathname = parsed.pathname || "/";
  if (pathname.startsWith("/wp-")) return null;
  if (/\.(css|js|png|jpe?g|gif|webp|svg|ico|pdf|zip)$/i.test(pathname)) {
    return null;
  }

  const cleanPath = pathname.replace(/^\/+/, "");
  const targetPath = path.resolve(workspaceRoot, cleanPath);
  let relative = path.relative(htmlDir, targetPath);
  if (!relative) relative = ".";
  const hasTrailingSlash = pathname.endsWith("/");
  let webPath = relative.split(path.sep).join("/");
  if (webPath === ".") webPath = "./";
  if (hasTrailingSlash && !webPath.endsWith("/")) webPath += "/";

  return `${webPath}${parsed.search || ""}${parsed.hash || ""}`;
}

async function run() {
  const downloadMap = new Map();
  const htmlDir = path.dirname(fullTargetPath);

  for (const entry of uniqueEntries) {
    const url = entry.url;
    const baseAssetsDir = path.join(htmlDir, "assets", entry.type);
    const parsed = new URL(url);
    const relativePath = parsed.pathname.replace(/^\/+/, "");
    const localFilePath = path.join(baseAssetsDir, relativePath);
    const htmlRelativePath = path.relative(
      htmlDir,
      path.join(baseAssetsDir, relativePath)
    );
    const localWebPath = htmlRelativePath.split(path.sep).join("/");

    downloadMap.set(url, { localFilePath, localWebPath });
  }

  for (const [url, info] of downloadMap.entries()) {
    ensureDir(info.localFilePath);
    const content = await fetchUrl(url);
    fs.writeFileSync(info.localFilePath, content);
    console.log(`Saved ${url} -> ${info.localWebPath}`);
  }

  let updatedHtml = html;
  for (const [url, info] of downloadMap.entries()) {
    updatedHtml = updatedHtml.split(url).join(info.localWebPath);
  }

  for (const entry of anchorLinkMatches) {
    const replacement = toRelativeInternalLink(entry.url, htmlDir);
    if (replacement) {
      updatedHtml = updatedHtml.split(entry.url).join(replacement);
    }
  }

  updatedHtml = updatedHtml.replace(
    /<script\b[^>]*\bid=["']google_gtagjs-js-after["'][^>]*>[\s\S]*?<\/script>/gi,
    ""
  );
  updatedHtml = updatedHtml.replace(
    /<script\b[^>]*\bid=["']google_gtagjs-js["'][^>]*>[\s\S]*?<\/script>/gi,
    ""
  );
  updatedHtml = updatedHtml.replace(/<!--[\s\S]*?-->/g, "");
  updatedHtml = updatedHtml.replace(/\n[ \t]*\n[ \t]*\n+/g, "\n\n");
  updatedHtml = updatedHtml.replace(
    /<link\b[^>]*\btype=["']application\/rss\+xml["'][^>]*>/gi,
    ""
  );
  updatedHtml = updatedHtml.replace(/[ \t]+$/gm, "");
  updatedHtml = updatedHtml.replace(
    /<link\b[^>]*\btitle=["']oEmbed \(JSON\)["'][^>]*>/gi,
    ""
  );
  updatedHtml = updatedHtml.replace(
    /<link\b[^>]*\btitle=["']oEmbed \(XML\)["'][^>]*>/gi,
    ""
  );
  updatedHtml = updatedHtml.replace(
    /<link\b[^>]*\btype=["']application\/rsd\+xml["'][^>]*>/gi,
    ""
  );
  updatedHtml = updatedHtml.replace(
    /<link\b[^>]*\brel=["']https:\/\/api\.w\.org\/["'][^>]*>/gi,
    ""
  );
  updatedHtml = updatedHtml.replace(
    /<link\b[^>]*\brel=["']alternate["'][^>]*\btitle=["']JSON["'][^>]*>/gi,
    ""
  );
  if (canonicalTagMatch) {
    updatedHtml = updatedHtml.replace(
      /<link\b[^>]*\brel=["']canonical["'][^>]*>/gi,
      canonicalTagMatch[0]
    );
  }
  if (shortlinkTagMatch) {
    updatedHtml = updatedHtml.replace(
      /<link\b[^>]*\brel=["']shortlink["'][^>]*>/gi,
      shortlinkTagMatch[0]
    );
  }

  fs.writeFileSync(fullTargetPath, updatedHtml);
  console.log(`Updated references in ${targetFile}`);
  if (matches.length === 0 && anchorLinkMatches.length === 0) {
    console.log("No CSS, JS, asset, or anchor URLs found to localize.");
  }
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

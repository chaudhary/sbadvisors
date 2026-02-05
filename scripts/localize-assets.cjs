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

const matches = [...cssMatches, ...jsMatches, ...assetMatches];
if (matches.length === 0) {
  console.log("No CSS or JS URLs found to localize.");
  process.exit(0);
}

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

  fs.writeFileSync(fullTargetPath, updatedHtml);
  console.log(`Updated references in ${targetFile}`);
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

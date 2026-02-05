import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

function fixLegacyScripts(base) {
  const normalizedBase =
    base === "./" || base === "."
      ? "/"
      : `/${base.replace(/^\/|\/$/g, "")}/`;
  const legacyScriptRegex =
    /<script\b(?![^>]*\btype=["']module["'])([^>]*\bsrc=["'])(\/?assets\/js\/[^"']+)(["'][^>]*)>\s*<\/script>/gi;
  const normalizeSrc = (src) => {
    const trimmed = src.replace(/^\//, "");
    return `${normalizedBase}${trimmed}`;
  };
  const stripBase = (src) => {
    let cleaned = src.replace(/^\//, "");
    if (normalizedBase !== "/") {
      const baseName = normalizedBase.replace(/^\/|\/$/g, "");
      if (cleaned.startsWith(`${baseName}/`)) {
        cleaned = cleaned.slice(baseName.length + 1);
      }
    }
    return cleaned;
  };
  const collectHtmlFiles = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...collectHtmlFiles(fullPath));
      else if (entry.isFile() && entry.name.endsWith(".html")) files.push(fullPath);
    }
    return files;
  };

  return {
    name: "fix-legacy-scripts",
    apply: "build",
    transformIndexHtml(html) {
      const next = html.replace(legacyScriptRegex, (full, beforeSrc, src, afterSrc) => {
        const normalizedSrc = normalizeSrc(src);
        const ignoreAttr = /\bdata-vite-ignore\b/i.test(afterSrc) ? "" : " data-vite-ignore";
        return `<script${beforeSrc}${normalizedSrc}${afterSrc}${ignoreAttr}></script>`;
      });

      return next;
    },
    writeBundle(outputOptions) {
      const distDir = outputOptions.dir || path.resolve(__dirname, "dist");
      const htmlFiles = collectHtmlFiles(distDir);
      const hashedMap = new Map();

      const getHashedPath = (src) => {
        const normalized = normalizeSrc(src);
        if (hashedMap.has(normalized)) return hashedMap.get(normalized);

        const absSource = path.resolve(__dirname, stripBase(normalized));
        if (!fs.existsSync(absSource)) return null;

        const content = fs.readFileSync(absSource);
        const baseName = path.basename(normalized);
        const ext = path.extname(baseName);
        const name = path.basename(baseName, ext);
        const hash = crypto.createHash("sha256").update(content).digest("hex").slice(0, 8);
        const fileName = path.posix.join("assets", "js", `${name}-${hash}${ext}`);
        const outPath = path.join(distDir, fileName);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        if (!fs.existsSync(outPath)) fs.writeFileSync(outPath, content);

        const publicPath = `${normalizedBase}${fileName}`;
        hashedMap.set(normalized, publicPath);
        return publicPath;
      };

      for (const filePath of htmlFiles) {
        const html = fs.readFileSync(filePath, "utf8");
        const updated = html.replace(legacyScriptRegex, (full, beforeSrc, src, afterSrc) => {
          const hashed = getHashedPath(src);
          if (!hashed) return full;
          const ignoreAttr = /\bdata-vite-ignore\b/i.test(afterSrc) ? "" : " data-vite-ignore";
          return `<script${beforeSrc}${hashed}${afterSrc}${ignoreAttr}></script>`;
        });

        if (updated !== html) fs.writeFileSync(filePath, updated, "utf8");
      }
    }
  };
}

export default defineConfig(({ command }) => {
  const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
  const base = command === "serve" ? "./" : repo ? `/${repo}/` : "./";

  return {
    base,
    plugins: [fixLegacyScripts(base)],
    build: {
      minify: false,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, "index.html"),
          about: path.resolve(__dirname, "about-us", "index.html"),
          accounting: path.resolve(
            __dirname,
            "accounting-finance-consulting-cfo-services-ras-al-khaimah-uae",
            "index.html"
          ),
          taxSupport: path.resolve(
            __dirname,
            "tax-support-corporate-tax-vat-consultancy-ras-al-khaimah-uae",
            "index.html"
          ),
          financialPlanning: path.resolve(
            __dirname,
            "financial-planning-cost-control-business-setup-ras-al-khaimah-uae",
            "index.html"
          ),
          compliance: path.resolve(
            __dirname,
            "compliance-aml-due-diligence-esr-risk-management-ras-al-khaimah-uae",
            "index.html"
          ),
          contact: path.resolve(__dirname, "contact-us", "index.html")
        }
      }
    }
  };
});

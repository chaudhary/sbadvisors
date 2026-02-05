import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

function fixLegacyScripts() {
  const legacyScriptRegex =
    /<script\b(?![^>]*\btype=["']module["'])([^>]*\bsrc=["'])(\/?assets\/js\/[^"']+)(["'][^>]*)>\s*<\/script>/gi;
  const normalizeSrc = (src) => (src.startsWith("/") ? src : `/${src}`);
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
      let next = html.replace(
        /<script\b([^>]*\bsrc=["'])assets\/js\/github-pages\.js(["'][^>]*)>/gi,
        '<script$1/assets/js/github-pages.js$2>'
      );

      next = next.replace(legacyScriptRegex, (full, beforeSrc, src, afterSrc) => {
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

        const absSource = path.resolve(__dirname, normalized.slice(1));
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

        hashedMap.set(normalized, fileName);
        return fileName;
      };

      for (const filePath of htmlFiles) {
        const html = fs.readFileSync(filePath, "utf8");
        const updated = html.replace(legacyScriptRegex, (full, beforeSrc, src, afterSrc) => {
          const hashed = getHashedPath(src);
          if (!hashed) return full;
          const ignoreAttr = /\bdata-vite-ignore\b/i.test(afterSrc) ? "" : " data-vite-ignore";
          return `<script${beforeSrc}/${hashed}${afterSrc}${ignoreAttr}></script>`;
        });

        if (updated !== html) fs.writeFileSync(filePath, updated, "utf8");
      }
    }
  };
}

export default defineConfig({
  base: "./",
  plugins: [fixLegacyScripts()],
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
});

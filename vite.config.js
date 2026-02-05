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
    /<script\b(?![^>]*\btype=["']module["'])([^>]*\bsrc=["'])((?:\.\/)?(?:[^"']*\/)?assets\/js\/[^"']+)(["'][^>]*)>\s*<\/script>/gi;
  const normalizeSrc = (src) => {
    if (src.startsWith(normalizedBase)) return src;
    if (src.startsWith("/")) return src;
    const trimmed = src.replace(/^\.\//, "").replace(/^\//, "");
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

function preserveCssLinks(base) {
  const cssLinkRegex = /<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi;
  const normalizedBase =
    base === "./" || base === "."
      ? "/"
      : `/${base.replace(/^\/|\/$/g, "")}/`;
  const normalizeHref = (href) => {
    if (href.startsWith(normalizedBase)) return href;
    if (href.startsWith("/")) return href;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
    const trimmed = href.replace(/^\.\//, "").replace(/^\//, "");
    return `${normalizedBase}${trimmed}`;
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
  const hashFile = (filePath) => {
    const content = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(content).digest("hex").slice(0, 8);
  };
  const addHashToFilename = (relativePath, hash) => {
    const ext = path.posix.extname(relativePath);
    const base = relativePath.slice(0, -ext.length);
    return `${base}-${hash}${ext}`;
  };

  return {
    name: "preserve-css-links",
    apply: "build",
    enforce: "pre",
    transformIndexHtml(html) {
      return html.replace(cssLinkRegex, (full) => {
        let next = full;
        if (!/\bdata-vite-ignore\b/i.test(next)) {
          next = next.replace(/\s*\/?>$/, (end) => ` data-vite-ignore${end}`);
        }
        return next.replace(/\bhref=["']([^"']+)["']/, (match, href) => {
          return `href="${normalizeHref(href)}"`;
        });
      });
    },
    writeBundle(outputOptions) {
      const distDir = outputOptions.dir || path.resolve(__dirname, "dist");
      const distHtmlFiles = collectHtmlFiles(distDir);
      for (const distFile of distHtmlFiles) {
        const relative = path.relative(distDir, distFile);
        const sourceFile = path.resolve(__dirname, relative);
        if (!fs.existsSync(sourceFile)) continue;
        const sourceHtml = fs.readFileSync(sourceFile, "utf8");
        const idToHref = new Map();

        for (const match of sourceHtml.matchAll(cssLinkRegex)) {
          const tag = match[0];
          const idMatch = tag.match(/\bid=["']([^"']+)["']/i);
          const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
          if (!idMatch || !hrefMatch) continue;
          const id = idMatch[1];
          const href = hrefMatch[1];
          if (href.includes("assets/css/")) idToHref.set(id, href);
        }

        if (idToHref.size === 0) continue;
        let distHtml = fs.readFileSync(distFile, "utf8");
        for (const [id, href] of idToHref.entries()) {
          const cleanHref = href.replace(/^\.\//, "");
          const sourceCssPath = path.resolve(__dirname, cleanHref);
          if (!fs.existsSync(sourceCssPath)) continue;
          const hash = hashFile(sourceCssPath);
          const hashedHref = addHashToFilename(cleanHref, hash);
          const outPath = path.join(distDir, hashedHref);
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
          fs.copyFileSync(sourceCssPath, outPath);
          const publicHref = normalizeHref(hashedHref);

          const idRegex = new RegExp(
            `<link\\b([^>]*\\bid=["']${id}["'][^>]*\\bhref=["'])[^"']+(["'][^>]*>)`,
            "gi"
          );
          distHtml = distHtml.replace(idRegex, `<link$1${publicHref}$2`);
        }
        fs.writeFileSync(distFile, distHtml, "utf8");
      }
    }
  };
}

function copyStaticVideoAssets() {
  const copyDir = (srcDir, destDir) => {
    if (!fs.existsSync(srcDir)) return;
    fs.mkdirSync(destDir, { recursive: true });
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);
      if (entry.isDirectory()) copyDir(srcPath, destPath);
      else if (entry.isFile()) fs.copyFileSync(srcPath, destPath);
    }
  };

  return {
    name: "copy-static-video-assets",
    apply: "build",
    writeBundle(outputOptions) {
      const distDir = outputOptions.dir || path.resolve(__dirname, "dist");
      const sourceDir = path.resolve(__dirname, "assets", "video");
      const destDir = path.join(distDir, "assets", "video");
      copyDir(sourceDir, destDir);
    }
  };
}

function normalizeVideoLinks(base) {
  const normalizedBase =
    base === "./" || base === "."
      ? "/"
      : `/${base.replace(/^\/|\/$/g, "")}/`;
  const normalizePath = (url) => {
    if (url.startsWith(normalizedBase)) return url;
    if (url.startsWith("/")) return url;
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
    const trimmed = url.replace(/^\.\//, "").replace(/^\//, "");
    return `${normalizedBase}${trimmed}`;
  };

  return {
    name: "normalize-video-links",
    apply: "build",
    transformIndexHtml(html) {
      let next = html.replace(
        /\b(src|poster)=["'](assets\/video\/[^"']+)["']/gi,
        (_, attr, path) => `${attr}="${normalizePath(path)}"`
      );
      next = next.replace(
        /(&quot;[^&]*?(?:video|video_link|video_url|background_video_link)[^&]*?&quot;:&quot;)(assets(?:\\\/|\/)video(?:\\\/|\/)[^&"]+?)(&quot;)/gi,
        (_, before, path, after) => {
          const unescaped = path.replace(/\\\//g, "/");
          const normalized = normalizePath(unescaped);
          const escaped = normalized.replace(/\//g, "\\/");
          return `${before}${escaped}${after}`;
        }
      );
      return next;
    }
  };
}

export default defineConfig(({ command }) => {
  const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
  const base = command === "serve" ? "./" : repo ? `/${repo}/` : "./";

  return {
    base,
    plugins: [
      fixLegacyScripts(base),
      preserveCssLinks(base),
      copyStaticVideoAssets(),
      normalizeVideoLinks(base)
    ],
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

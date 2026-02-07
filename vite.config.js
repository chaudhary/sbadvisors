import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

function fixLegacyScripts(base) {
  const normalizedBase =
    base === "./" || base === "." || base === "/" || base === ""
      ? "/"
      : `/${base.replace(/^\/|\/$/g, "")}/`;
  const normalizeToBase = (src) => {
    if (normalizedBase === "/") return src;
    if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return src;
    if (src.startsWith("//")) return src;
    if (src.startsWith(normalizedBase)) return src;
    if (src.startsWith("/")) return `${normalizedBase}${src.replace(/^\/+/, "")}`;
    return src;
  };
  const legacyScriptRegex =
    /<script\b(?![^>]*\btype=["']module["'])([^>]*\bsrc=["'])((?:\.\/)?(?:[^"']*\/)?assets\/js\/[^"']+)(["'][^>]*)>\s*<\/script>/gi;
  const normalizeSrc = (src) => {
    if (src.startsWith(normalizedBase)) return src;
    if (src.startsWith("/")) return normalizeToBase(src);
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
    base === "./" || base === "." || base === "/" || base === ""
      ? "/"
      : `/${base.replace(/^\/|\/$/g, "")}/`;
  const normalizeToBase = (href) => {
    if (normalizedBase === "/") return href;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
    if (href.startsWith("//")) return href;
    if (href.startsWith(normalizedBase)) return href;
    if (href.startsWith("/")) return `${normalizedBase}${href.replace(/^\/+/, "")}`;
    return href;
  };
  const baseName = normalizedBase.replace(/^\/|\/$/g, "");
  const stripLeadingRelative = (href) => {
    let cleaned = href.split("?")[0].split("#")[0];
    if (/^[a-z][a-z0-9+.-]*:/i.test(cleaned)) return null;
    while (cleaned.startsWith("../")) cleaned = cleaned.slice(3);
    cleaned = cleaned.replace(/^\.\//, "");
    cleaned = cleaned.replace(/^\/+/, "");
    if (baseName && cleaned.startsWith(`${baseName}/`)) {
      cleaned = cleaned.slice(baseName.length + 1);
    }
    return cleaned;
  };
  const normalizeHref = (href) => {
    if (href.startsWith(normalizedBase)) return href;
    if (href.startsWith("/")) return normalizeToBase(href);
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
    const trimmed = stripLeadingRelative(href);
    if (!trimmed) return href;
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
          const cleanHref = stripLeadingRelative(href);
          if (!cleanHref) continue;
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

function copyStaticImageAssets() {
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
    name: "copy-static-image-assets",
    apply: "build",
    writeBundle(outputOptions) {
      const distDir = outputOptions.dir || path.resolve(__dirname, "dist");
      const sourceDir = path.resolve(__dirname, "assets", "img");
      const destDir = path.join(distDir, "assets", "img");
      copyDir(sourceDir, destDir);
    }
  };
}

function copyStaticElementorJs() {
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
    name: "copy-static-elementor-js",
    apply: "build",
    writeBundle(outputOptions) {
      const distDir = outputOptions.dir || path.resolve(__dirname, "dist");
      const sourceDir = path.resolve(
        __dirname,
        "assets",
        "js",
        "wp-content",
        "plugins",
        "elementor",
        "assets",
        "js"
      );
      const destDir = path.join(
        distDir,
        "assets",
        "js",
        "wp-content",
        "plugins",
        "elementor",
        "assets",
        "js"
      );
      copyDir(sourceDir, destDir);

      const chunkSourceDir = path.resolve(__dirname, "assets", "js");
      if (fs.existsSync(chunkSourceDir)) {
        fs.mkdirSync(destDir, { recursive: true });
        const flatDestDir = path.join(distDir, "assets", "js");
        fs.mkdirSync(flatDestDir, { recursive: true });
        const chunkEntries = fs.readdirSync(chunkSourceDir, { withFileTypes: true });
        for (const entry of chunkEntries) {
          if (!entry.isFile()) continue;
          if (!entry.name.endsWith(".bundle.min.js")) continue;
          const srcPath = path.join(chunkSourceDir, entry.name);
          const nestedDestPath = path.join(destDir, entry.name);
          const flatDestPath = path.join(flatDestDir, entry.name);
          fs.copyFileSync(srcPath, nestedDestPath);
          fs.copyFileSync(srcPath, flatDestPath);
        }
      }
    }
  };
}

function normalizeCssUrls(base) {
  const normalizedBase =
    base === "./" || base === "." || base === "/" || base === ""
      ? "/"
      : `/${base.replace(/^\/|\/$/g, "")}/`;
  const normalizeToBase = (href) => {
    if (normalizedBase === "/") return href;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
    if (href.startsWith("//")) return href;
    if (href.startsWith(normalizedBase)) return href;
    if (href.startsWith("/")) return `${normalizedBase}${href.replace(/^\/+/, "")}`;
    return href;
  };
  const normalizeUrl = (url) => {
    if (!url) return url;
    const trimmed = url.trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
    if (trimmed.startsWith("//")) return trimmed;
    if (trimmed.startsWith("#")) return trimmed;
    if (trimmed.startsWith(normalizedBase)) return trimmed;
    if (trimmed.startsWith("/")) return normalizeToBase(trimmed);
    if (trimmed.startsWith("assets/") || trimmed.startsWith("./assets/")) {
      return `${normalizedBase}${trimmed.replace(/^\.\//, "")}`;
    }
    return trimmed;
  };
  const collectCssFiles = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...collectCssFiles(fullPath));
      else if (entry.isFile() && entry.name.endsWith(".css")) files.push(fullPath);
    }
    return files;
  };

  return {
    name: "normalize-css-urls",
    apply: "build",
    writeBundle(outputOptions) {
      const distDir = outputOptions.dir || path.resolve(__dirname, "dist");
      const cssFiles = collectCssFiles(distDir);
      const hashedCache = new Map();
      const urlRegex = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

      const addHashToFilename = (relativePath, hash) => {
        const ext = path.posix.extname(relativePath);
        const base = relativePath.slice(0, -ext.length);
        return `${base}-${hash}${ext}`;
      };
      const hashFile = (filePath) => {
        const content = fs.readFileSync(filePath);
        return crypto.createHash("sha256").update(content).digest("hex").slice(0, 8);
      };
      const toHashedUrl = (originalUrl) => {
        const cleaned = originalUrl.trim();
        const hashIndex = cleaned.indexOf("#");
        const queryIndex = cleaned.indexOf("?");
        const cutIndex =
          hashIndex === -1
            ? queryIndex
            : queryIndex === -1
              ? hashIndex
              : Math.min(hashIndex, queryIndex);
        const basePart = cutIndex === -1 ? cleaned : cleaned.slice(0, cutIndex);
        const suffix = cutIndex === -1 ? "" : cleaned.slice(cutIndex);

        let relativePath = basePart.replace(/^\.\//, "");
        if (relativePath.startsWith(normalizedBase)) {
          relativePath = relativePath.slice(normalizedBase.length);
        }
        if (relativePath.startsWith("/")) relativePath = relativePath.slice(1);
        if (!relativePath.startsWith("assets/img/")) return null;

        if (hashedCache.has(relativePath)) {
          return hashedCache.get(relativePath) + suffix;
        }

        const sourcePath = path.resolve(__dirname, relativePath);
        if (!fs.existsSync(sourcePath)) return null;

        const hash = hashFile(sourcePath);
        const hashedRelative = addHashToFilename(relativePath, hash);
        const outPath = path.join(distDir, hashedRelative);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.copyFileSync(sourcePath, outPath);

        const publicPath = normalizeToBase(`/${hashedRelative}`);
        hashedCache.set(relativePath, publicPath);
        return publicPath + suffix;
      };

      for (const filePath of cssFiles) {
        const css = fs.readFileSync(filePath, "utf8");
        const next = css.replace(urlRegex, (full, quote, url) => {
          const hashed = toHashedUrl(url);
          if (hashed) {
            const finalQuote = quote || "";
            return `url(${finalQuote}${hashed}${finalQuote})`;
          }
          const normalized = normalizeUrl(url);
          if (normalized === url) return full;
          const finalQuote = quote || "";
          return `url(${finalQuote}${normalized}${finalQuote})`;
        });
        if (next !== css) fs.writeFileSync(filePath, next, "utf8");
      }
    }
  };
}

function normalizeVideoLinks(base) {
  const normalizedBase =
    base === "./" || base === "." || base === "/" || base === ""
      ? "/"
      : `/${base.replace(/^\/|\/$/g, "")}/`;
  const normalizePath = (url) => {
    if (url.startsWith(normalizedBase)) return url;
    if (url.startsWith("/")) {
      if (normalizedBase === "/") return url;
      return `${normalizedBase}${url.replace(/^\/+/, "")}`;
    }
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

function normalizeHrefLinks(base) {
  const normalizedBase =
    base === "./" || base === "." || base === "/" || base === ""
      ? "/"
      : `/${base.replace(/^\/|\/$/g, "")}/`;
  const normalizeHref = (href) => {
    if (normalizedBase === "/") return href;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
    if (href.startsWith("//")) return href;
    if (href.startsWith("#")) return href;
    if (href.startsWith(normalizedBase)) return href;
    if (href.startsWith("/")) return `${normalizedBase}${href.replace(/^\/+/, "")}`;
    return href;
  };

  return {
    name: "normalize-href-links",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(/\bhref=["']([^"']+)["']/gi, (full, href) => {
        const nextHref = normalizeHref(href);
        if (nextHref === href) return full;
        return `href="${nextHref}"`;
      });
    }
  };
}

export default defineConfig(({ command }) => {
  const CUSTOM_DOMAIN_CONFIGURED = true;
  const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
  const ghPagesBase = repo ? `/${repo}/` : "/";
  const base = command === "serve" ? "/" : CUSTOM_DOMAIN_CONFIGURED ? "/" : ghPagesBase;

  return {
    base,
    plugins: [
      fixLegacyScripts(base),
      preserveCssLinks(base),
      copyStaticVideoAssets(),
      copyStaticImageAssets(),
      copyStaticElementorJs(),
      normalizeVideoLinks(base),
      normalizeCssUrls(base),
      normalizeHrefLinks(base)
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

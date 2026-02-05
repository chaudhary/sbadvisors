import { resolve } from "node:path";
import { defineConfig } from "vite";

function fixLegacyScripts() {
  return {
    name: "fix-legacy-scripts",
    transformIndexHtml(html) {
      let next = html.replace(
        /<script\b([^>]*\bsrc=["'])assets\/js\/github-pages\.js(["'][^>]*)>/gi,
        '<script$1/assets/js/github-pages.js$2>'
      );

      next = next.replace(
        /<script\b(?![^>]*\bdata-vite-ignore\b)(?![^>]*\btype=["']module["'])([^>]*\bsrc=["'])(\/?assets\/js\/[^"']+)(["'][^>]*)><\/script>/gi,
        (full, beforeSrc, src, afterSrc) => {
          const normalizedSrc = src.startsWith("assets/") ? `/${src}` : src;
          return `<script${beforeSrc}${normalizedSrc}${afterSrc} data-vite-ignore></script>`;
        }
      );

      return next;
    }
  };
}

export default defineConfig({
  base: "./",
  plugins: [fixLegacyScripts()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        about: resolve(__dirname, "about-us", "index.html"),
        accounting: resolve(
          __dirname,
          "accounting-finance-consulting-cfo-services-ras-al-khaimah-uae",
          "index.html"
        ),
        taxSupport: resolve(
          __dirname,
          "tax-support-corporate-tax-vat-consultancy-ras-al-khaimah-uae",
          "index.html"
        ),
        financialPlanning: resolve(
          __dirname,
          "financial-planning-cost-control-business-setup-ras-al-khaimah-uae",
          "index.html"
        ),
        compliance: resolve(
          __dirname,
          "compliance-aml-due-diligence-esr-risk-management-ras-al-khaimah-uae",
          "index.html"
        ),
        contact: resolve(__dirname, "contact-us", "index.html")
      }
    }
  }
});

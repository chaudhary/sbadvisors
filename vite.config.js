import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        about: resolve(__dirname, "about-us.html"),
        accounting: resolve(
          __dirname,
          "accounting-finance-consulting-cfo-services-ras-al-khaimah-uae.html"
        ),
        taxSupport: resolve(
          __dirname,
          "tax-support-corporate-tax-vat-consultancy-ras-al-khaimah-uae.html"
        ),
        financialPlanning: resolve(
          __dirname,
          "financial-planning-cost-control-business-setup-ras-al-khaimah-uae.html"
        ),
        compliance: resolve(
          __dirname,
          "compliance-aml-due-diligence-esr-risk-management-ras-al-khaimah-uae.html"
        ),
        contact: resolve(__dirname, "contact-us.html")
      }
    }
  }
});

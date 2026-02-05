/**
 * Syncs script blocks from index.html to all other page HTML files.
 * Ensures Elementor, jQuery, and other scripts work on every page.
 *
 * Usage: node scripts/sync-scripts-to-pages.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SOURCE = path.join(ROOT, "index.html");

// Page HTML files to update (relative to ROOT). Excludes index, feed, etc.
const TARGET_FILES = [
  "about-us/index.html",
  "accounting-finance-consulting-cfo-services-ras-al-khaimah-uae/index.html",
  "contact-us/index.html",
  "compliance-aml-due-diligence-esr-risk-management-ras-al-khaimah-uae/index.html",
  "financial-planning-cost-control-business-setup-ras-al-khaimah-uae/index.html",
  "tax-support-corporate-tax-vat-consultancy-ras-al-khaimah-uae/index.html",
];

// Extract blocks from index.html using markers
function extractBlocks(html) {
  // Head scripts: jquery through gtag inline (ends before <link rel="https://api.w.org/)
  const headStart = html.indexOf('<script src="/assets/js/wp-includes-js-jquery-jquery.min.js"');
  const headEnd = html.indexOf('</script>', html.indexOf('//# sourceURL=google_gtagjs-js-after'));
  const headEndTag = html.indexOf("</script>", headEnd) + "</script>".length;

  const headScripts =
    headStart >= 0 && headEndTag > headStart
      ? html.slice(headStart, headEndTag).trim()
      : "";

  // Body scripts: from speculationrules through last script before </body>
  const bodyStart = html.indexOf('<script type="speculationrules">');
  const bodyEnd = html.lastIndexOf("</script>", html.indexOf("</body>"));
  const bodyEndTag = bodyEnd + "</script>".length;

  const bodyScripts =
    bodyStart >= 0 && bodyEndTag > bodyStart
      ? html.slice(bodyStart, bodyEndTag).trim()
      : "";

  return { headScripts, bodyScripts };
}

function syncFile(filePath) {
  const fullPath = path.join(ROOT, filePath);
  if (!fs.existsSync(fullPath)) {
    console.log("  Skip (not found):", filePath);
    return false;
  }

  let html = fs.readFileSync(fullPath, "utf8");

  // Remove misplaced head scripts (e.g. between doctype and <html>)
  if (html.includes('id="jquery-core-js"') && html.indexOf("<head>") > html.indexOf('id="jquery-core-js"')) {
    html = html
      .replace(/<script src="\/assets\/js\/wp-includes-js-jquery-jquery\.min\.js"[^>]*><\/script>\s*/g, "")
      .replace(/<script src="\/assets\/js\/wp-includes-js-jquery-jquery-migrate\.min\.js"[^>]*><\/script>\s*/g, "")
      .replace(/<!-- Google tag[\s\S]*?<\/script>\s*/g, "");
  }

  const { headScripts, bodyScripts } = extractBlocks(
    fs.readFileSync(SOURCE, "utf8")
  );

  const hadBodyScripts = html.includes('id="page-scroll-to-id-plugin-script-js"');
  const hasHeadScriptsInHead = html.indexOf('id="jquery-core-js"') > 0 && html.indexOf("<head>") < html.indexOf('id="jquery-core-js"');

  // 1. Add head scripts right before </head> if not already there
  if (headScripts && !hasHeadScriptsInHead) {
    const headClose = html.indexOf("</head>");
    html =
      html.slice(0, headClose) +
      "\n\t" +
      headScripts +
      "\n" +
      html.slice(headClose);
  }

  // 2. Add body scripts before </body> if not present
  if (!hadBodyScripts) {
    const bodyClose = html.indexOf("</body>");
    const indent = bodyScripts.startsWith("\t") ? "" : "\n\t\t";
    html =
      html.slice(0, bodyClose) +
      indent +
      bodyScripts +
      "\n\n" +
      html.slice(bodyClose);
  }

  fs.writeFileSync(fullPath, html, "utf8");
  console.log("  Updated:", filePath);
  return true;
}

function main() {
  console.log("Syncing scripts from index.html to page files...\n");
  const { headScripts, bodyScripts } = extractBlocks(
    fs.readFileSync(SOURCE, "utf8")
  );
  if (!headScripts) console.warn("Warning: Could not extract head scripts.");
  if (!bodyScripts) console.warn("Warning: Could not extract body scripts.");
  let updated = 0;
  for (const f of TARGET_FILES) {
    if (syncFile(f)) updated++;
  }
  console.log("\nDone. Updated", updated, "file(s).");
}

main();

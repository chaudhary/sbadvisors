# SBA Advisors

Static multi-page marketing site for **Success Business Advisors** — accounting, tax, VAT & corporate services in Ras Al Khaimah, UAE. Built with **Jekyll**, shared Sass, and plain HTML/JS.

---

## Code structure

```
sbadvisors/
├── _config.yml              # Site title, URL, theme (minima), Jekyll defaults, Sass & assets config
├── _layouts/
│   └── default.html         # Wraps every page: <html>, <head> (meta, favicons, application.css), <body>{{ content }}{% include footer %}
├── _includes/
│   ├── header.html          # Shared nav; optional header_theme='dark' | 'light' (logo + nav links)
│   ├── footer.html          # Shared footer (e.g. partners carousel, links)
│   └── home-services-carousel.html  # Home page services carousel (data from _data)
├── _data/
│   ├── home_services_carousel.yml    # Home carousel items (title, url, background_image)
│   ├── footer_partners_carousel.yml # Footer “Who we work with” logos (src, alt)
│   └── faq.yml              # FAQ page Q&A (question, answer)
├── _sass/                   # Sass partials; compiled into assets/css/application.css
│   ├── _common.scss
│   ├── _header.scss
│   ├── _footer.scss
│   ├── _home_services_carousel.scss
│   └── _faq_page.scss
├── assets/
│   ├── css/
│   │   └── application.scss # Main entry; @imports all _sass partials
│   ├── js/                  # Scripts (e.g. wp-includes)
│   └── img/                 # Images, favicons, logos
├── index.html               # Homepage (layout: default, {% include header.html header_theme='dark' %}, home carousel)
├── about-us/index.html
├── contact-us/index.html
├── frequently-asked-questions/index.html
├── accounting-finance-consulting-cfo-services-ras-al-khaimah-uae/index.html
├── tax-support-corporate-tax-vat-consultancy-ras-al-khaimah-uae/index.html
├── financial-planning-cost-control-business-setup-ras-al-khaimah-uae/index.html
└── compliance-aml-due-diligence-esr-risk-management-ras-al-khaimah-uae/index.html
```

- **Pages**: Each section lives in its own folder with an `index.html`. All use `layout: default` and include the shared header (and homepage also includes `home-services-carousel.html`). The layout injects the footer.
- **Styling**: Single main stylesheet built from `assets/css/application.scss` → `_sass/*.scss`; output is `application.css` (cache-busted in the layout via `?v={{ site.time | date: '%s' }}`).
- **Content**: Carousels and FAQ content are driven by YAML in `_data/` so copy can be updated without editing HTML.
- **Theme**: Jekyll uses the `minima` theme; `jekyll-assets` is used for asset pipelines (CSS/JS/img).

---

## Local development

Install Ruby dependencies and run the Jekyll server:

```bash
bundle install
bundle exec jekyll serve
```

The site is built into `_site/` and served at **http://localhost:4000**.

Build only (no server):

```bash
bundle exec jekyll build
```

---

## Deployment

Deployment is handled by **GitHub Actions** (`.github/workflows/deploy.yml`):

- **Triggers**: Push to `main` or `jekyll`, or manual `workflow_dispatch`.
- **Steps**: Checkout → Ruby 3.3 + Bundler cache → `bundle exec jekyll build --trace` → upload `_site` as GitHub Pages artifact → deploy to the `github-pages` environment.

Custom domain (e.g. www.sbadvisors.ae) is configured in the GitHub repo (Pages settings / CNAME if present).

---

## Dependencies

- **Gemfile**: `github-pages` (Jekyll + plugins), `jekyll-assets`.
- **Node**: `node_modules` exists (e.g. Vite) but the live site is built purely with Jekyll; ensure `node_modules` is excluded from the build (as in `_config.yml`).

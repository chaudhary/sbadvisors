# sbadvisors

Static multi-page marketing site for SBA Advisors, built with **Jekyll** and
plain HTML/CSS/JS. The site is organized as a set of standalone pages with
shared assets under `assets/`.

## Structure

- `index.html` is the homepage (Jekyll page with front matter).
- Page folders such as `about-us/` and `contact-us/` contain their own
  `index.html` Jekyll pages.
- Shared styles, scripts, images, and video live under `assets/`.
- Shared header markup is defined once in `_includes/header.html` and pulled
  into pages with `{% include header.html %}`.
- Optional layouts live under `_layouts/` (currently `layout: null` is used so
  pages render their full HTML).

## Local development

Install Ruby dependencies and start the Jekyll dev server:

```bash
bundle install
bundle exec jekyll serve
```

This will build the site into `_site/` and serve it at
`http://localhost:4000` by default.

To build without serving:

```bash
bundle exec jekyll build
```

## Deployment

GitHub Pages deploys on every push to `main` via the Jekyll-based workflow in
`.github/workflows/deploy.yml`. The custom domain is configured through the
`CNAME` file in the repo root.

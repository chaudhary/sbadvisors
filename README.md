# sbadvisors

Static multi-page marketing site for SBA Advisors, built with Vite and plain
HTML/CSS/JS. The site is organized as a set of standalone pages with shared
assets under `assets/`.

## Structure

- `index.html` is the homepage.
- Page folders such as `about-us/` and `contact-us/` contain their own
  `index.html`.
- Shared styles, scripts, images, and video live under `assets/`.

## Development

Install dependencies and start the dev server:

```
npm install
npm run dev
```

Build the production site:

```
npm run build
```

Preview the production build:

```
npm run preview
```

## Deployment

GitHub Pages deploys on every push to `main` via the workflow in
`.github/workflows/deploy.yml`. The custom domain is configured through the
`CNAME` file in the repo root.

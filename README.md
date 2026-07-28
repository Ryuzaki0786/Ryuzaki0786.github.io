# Portfolio — Ekam Bhullar

Static site. No build step, no dependencies to install.

## Run locally
    python3 -m http.server 8000
Then open http://localhost:8000

## Deploy (GitHub Pages)
1. Create a repo named `Ryuzaki0786.github.io` (user site — lives at the root domain).
2. Push these files to the `main` branch.
3. Settings → Pages → Source: `main` / root.
4. Live at https://Ryuzaki0786.github.io within a minute or two.

If you use any other repo name instead, the site works fine but lives at
`https://Ryuzaki0786.github.io/<repo>/`. All internal links are relative, so this works either way.

## Before publishing — replace these
Search for `data-edit` in the HTML. Three placeholders:
- `about.html` — LinkedIn URL
- `about.html` — email address
- `writing.html` — Medium article URL

Also confirm the repo links on `projects.html` point at the right URLs
(esh, chatserver, exoplanet-db currently point at the profile root).

## Files
    index.html      home
    about.html      background, current work, reading, contact
    projects.html   five projects
    writing.html    essays
    assets/style.css
    assets/app.js   lattice simulation, router, motion

## The background
A 2D wave equation solved live on a perspective-projected mesh:

    u[i,j]^(n+1) = 2u^n - u^(n-1) + r^2 (u[i+1,j] + u[i-1,j] + u[i,j+1] + u[i,j-1] - 4u[i,j])

Leapfrog finite differences, r = 0.5 (2D CFL requires r <= 1/sqrt(2)), Dirichlet
edges so pulses reflect inverted. Click the background to perturb the field.
Tuning constants live at the top of the `Lattice` module in `app.js`.

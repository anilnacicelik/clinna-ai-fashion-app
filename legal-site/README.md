# Clinna Legal Pages — GitHub Pages Setup

This folder contains the static Privacy Policy and Terms of Service pages for the Clinna app, ready to publish via GitHub Pages.

Target URLs (already wired into `mobile/src/config/legal.ts`):

- `https://anilnacicelik.github.io/clinna-legal/` (landing)
- `https://anilnacicelik.github.io/clinna-legal/privacy.html`
- `https://anilnacicelik.github.io/clinna-legal/terms.html`

GitHub Pages serves user/project pages at `https://<username>.github.io/<repo-name>/`, so these files need to live in a **separate repository named `clinna-legal`** under your GitHub account (`anilnacicelik`) — not inside this app's monorepo.

## Steps

1. **Create the repository**
   On GitHub, create a new repository named exactly `clinna-legal` under the `anilnacicelik` account. Public repo (GitHub Pages on the free tier requires the repo to be public, unless you're on GitHub Pro/Team/Enterprise).

2. **Copy these files into the new repo's root**
   Copy `index.html`, `privacy.html`, and `terms.html` from this folder into the root of the new `clinna-legal` repo (not inside a subfolder — GitHub Pages defaults to serving from the repo root).

3. **Push to GitHub**
   ```bash
   cd clinna-legal
   git init
   git add index.html privacy.html terms.html
   git commit -m "Add Clinna privacy policy and terms of service"
   git branch -M main
   git remote add origin https://github.com/anilnacicelik/clinna-legal.git
   git push -u origin main
   ```

4. **Enable GitHub Pages**
   - Go to the repo on GitHub → **Settings** → **Pages** (left sidebar).
   - Under **Build and deployment** → **Source**, select **Deploy from a branch**.
   - Under **Branch**, select `main` and folder `/ (root)`, then **Save**.
   - GitHub will build and publish the site — this usually takes 1–2 minutes. The page will show the live URL once ready (`https://anilnacicelik.github.io/clinna-legal/`).

5. **Verify the links**
   Open all three URLs in a browser and confirm they load correctly on both desktop and mobile widths:
   - `https://anilnacicelik.github.io/clinna-legal/`
   - `https://anilnacicelik.github.io/clinna-legal/privacy.html`
   - `https://anilnacicelik.github.io/clinna-legal/terms.html`

6. **Done** — `mobile/src/config/legal.ts` already points at these URLs, so the in-app "Privacy Policy" / "Terms of Service" buttons on the Home screen will open them once the site is live.

## Updating content later

The source of truth for the legal text is `mobile/legal/privacy-policy.md` and `mobile/legal/terms-of-service.md` in the main app repo. If you edit those, manually re-apply the same changes to `privacy.html` / `terms.html` here (the HTML is a hand-converted copy, not auto-generated), then commit and push to `clinna-legal` — GitHub Pages redeploys automatically on every push to `main`.

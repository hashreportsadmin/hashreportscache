# HashREPORTS — Vite + React

This is your original Trickle-generated app, migrated from the browser-Babel
setup into a proper Vite build. What changed and why:

## What was slowing the site down
The old `index.html` loaded React, Babel, Tailwind's CDN JIT compiler,
Chart.js, Face-API, Tesseract.js and Supabase as separate scripts, then
compiled ~8,000 lines of your JSX *in the visitor's browser* on every visit,
before anything could render. That's the white screen.

## What this project does instead
- All components are real ES modules (`.jsx`) that import each other directly.
- Vite + esbuild compile everything **once, at build time** (`npm run build`),
  so what ships to the browser is plain, already-optimized JavaScript.
- Tailwind is compiled at build time too (no more in-browser CDN JIT compiler).
- **Chart.js and Tesseract.js have been removed** — they were loaded on every
  page load but never actually used anywhere in your code. That alone was
  extra dead weight on every visit.
- Face-API is kept as a plain `<script defer>` tag in `index.html`, since it's
  a large ML library that loads its own model files at runtime regardless of
  bundler — there's no build-time benefit to importing it as an npm package,
  and `defer` keeps it from blocking initial render. It's only used in the
  sign-up face-capture step.
- Icons still use the lucide-static icon font (tiny CSS file), same as before.

## Running it locally
```bash
npm install
npm run dev       # local dev server
npm run build     # production build -> dist/
npm run preview   # preview the production build locally
```

## Deploying to Vercel
1. Push this folder's contents to your GitHub repo (replacing the old files).
2. In Vercel, it will auto-detect the Vite framework. Build command
   `npm run build`, output directory `dist` (Vercel fills these in
   automatically — you shouldn't need to change anything).
3. Deploy. The white-screen delay should be gone — the browser now gets
   pre-compiled JS/CSS instead of compiling your app live.

## One thing worth double-checking
`src/utils/db.jsx` has your Supabase anon key hardcoded, same as the original.
That's normal for a client-side app (the anon key is meant to be public), but
it's only safe if Row Level Security policies are properly locked down on
your Supabase tables — worth a quick check in your Supabase dashboard if you
haven't already confirmed this.

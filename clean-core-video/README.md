# clean-core.io — LinkedIn Video (Remotion)

A ~30s, brand-accurate spot that carries the narrative cleanly: **deterministic, transparent
coverage, honest limitations** — and drives registration. Text-driven (LinkedIn autoplays muted).

## Storyboard (30s @ 30fps, 1080×1080)

| # | Time | Scene | Message |
|---|------|-------|---------|
| 1 | 0–3s | Hook | Wordmark + "The SAP Architect's Clean Core Accelerator" · "Free for the SAP community" |
| 2 | 3–9s | Morph | Legacy ABAP → Clean-Core TypeScript, with a ✅ "released CDS view" marker — *deterministic, not guessed* |
| 3 | 9–15s | Coverage | ✅ Fully · ⚠️ Review · ❌ Out of scope — *transparent coverage* |
| 4 | 15–20s | Honesty | "Honest limitations — we tell you what to hand to an expert" (the trust beat) |
| 5 | 20–25s | Live | Product frame with the Coverage Verdict + "run an analysis in minutes" (drop real footage here) |
| 6 | 25–30s | CTA | "Belegt, nicht behauptet · Accelerator with a trust guarantee" → **Start free → clean-core.io** |

Benefits **and** limitations are both on screen (scenes 2–4) — that honesty *is* the differentiator,
so it's foregrounded, not hidden.

## Setup (recommended path)

Remotion versions must match across all `@remotion/*` packages, so the safest route is to scaffold a
blank project and drop these three files into `src/`:

```bash
npx create-video@latest --blank clean-core-video   # answer prompts (or add -y)
cd clean-core-video
# replace the generated src/ with the files from this package:
#   src/index.ts   src/Root.tsx   src/CleanCoreVideo.tsx
cp -r <this-folder>/src/* src/
cp -r <this-folder>/public/* public/    # optional (screen recordings)
npm run dev        # opens Remotion Studio (live, scrubbable preview)
```

(Alternatively use the included `package.json` and run `npm install` — but pin all remotion packages
to the same version if you hit a version-mismatch warning.)

## Add your live-software footage (scene 5)

1. Screen-record the **analyze** / **design** pages (a clean 5–8s clip each; 1080p, no cursor jitter).
2. Save as `public/screens/analyze.mp4`.
3. In `src/CleanCoreVideo.tsx`, in `S5Live`, replace the mock block with the commented line:
   ```tsx
   <OffthreadVideo src={staticFile('screens/analyze.mp4')} style={{ width: '100%', display: 'block' }} muted />
   ```
   and uncomment the `OffthreadVideo` / `staticFile` imports at the top.

The video renders fine **without** footage (scene 5 has a polished mock), so you can ship first and
swap real clips in later.

## Render

```bash
npm run render                 # → out/clean-core.mp4       (30s, 1080×1080, full narrative)
npm run render:short           # → out/clean-core-15s.mp4   (15s, 1080×1080, core + fast CTA)
npm run render:vertical        # → out/clean-core-vertical.mp4 (30s, 1080×1920, stories/mobile)
```

**Which cut?** Use the **15s** (`CleanCoreShort`) for cold reach and top-of-feed — it hits
deterministic morph → transparent coverage (incl. ⚠️/❌ limitations) → CTA in four beats and reaches
the CTA at ~10s. Use the **30s** when the audience is warmer and you want the honesty beat + live
product on screen.

## LinkedIn tips

- **Square (1080×1080)** wins in-feed; vertical for mobile-first reach. Both compositions are included.
- Keep the H1/wordmark as real motion (it is) — no stock footage, matches the "no gloss" positioning.
- Add **burned-in captions** if you later add a voiceover; the current cut is caption-first so it works
  muted out of the box.
- First 3 seconds decide completion — the hook + green wordmark do the heavy lifting; don't add a slow intro.

## Suggested post copy (in your narrative)

> Most "AI migrates your ABAP" tools show you a fairy-tale 100% transformation.
> We show you the honest one.
>
> clean-core.io turns legacy ABAP into a Clean-Core-compliant draft — deterministically, with
> transparent coverage: what's fully mapped, what needs an architect's review, and what's out of scope.
> Belegt, nicht behauptet.
>
> An accelerator with a trust guarantee — not a migration button. Free for the SAP community.
> → clean-core.io

## Fonts (optional polish)

The video uses a bold system stack by default. For pixel-parity with the site, install the brand fonts:
```bash
npm i @remotion/google-fonts
```
and load Archivo/Inter at the top of `CleanCoreVideo.tsx` (see remotion.dev/docs/fonts).

## License note

Remotion is free for individuals and small teams but **requires a company license above a certain team
size** — check https://remotion.dev/license before using it commercially for the company.

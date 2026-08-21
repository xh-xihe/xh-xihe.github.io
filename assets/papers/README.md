# Paper figures

Thirteen of these are **the real figure lifted from the paper itself**, stored as
WebP at 520px wide (about 2.4x the 220px column on the page):

| file | taken from |
|---|---|
| `t-variance` `t-qcode-agents` `t-fusion` `t-metrology` `t-qtca` `t-qcda` `t-qsa` `t-qca` `t-qlle` `t-citnet` | the arXiv version of each paper |
| `t-pat-ridge` `t-pat-filter` `t-pat-omt` | the drawing sheets of the Chinese utility patents, via Google Patents |

Seven papers have **no obtainable figure** and use a hand-drawn schematic that
lives in the sprite at the bottom of `index.html`: four are paywalled with no
preprint (ICASSP, IEEE PRAI, ACM CACML, Elsevier, plus IEEE AP-S) and two are APS
March Meeting abstracts, which carry no figures at all.

`_drawn-originals.svg` keeps every drawing that a real figure replaced, so nothing
was lost. To put one back, paste its `<symbol>` into the sprite in `index.html`
and restore the `<svg><use href="#t-xxx"/></svg>` wrapper.

## Replacing a figure

```html
<img src="assets/papers/t-fusion.webp" alt="" loading="lazy" decoding="async"
     width="520" height="161">
```

Any aspect ratio works — the column is a fixed 220px wide and the height follows
the image, clamped to 88-200px with `object-fit: contain`, so nothing is cropped.
Keep `width`/`height` matching the file so the page does not jump while loading;
`python .preview/audit.py` checks that for you.

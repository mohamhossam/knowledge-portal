# Proposed additions to PRODUCT.md (GATE 1b)

These are additions only; nothing existing is removed or reworded. PRODUCT.md is not edited
until the user approves at GATE 1b.

## 1. New section after "Product Principles": "Success Signals"

```markdown
## Success Signals

How we know the curation desk is working. User metrics are hypotheses until measured; see
`docs/ux/research/synthesis.md` §8 for targets and how each is checked.

- **Reviewed means seen.** Every approval records how much a person actually looked at, and
  nothing AI-proposed is accepted in bulk without the set being inspectable.
- **Yours first.** A curator with five minutes reaches the most urgent item that needs them in
  one step from any page.
- **Consequence in view.** Every withdraw, replace, publish and put-back shows its dependants or
  mapping impact beside the action, before the commit.
- **Provenance in one step.** From any published fact or change, one step reaches who decided it
  and which passage, document version and release it came from.
- **Calm over long sessions.** A 60-minute review burst does not rely on colour alone, never
  loses the reviewer's place, and stays readable at 200% zoom.
- **Usability targets** (to be measured with the benchmark in `docs/ux/research/plan.md`):
  - task success of at least 90% on top tasks;
  - an SEQ of at least 5.5;
  - a SUS of at least 75.
```

## 2. "Users": one line linking the personas

Add at the end of the section:

```markdown
Working proto-personas (hypotheses until research is run) and jobs to be done:
`docs/ux/research/synthesis.md` §3–4.
```

## 3. "Brand Commitments": record the e& calm brand

Add as a new bullet:

```markdown
- **Brand: e& in calm mode.**
  - Mostly calm neutrals (white and beige-derived tints, warm greys), with maroon for actions,
    selection and focus.
  - e& red only as a brand accent: the logo, the active-navigation marker, and at most one focal
    accent per view. Never for status, errors or alerts.
  - Status uses its own low-saturation colours, always with an icon and words.
  - Flat surfaces; motion of 200 ms or less.
  - Brand values are the redesign brief's e& primitives, unverified against official guidelines
    (none are available). Fonts are self-hosted, because there is no e& font licence.
  - Details live in DESIGN.md.
```

## Why these and nothing more

- **Success Signals** gives later phases a product-level definition of "done" that the
  benchmark and critique can check.
- **The personas link** keeps PRODUCT.md short while pointing to who we design for.
- **The brand line** records a commitment the user made (the e& calm brief) where future work
  will look first.
- **Untouched:** the principles, capabilities, access rules and evidence statement. They are
  already right, and they outrank the design.

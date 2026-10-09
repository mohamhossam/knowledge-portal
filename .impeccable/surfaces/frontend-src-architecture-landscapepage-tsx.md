---
version: 1
slug: "frontend-src-architecture-landscapepage-tsx"
primary_target: "frontend/src/architecture/LandscapePage.tsx"
related_targets: ["frontend/src/architecture/OfferingPage.tsx","frontend/src/architecture/JourneyPage.tsx","frontend/src/design-lab/catalogue/CatalogueLab.tsx"]
---

# Architecture catalogue (Landscape, Product, Product › Architecture, Journey flow)

**Mode:** Operate. Architects, integration and order-management teams curate and read the SMB
architecture; desktop, daylight office, long sessions and quick check-ins.

**Job:** see the whole SMB architecture at once, then one product's footprint on it: which
systems a journey touches, how they talk, in what order, with provenance one step away.

**User decisions (2026-10-09):** e& calm rules relaxed for the catalogue; no dark theme;
Landscape is a hero page with no product bar; each product gets an Architecture tab with the
journey's systems highlighted; Products is a main section; mock-ups first, in the dev-only lab,
on real Business Pro Plus data. Direction chosen: impeccable's pick.

## Direction contract

THESIS: The catalogue is the architect's layered wall poster, made live: notation-coloured layer
bands, systems as components, integrations drawn as lines, so "what talks to what" is seen, not
read. It refuses the category default of card grids with chip lists under a dropdown filter bar.

OWN-WORLD: White page under the maroon e& shell. Layer bands in e& calm tones, soft tints of the
brand's own family only (beige, red blush, warm stone, sand, maroon mist, light grey), each with a
2px top edge in a deeper tone of its own; the integration layer is an e& maroon spine. Systems are
white component boxes with a 1px ink frame and the component glyph; external systems dashed.
Connectors are orthogonal ink lines in the gutters, maroon when selected. Archivo condensed
labels, tabular counts. e& red only on the logo and one focal accent (the current journey step).
(Palette changed 2026-10-09 at the user's request: e& branding colours in calm mode, replacing
the notation tints.)

STORY: The architect understands the whole estate in one poster, picks a system or a product
journey, and sees exactly which systems light up and how they connect; the evidence behind each
fact is one click away.

FIRST VIEWPORT: Landscape: a one-line title with counts, view chips (not dropdowns), the poster at
about three quarters of the width with its connector layer visible, an inspector column on the
right; the products built on it as a band under the poster. Product: a hero with the value
proposition beside a drawn bundle of its components, then customer value and the plans compared.
Product › Architecture: journey chips, the same poster with only the journey's systems lit and its
calls numbered in order, a step-through control. Journey flow: the BPMN swimlanes fill the
viewport, lanes tinted by the system's layer, step detail in a side panel.

FORM: Layered Architecture Poster, first on the ordered list (impeccable's pick); seed key b430c650.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Open decisions

- Prices: the SDD gives none; shown as gaps, never invented.
- Felix vs IBM BPM overlap and the 8 proposed placements stay visible as governance marks.

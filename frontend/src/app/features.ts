/**
 * Build-time switches, read in one place. The bundler folds a switch only inside
 * the module that reads it, so code a switch keeps out of the bundle is imported
 * here, beside the switch (the lab's loader), never behind an imported flag.
 */

/**
 * The catalogue redesign (Knowledge Hub V1): on under the dev server, and in a
 * build made with VITE_CATALOGUE_LAB=true (`deploy/web/Dockerfile` takes it as a
 * build argument, false by default). Published images leave it out.
 */
export const catalogueLabEnabled: boolean = import.meta.env.DEV || import.meta.env.VITE_CATALOGUE_LAB === "true";

/** The lab's code, or null where it is off: then the import is dead code and the lab never reaches the bundle. */
export const loadCatalogueLab = catalogueLabEnabled ? () => import("../design-lab/catalogue/CatalogueLab") : null;

/** Where the catalogue redesign lives, under the app's base path. */
export const LAB = "/design-lab/catalogue";

/** Where the lab starts reading: "sample" only when asked for by name; anything else, the API. */
export const catalogueSourceSetting: "api" | "sample" = import.meta.env.VITE_CATALOGUE_SOURCE === "sample" ? "sample" : "api";

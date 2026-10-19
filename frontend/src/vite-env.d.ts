/// <reference types="vite/client" />

/** The app's own build-time settings (`import.meta.env`); see app/features.ts. */
interface ImportMetaEnv {
  /** "true" builds the catalogue redesign lab into a production build. */
  readonly VITE_CATALOGUE_LAB?: string;
  /** "sample" makes the lab start on the bundled sample instead of the API. */
  readonly VITE_CATALOGUE_SOURCE?: string;
}

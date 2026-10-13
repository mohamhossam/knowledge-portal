import { BASE } from "../auth/paths";

/** A diagram node's address as the browser needs it: the app's own path under the build's base. */
export const diagramHref = (path: string) => `${BASE}${path}`;

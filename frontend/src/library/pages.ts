/**
 * The library's pages, as one chunk loaded when a library route is first
 * opened (App.tsx), so the legacy and rebuilt areas don't all ship in the
 * entry chunk (area 1 backlog: lazy route groups).
 */
export { CitationsPage } from "./CitationsPage";
export { DocumentPage, MainPage } from "./DocumentPage";
export { LibraryPage } from "./LibraryPage";
export { OwnershipPage } from "./OwnershipPage";
export { SearchPage } from "./SearchPage";
export { VersionsPage } from "./VersionsPage";

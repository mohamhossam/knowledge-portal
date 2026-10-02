import type { Column } from "../timetable/TimetableTable";

/** The portal's three tables: their numbers, titles, addresses and columns. */
export type TableSpec = {
  number: 1 | 2 | 3;
  title: string;
  to: string;
  noun: string;
  /** What the table's totals count. */
  totalsLabel: string;
  columns: Column[];
  quiet: string;
};

export const TABLES = {
  library: {
    number: 1,
    title: "Library",
    to: "/library",
    noun: "the library",
    totalsLabel: "In the library",
    quiet: "No document is waiting on a curator.",
    columns: [
      { key: "name", label: "Document" },
      { key: "status", label: "Status" },
      { key: "version", label: "Version", align: "end", priority: 2 },
      { key: "owner", label: "Owner", priority: 3 },
      { key: "since", label: "Since", align: "end", priority: 2 },
    ],
  },
  architecture: {
    number: 2,
    title: "Architecture catalogue",
    to: "/architecture",
    noun: "the architecture catalogue",
    totalsLabel: "In the edition in force",
    quiet: "No draft release is in preparation.",
    columns: [
      { key: "name", label: "Draft release" },
      { key: "status", label: "Status" },
      { key: "preparedBy", label: "Prepared by", priority: 3 },
      { key: "systems", label: "Systems", align: "end", priority: 2 },
      { key: "revision", label: "Revision", align: "end", priority: 3 },
    ],
  },
  squads: {
    number: 3,
    title: "Squad catalogue",
    to: "/squads",
    noun: "the squad catalogue",
    totalsLabel: "In the squad catalogue",
    quiet: "Every system in force has an owning squad.",
    columns: [
      { key: "name", label: "System in force with no owning squad" },
      { key: "id", label: "Catalogue id", priority: 2 },
    ],
  },
} satisfies Record<string, TableSpec>;

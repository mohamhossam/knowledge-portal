/**
 * How the library says where a passage sits and what it holds, in the reader's
 * words (docs/ux/content): "Sheet 1, row 2", never "Worksheet 1!2:2"; a table
 * row as labelled cells, never "A2=… | B2=…" (backlog O-3).
 */

/** Locations in words. A hidden sheet says so once, beside the sheet. */
export function humanWhere(where: string): string {
  return where
    .replace(/^Hidden worksheet: Worksheet (\d+)(?: › )?Worksheet \1!(\d+):\d+$/, "Sheet $1 (hidden), row $2")
    .replace(/^Hidden worksheet: Worksheet (\d+)$/, "Sheet $1 (hidden)")
    .replace(/Worksheet (\d+)!(\d+):(\d+)/g, (_, sheet: string, from: string, to: string) =>
      from === to ? `Sheet ${sheet}, row ${from}` : `Sheet ${sheet}, rows ${from} to ${to}`)
    .replace(/Worksheet (\d+)/g, "Sheet $1")
    // A text file's neutral heading positions are navigation, not content: its line says where.
    .replace(/^Heading at line \d+ › /, "");
}

/**
 * The location a passage belongs to, for selecting a whole sheet or page at once
 * (backlog O-2): "Sheet 2 (hidden)" for "Sheet 2 (hidden), row 4".
 */
export function locationGroup(where: string): string {
  const human = humanWhere(where);
  return human.split(/, rows? | › /)[0] ?? human;
}

export type Cell = { column: string; row: number; value: string };

const CELL = /^([A-Z]{1,3})(\d+)=([\s\S]*)$/;

/** A worksheet row's cells, when the text is the reader's "A2=… | B2=…" form; null otherwise. */
export function tableCells(text: string): Cell[] | null {
  const parts = text.split(" | ");
  const cells: Cell[] = [];
  for (const part of parts) {
    const match = CELL.exec(part);
    if (!match) return null;
    cells.push({ column: match[1]!, row: Number(match[2]), value: match[3]!.trim() });
  }
  return cells.length > 0 ? cells : null;
}

/**
 * Each sheet's column headings, from its first row ("A1=Product | B1=Segment"),
 * keyed by sheet ("Sheet 1") then column ("A"). A sheet without a first row has none.
 */
export function sheetHeadings(rows: { where: string; text: string | null }[]): Map<string, Map<string, string>> {
  const sheets = new Map<string, Map<string, string>>();
  for (const row of rows) {
    const cells = row.text ? tableCells(row.text) : null;
    if (!cells || cells[0]?.row !== 1) continue;
    sheets.set(locationGroup(row.where), new Map(cells.map((cell) => [cell.column, cell.value])));
  }
  return sheets;
}

/** A row's cells, each with its column heading where the sheet has one ("Product"), else its column ("Column A"). */
export function labelledCells(text: string, where: string, headings: Map<string, Map<string, string>>): { label: string; value: string }[] | null {
  const cells = tableCells(text);
  if (!cells || cells[0]?.row === 1) return null;
  const names = headings.get(locationGroup(where));
  return cells.map((cell) => ({ label: names?.get(cell.column) || `Column ${cell.column}`, value: cell.value }));
}

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC]/gu;
const LATIN = /[A-Za-z\u00C0-\u024F]/gu;

/**
 * The language of a piece of content, for `lang` (backlog K2), so a screen
 * reader picks the right voice. Library documents carry no language field, so
 * this is a HYPOTHESIS heuristic: Arabic when most of its letters are Arabic,
 * otherwise unknown (it inherits the page's English). A search result's own
 * `language` is used instead where the API gives one.
 */
export function contentLang(text: string | null | undefined): "ar" | undefined {
  if (!text) return undefined;
  const arabic = text.match(ARABIC)?.length ?? 0;
  const latin = text.match(LATIN)?.length ?? 0;
  return arabic > latin ? "ar" : undefined;
}

/** The API's language code for a search result, as `lang`: "ar" or "en", never "mixed". */
export function langOf(language: string | null | undefined, text: string): string | undefined {
  if (language === "ar" || language === "en") return language;
  return contentLang(text);
}

/** "1 passage", "3 passages". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en")} ${n === 1 ? one : many}`;
}

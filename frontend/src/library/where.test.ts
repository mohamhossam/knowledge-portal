import { describe, expect, it } from "vitest";

import { contentLang, humanWhere, labelledCells, langOf, locationGroup, sheetHeadings, tableCells } from "./where";

describe("locations in words", () => {
  it("says sheets and rows, never the reader's cell notation", () => {
    expect(humanWhere("Worksheet 1!2:2")).toBe("Sheet 1, row 2");
    expect(humanWhere("Worksheet 3!4:9")).toBe("Sheet 3, rows 4 to 9");
    expect(humanWhere("Worksheet 1")).toBe("Sheet 1");
    expect(humanWhere("Hidden worksheet: Worksheet 2 › Worksheet 2!1:1")).toBe("Sheet 2 (hidden), row 1");
    expect(humanWhere("Hidden worksheet: Worksheet 2")).toBe("Sheet 2 (hidden)");
    expect(humanWhere("Heading at line 1 › Line 4")).toBe("Line 4");
    expect(humanWhere("Page 3")).toBe("Page 3");
  });

  it("groups passages by sheet, for selecting one whole (O-2)", () => {
    expect(locationGroup("Worksheet 1!2:2")).toBe("Sheet 1");
    expect(locationGroup("Hidden worksheet: Worksheet 2 › Worksheet 2!1:1")).toBe("Sheet 2 (hidden)");
    expect(locationGroup("Slide 4")).toBe("Slide 4");
  });
});

describe("table rows as labelled cells (O-3)", () => {
  const rows = [
    { where: "Worksheet 1!1:1", text: "A1=Product | B1=Segment | C1=Rule" },
    { where: "Worksheet 1!2:2", text: "A2=Bundle 001 | B2=SMB | C2=Eligible where XGPON coverage is confirmed" },
  ];

  it("reads the cells of a worksheet row, and nothing else", () => {
    expect(tableCells("A2=Bundle 001 | B2=SMB")).toEqual([{ column: "A", row: 2, value: "Bundle 001" }, { column: "B", row: 2, value: "SMB" }]);
    expect(tableCells("Quote the bundle only after coverage | the port are confirmed.")).toBeNull();
  });

  it("labels each cell with its sheet's heading, or its column where there is none", () => {
    const headings = sheetHeadings(rows);
    expect(labelledCells(rows[1]!.text, rows[1]!.where, headings)).toEqual([
      { label: "Product", value: "Bundle 001" },
      { label: "Segment", value: "SMB" },
      { label: "Rule", value: "Eligible where XGPON coverage is confirmed" },
    ]);
    expect(labelledCells("A5=Floor | D5=Ceiling", "Worksheet 4!5:5", headings)).toEqual([
      { label: "Column A", value: "Floor" },
      { label: "Column D", value: "Ceiling" },
    ]);
    // The headings row itself is not relabelled.
    expect(labelledCells(rows[0]!.text, rows[0]!.where, headings)).toBeNull();
  });
});

describe("the language of content (K2, HYPOTHESIS heuristic)", () => {
  it("says Arabic only when most letters are Arabic", () => {
    expect(contentLang("سياسة التحقق من العنوان (sample)")).toBe("ar");
    expect(contentLang("XGPON coverage rules (sample)")).toBeUndefined();
    expect(contentLang("Bundle 001 · باقة")).toBeUndefined();
    expect(contentLang("")).toBeUndefined();
  });

  it("prefers the language the API gives, but never 'mixed'", () => {
    expect(langOf("en", "يجب")).toBe("en");
    expect(langOf("mixed", "يجب التحقق من هوية العميل")).toBe("ar");
  });
});

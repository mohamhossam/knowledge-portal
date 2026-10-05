import { describe, expect, it } from "vitest";

import { documentParts, type DocModel } from "./wordml";

const AT = new Date("2026-10-05T15:00:00Z");
const MODEL: DocModel = {
  title: "Business Pro Plus: New Activation, through Online",
  subject: "bpp · NEW · online",
  keywords: ["Business Pro Plus"],
  blocks: [
    { t: "cover", product: "Business Pro Plus", scenario: "New Activation · Online", rows: [["Offering", "Business Pro Plus"]], note: "Generated." },
    { t: "h1", text: "Document Control" },
    { t: "toc" },
    { t: "h1", text: "1. Executive Summary" },
    { t: "h2", text: "1.1 Business context" },
    { t: "p", text: `Fibre & 5G <backup>${String.fromCharCode(1)}` },
    { t: "table", cols: [{ label: "Fact", w: 50 }, { label: "Confidence", w: 50 }], rows: [["Step 4", { text: "Gap", confidence: "gap" }], ["اسم النظام", "Confirmed"]] },
    { t: "callout", kind: "gap", title: "Not said yet", text: "Step 4 names no system." },
    { t: "h1", text: "17. Complete End-to-End Journey" },
    { t: "table", cols: [{ label: "Step", w: 10 }], rows: [["1"]], landscape: true, small: true },
    { t: "h2", text: "5G SIM replacement" },
    { t: "image", png: new Uint8Array([137, 80, 78, 71]), w: 200, h: 100, alt: "Overview of the scenario", caption: "Figure 1" },
  ],
};

describe("the Word package", () => {
  const parts = documentParts(MODEL, AT);
  const document = parts["word/document.xml"] as string;

  it("holds every part a Word document needs, the content types first", () => {
    expect(Object.keys(parts)[0]).toBe("[Content_Types].xml");
    for (const part of ["_rels/.rels", "word/_rels/document.xml.rels", "word/styles.xml", "word/numbering.xml", "word/header1.xml", "word/footer1.xml", "docProps/core.xml", "word/media/image1.png"]) {
      expect(parts[part], part).toBeDefined();
    }
    expect(parts["word/_rels/document.xml.rels"]).toContain('Target="media/image1.png"');
    expect(parts["docProps/core.xml"]).toContain("<dc:title>Solution Architecture: Business Pro Plus: New Activation, through Online</dc:title>");
    expect(parts["word/footer1.xml"]).toMatch(/PAGE.*NUMPAGES/);
  });

  it("escapes text, drops characters XML forbids, and sets Arabic right to left", () => {
    expect(document).toContain("Fibre &amp; 5G &lt;backup&gt;</w:t>");
    expect(document).not.toContain(String.fromCharCode(1));
    expect(document).toMatch(/<w:bidi\/>.*<w:rtl\/><\/w:rPr><w:t xml:space="preserve">اسم النظام/);
  });

  it("sets a gap in red and bold, and a section with a wide table landscape", () => {
    expect(document).toContain('<w:shd w:val="clear" w:color="auto" w:fill="FBEAEC"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="TableText"/></w:pPr><w:r><w:rPr><w:b/><w:bCs/><w:color w:val="B3122B"/>');
    expect(document).toMatch(/w:orient="landscape".*17\. Complete End-to-End Journey|17\. Complete End-to-End Journey[\s\S]*w:orient="landscape"/);
    expect(document.match(/<w:sectPr>/g)!.length).toBe(2);
  });

  it("lists only numbered headings in the contents, not a title that starts with a digit", () => {
    const contents = document.slice(document.indexOf("TOC \\o"), document.indexOf('w:fldCharType="end"'));
    expect(contents).toContain("1. Executive Summary");
    expect(contents).toContain("1.1 Business context");
    expect(contents).not.toContain("5G SIM replacement");
  });
});

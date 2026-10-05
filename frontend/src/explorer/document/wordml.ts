/**
 * A Solution Architecture document's blocks as the parts of a Word package
 * (requirement-portal ADR-0101, step 6), ported from the original explorer's
 * `renderDocxParts`. The look is the Timetable Book's: ink on stock, rules for
 * structure, rank carried by weight; red is kept for a gap, as on screen.
 */
import type { Offering, SourceConfidence } from "../../api/client";

type NfrCoverage = NonNullable<Offering["nfrs"]>[number]["coverage"];

/** A table cell: plain text, or text whose confidence or coverage sets its weight. */
export type DocCell = string | { text: string; confidence?: SourceConfidence | null; coverage?: NfrCoverage | null; due?: boolean };
export type DocColumn = { label: string; w: number };
export type DocTable = {
  t: "table";
  cols: DocColumn[];
  rows: DocCell[][];
  /** Wide enough that its whole top-level section is set landscape. */
  landscape?: boolean;
  small?: boolean;
  /** The first column names its row, on the band. */
  firstColShade?: boolean;
  noHead?: boolean;
};
export type DocBlock =
  | { t: "cover"; product: string; scenario: string; rows: [string, string][]; note: string }
  | { t: "h1" | "h2" | "h3"; text: string }
  | { t: "p"; text: string; muted?: boolean }
  | { t: "ul"; items: string[] }
  | DocTable
  | { t: "callout"; kind: "gap" | "decision" | "carry"; title: string; text: string }
  | { t: "image"; png: Uint8Array; w: number; h: number; alt: string; caption: string }
  | { t: "toc" };

export type DocModel = {
  title: string;
  blocks: DocBlock[];
  /** What the package's properties say: its subject and keywords. */
  subject: string;
  keywords: string[];
};

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
// The Timetable Book's tokens (styles/tokens.css), as Word colours.
const INK = "16181D";
const INK_2 = "474C55";
const INK_3 = "686E78";
const RULE = "CFD2D6";
const BAND = "F1F1EE";
const RED = "B3122B";
const RED_WASH = "FBEAEC";
const FACE = "Arial";
const PORTRAIT = { w: 11906, h: 16838, content: 11906 - 2 * 1134, landscape: false };
const LANDSCAPE = { w: 16838, h: 11906, content: 16838 - 2 * 1134, landscape: true };
type Page = typeof PORTRAIT;

// Characters XML 1.0 does not allow, which a pasted source can carry.
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN = /[A-Za-z]/;

/** Text safe inside an XML element or attribute. */
export function xmlText(value: unknown): string {
  return String(value ?? "")
    .replace(FORBIDDEN, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Whether a line reads right to left: its first strong letter is Arabic. */
function rightToLeft(text: string): boolean {
  for (const char of text) {
    if (ARABIC.test(char)) return true;
    if (LATIN.test(char)) return false;
  }
  return false;
}

type RunStyle = { b?: boolean; i?: boolean; color?: string; sz?: number; caps?: boolean };

function run(text: string, style: RunStyle = {}): string {
  return String(text ?? "")
    .split("\n")
    .map((line, index) => {
      const rtl = rightToLeft(line);
      const props = [
        style.b && "<w:b/><w:bCs/>",
        style.i && "<w:i/>",
        style.caps && "<w:caps/>",
        style.color && `<w:color w:val="${style.color}"/>`,
        style.sz && `<w:sz w:val="${style.sz}"/><w:szCs w:val="${style.sz}"/>`,
        rtl && "<w:rtl/>",
      ]
        .filter(Boolean)
        .join("");
      return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}${index ? "<w:br/>" : ""}<w:t xml:space="preserve">${xmlText(line)}</w:t></w:r>`;
    })
    .join("");
}

type ParaStyle = { style?: string; keepNext?: boolean; pageBreakBefore?: boolean; bullet?: boolean; spacing?: string; align?: string; sect?: string; bidi?: boolean };

function para(inner: string, style: ParaStyle = {}): string {
  const props = [
    style.style && `<w:pStyle w:val="${style.style}"/>`,
    style.keepNext && "<w:keepNext/>",
    style.pageBreakBefore && "<w:pageBreakBefore/>",
    style.bullet && '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>',
    style.bidi && "<w:bidi/>",
    style.spacing && `<w:spacing ${style.spacing}/>`,
    style.align && `<w:jc w:val="${style.align}"/>`,
    style.sect,
  ]
    .filter(Boolean)
    .join("");
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${inner}</w:p>`;
}

/** A paragraph of text, set right to left when its first letter is Arabic. */
function textPara(text: string, run_: RunStyle, style: ParaStyle = {}): string {
  return para(run(text, run_), { ...style, bidi: rightToLeft(text) });
}

/** How a cell's confidence or coverage reads: a gap or a missing quality is red and bold, partial bold. */
function cellLook(cell: Exclude<DocCell, string>): { fill: string | null; run: RunStyle } {
  if (cell.confidence === "gap" || cell.coverage === "missing" || cell.due) return { fill: RED_WASH, run: { b: true, color: RED } };
  if (cell.coverage === "partial") return { fill: null, run: { b: true } };
  if (cell.confidence === "inferred") return { fill: null, run: { color: INK_2 } };
  return { fill: null, run: {} };
}

function cellXml(value: DocCell, width: number, options: { head?: boolean; first?: boolean; small?: boolean }): string {
  const cell = typeof value === "string" ? { text: value } : value;
  const look = options.head ? { fill: BAND, run: { b: true } } : options.first ? { fill: BAND, run: { b: true } } : cellLook(cell);
  const props = `<w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${look.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${look.fill}"/>` : ""}</w:tcPr>`;
  return `<w:tc>${props}${textPara(cell.text, look.run, { style: options.small ? "TableSmall" : "TableText" })}</w:tc>`;
}

function tableXml(table: DocTable, content: number): string {
  const total = table.cols.reduce((sum, col) => sum + (col.w || 10), 0);
  const widths = table.cols.map((col) => Math.floor(((col.w || 10) / total) * content));
  const head = table.noHead
    ? ""
    : `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${table.cols.map((col, i) => cellXml(col.label, widths[i]!, { head: true, small: table.small })).join("")}</w:tr>`;
  const body = table.rows
    .map(
      (row) =>
        `<w:tr><w:trPr><w:cantSplit/></w:trPr>${row.map((value, i) => cellXml(value, widths[i]!, { first: table.firstColShade && i === 0, small: table.small })).join("")}</w:tr>`,
    )
    .join("");
  // Rules for structure: a heavy rule under the head, hairlines between rows, no verticals.
  const borders =
    `<w:top w:val="single" w:sz="12" w:space="0" w:color="${INK}"/>` +
    `<w:bottom w:val="single" w:sz="4" w:space="0" w:color="${RULE}"/>` +
    `<w:insideH w:val="single" w:sz="4" w:space="0" w:color="${RULE}"/>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${content}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${borders}</w:tblBorders><w:tblCellMar><w:top w:w="50" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="50" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${head}${body}</w:tbl>`;
}

function calloutXml(block: Extract<DocBlock, { t: "callout" }>, content: number): string {
  const [rule, fill, title] = block.kind === "gap" ? [RED, RED_WASH, RED] : block.kind === "decision" ? [INK, BAND, INK] : [INK_3, BAND, INK_2];
  const inner =
    textPara(block.title, { b: true, color: title }, { style: "TableText" }) +
    (block.text ? textPara(block.text, {}, { style: "TableText" }) : "");
  return `<w:tbl><w:tblPr><w:tblW w:w="${content}" w:type="dxa"/><w:tblBorders><w:left w:val="single" w:sz="24" w:space="0" w:color="${rule}"/></w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="140" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="${content}"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="${content}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/></w:tcPr>${inner}</w:tc></w:tr></w:tbl>`;
}

function imageXml(block: Extract<DocBlock, { t: "image" }>, rid: string, id: number, content: number): string {
  const cx = Math.round((content / 1440) * 914400);
  const cy = Math.round((cx * block.h) / block.w);
  const alt = xmlText(block.alt);
  return (
    para(
      `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Figure ${id}" descr="${alt}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="image${id}.png" descr="${alt}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`,
      { align: "center", keepNext: true },
    ) + textPara(block.caption, {}, { style: "Caption" })
  );
}

function sectPr(page: Page, first: boolean): string {
  const references =
    '<w:headerReference w:type="default" r:id="rIdHdr"/><w:footerReference w:type="default" r:id="rIdFtr"/>' +
    (first ? '<w:headerReference w:type="first" r:id="rIdHdr0"/><w:footerReference w:type="first" r:id="rIdFtr0"/>' : "");
  return `<w:sectPr>${references}<w:type w:val="nextPage"/><w:pgSz w:w="${page.w}" w:h="${page.h}"${page.landscape ? ' w:orient="landscape"' : ""}/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/>${first ? "<w:titlePg/>" : ""}</w:sectPr>`;
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const CONTENT = "application/vnd.openxmlformats-officedocument.wordprocessingml";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** The document's parts by path, `[Content_Types].xml` first. */
export function documentParts(model: DocModel, at: Date): Record<string, string | Uint8Array> {
  const out: string[] = [];
  let page: Page = PORTRAIT;
  let firstSection = true;
  let freshPage = true;
  let lastTable = false;
  // Orientation is decided per top-level section: one holding a wide table is landscape throughout.
  const wide = new Map<number, boolean>();
  let heading = -1;
  model.blocks.forEach((block, index) => {
    if (block.t === "h1") {
      heading = index;
      wide.set(index, false);
    } else if (heading >= 0 && block.t === "table" && block.landscape) wide.set(heading, true);
  });
  const push = (xml: string, isTable = false) => {
    // Word needs a paragraph between two tables; elsewhere the next paragraph carries the spacing.
    if (isTable && lastTable) out.push(para("", { style: "Spacer" }));
    out.push(xml);
    lastTable = isTable;
    freshPage = false;
  };
  const switchTo = (next: Page) => {
    if (next === page) return;
    out.push(para("", { sect: sectPr(page, firstSection) }));
    firstSection = false;
    page = next;
    freshPage = true;
    lastTable = false;
  };
  const media: { rid: string; name: string; bytes: Uint8Array }[] = [];
  const numbered = model.blocks.filter((block): block is { t: "h1" | "h2"; text: string } => (block.t === "h1" || block.t === "h2") && /^\d+(\.\d+)*\.?\s/.test(block.text));

  model.blocks.forEach((block, index) => {
    switch (block.t) {
      case "cover":
        out.push(para(run("SOLUTION ARCHITECTURE", { b: true, color: INK_2, sz: 22, caps: true }), { spacing: 'w:before="2400" w:after="120"' }));
        out.push(textPara(block.product, {}, { style: "Title" }));
        out.push(textPara(block.scenario, {}, { style: "Subtitle" }));
        out.push(tableXml({ t: "table", cols: [{ label: "Scenario", w: 30 }, { label: "Value", w: 70 }], rows: block.rows, firstColShade: true, noHead: true }, page.content));
        out.push(textPara(block.note, { color: INK_2, i: true }, { spacing: 'w:before="600"' }));
        freshPage = false;
        return;
      case "h1":
        switchTo(wide.get(index) ? LANDSCAPE : PORTRAIT);
        push(textPara(block.text, {}, { style: "Heading1", pageBreakBefore: !freshPage }));
        return;
      case "h2":
        push(textPara(block.text, {}, { style: "Heading2" }));
        return;
      case "h3":
        push(textPara(block.text, {}, { style: "Heading3" }));
        return;
      case "p":
        push(textPara(block.text, block.muted ? { color: INK_2, i: true } : {}));
        return;
      case "ul":
        for (const item of block.items) push(textPara(item, {}, { style: "ListBullet", bullet: true }));
        return;
      case "table":
        push(tableXml(block, page.content), true);
        return;
      case "callout":
        push(calloutXml(block, page.content), true);
        return;
      case "image": {
        const rid = `rIdImg${media.length + 1}`;
        media.push({ rid, name: `image${media.length + 1}.png`, bytes: block.png });
        push(imageXml(block, rid, media.length, page.content));
        return;
      }
      case "toc": {
        lastTable = false;
        out.push(para(run("Contents"), { style: "TOCHeading", pageBreakBefore: true }));
        // A field Word fills in; until it is updated, the headings stand in for it without page numbers.
        const [first, ...rest] = numbered;
        out.push(
          `<w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run(first?.text ?? "")}</w:p>`,
        );
        for (const item of rest) out.push(para(run(item.text), { style: item.t === "h1" ? "TOC1" : "TOC2" }));
        out.push('<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>');
        out.push(para(run("Page numbers: in Word, right-click the contents and choose Update Field.", { color: INK_2, i: true, sz: 16 })));
        return;
      }
    }
  });

  const body = out.join("") + para("", { style: "Spacer" }) + sectPr(page, firstSection);
  const header = (text: string) =>
    `${XML}<w:hdr ${NS}>${text ? textPara(text, { color: INK_2, sz: 16 }, { style: "Header", align: "right" }) : para("")}</w:hdr>`;
  const footer = (on: boolean) =>
    `${XML}<w:ftr ${NS}>${
      on
        ? `<w:p><w:pPr><w:pStyle w:val="Footer"/><w:tabs><w:tab w:val="right" w:pos="9638"/></w:tabs></w:pPr>${run("Generated from the knowledge catalogue · DRAFT for architecture review", { color: INK_2, sz: 16 })}<w:r><w:rPr><w:color w:val="${INK_2}"/><w:sz w:val="16"/></w:rPr><w:tab/><w:t xml:space="preserve">Page </w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple><w:r><w:rPr><w:color w:val="${INK_2}"/><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve"> of </w:t></w:r><w:fldSimple w:instr=" NUMPAGES "><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple></w:p>`
        : para("")
    }</w:ftr>`;
  const override = (part: string, type: string) => `<Override PartName="/${part}" ContentType="${type}"/>`;
  const parts: Record<string, string | Uint8Array> = {
    "[Content_Types].xml": `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>${[
      override("word/document.xml", `${CONTENT}.document.main+xml`),
      override("word/styles.xml", `${CONTENT}.styles+xml`),
      override("word/settings.xml", `${CONTENT}.settings+xml`),
      override("word/numbering.xml", `${CONTENT}.numbering+xml`),
      override("word/header1.xml", `${CONTENT}.header+xml`),
      override("word/header0.xml", `${CONTENT}.header+xml`),
      override("word/footer1.xml", `${CONTENT}.footer+xml`),
      override("word/footer0.xml", `${CONTENT}.footer+xml`),
      override("docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml"),
      override("docProps/app.xml", "application/vnd.openxmlformats-officedocument.extended-properties+xml"),
    ].join("")}</Types>`,
    "_rels/.rels": `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    "docProps/core.xml": `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlText(`Solution Architecture: ${model.title}`)}</dc:title><dc:subject>${xmlText(model.subject)}</dc:subject><dc:creator>Knowledge portal</dc:creator><cp:keywords>${xmlText(["solution architecture", ...model.keywords].join("; "))}</cp:keywords><dcterms:created xsi:type="dcterms:W3CDTF">${at.toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`,
    "docProps/app.xml": `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Knowledge portal</Application></Properties>`,
    "word/_rels/document.xml.rels": `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="${REL}/settings" Target="settings.xml"/><Relationship Id="rIdNum" Type="${REL}/numbering" Target="numbering.xml"/><Relationship Id="rIdHdr" Type="${REL}/header" Target="header1.xml"/><Relationship Id="rIdHdr0" Type="${REL}/header" Target="header0.xml"/><Relationship Id="rIdFtr" Type="${REL}/footer" Target="footer1.xml"/><Relationship Id="rIdFtr0" Type="${REL}/footer" Target="footer0.xml"/>${media.map((item) => `<Relationship Id="${item.rid}" Type="${REL}/image" Target="media/${item.name}"/>`).join("")}</Relationships>`,
    "word/document.xml": `${XML}<w:document ${NS}><w:body>${body}</w:body></w:document>`,
    "word/styles.xml": stylesXml(),
    "word/settings.xml": `${XML}<w:settings ${NS}><w:updateFields w:val="false"/><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`,
    "word/numbering.xml": `${XML}<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="260"/></w:pPr><w:rPr><w:color w:val="${INK}"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
    "word/header1.xml": header(`Solution Architecture · ${model.title}`),
    "word/header0.xml": header(""),
    "word/footer1.xml": footer(true),
    "word/footer0.xml": footer(false),
  };
  for (const item of media) parts[`word/media/${item.name}`] = item.bytes;
  return parts;
}

function stylesXml(): string {
  const style = (id: string, name: string, paragraph: string, character: string, extra = "") =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/>${extra}<w:pPr>${paragraph}</w:pPr><w:rPr>${character}</w:rPr></w:style>`;
  return `${XML}<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FACE}" w:hAnsi="${FACE}" w:eastAsia="${FACE}" w:cs="${FACE}"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="${INK}"/><w:lang w:val="en-GB" w:bidi="ar-AE"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${[
    style("Title", "Title", '<w:spacing w:after="80"/>', `<w:b/><w:sz w:val="60"/>`, "<w:qFormat/>"),
    style("Subtitle", "Subtitle", '<w:spacing w:after="480"/>', `<w:color w:val="${INK_2}"/><w:sz w:val="30"/>`, "<w:qFormat/>"),
    style(
      "Heading1",
      "heading 1",
      `<w:keepNext/><w:spacing w:before="0" w:after="200"/><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="${INK}"/></w:pBdr><w:outlineLvl w:val="0"/>`,
      '<w:b/><w:sz w:val="32"/>',
      '<w:next w:val="Normal"/><w:qFormat/>',
    ),
    style("Heading2", "heading 2", '<w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="1"/>', '<w:b/><w:sz w:val="24"/>', '<w:next w:val="Normal"/><w:qFormat/>'),
    style("Heading3", "heading 3", '<w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="2"/>', `<w:b/><w:color w:val="${INK_2}"/><w:sz w:val="21"/>`, '<w:next w:val="Normal"/><w:qFormat/>'),
    style("TOCHeading", "TOC Heading", '<w:spacing w:after="200"/>', '<w:b/><w:sz w:val="32"/>'),
    style("TOC1", "toc 1", '<w:spacing w:before="80" w:after="40"/>', "<w:b/>"),
    style("TOC2", "toc 2", '<w:spacing w:after="20"/><w:ind w:left="320"/>', `<w:color w:val="${INK_2}"/>`),
    style("TableText", "Table Text", '<w:spacing w:after="0" w:line="252" w:lineRule="auto"/>', '<w:sz w:val="17"/><w:szCs w:val="17"/>'),
    style("TableSmall", "Table Small", '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>', '<w:sz w:val="15"/><w:szCs w:val="15"/>'),
    style("Spacer", "Spacer", '<w:spacing w:after="80" w:line="200" w:lineRule="exact"/>', '<w:sz w:val="8"/>'),
    style("Caption", "caption", '<w:jc w:val="center"/><w:spacing w:before="60" w:after="200"/>', `<w:i/><w:color w:val="${INK_2}"/><w:sz w:val="17"/>`),
    style("ListBullet", "List Bullet", '<w:spacing w:after="60"/>', ""),
    style("Header", "header", "", `<w:color w:val="${INK_2}"/><w:sz w:val="16"/>`),
    style("Footer", "footer", "", `<w:color w:val="${INK_2}"/><w:sz w:val="16"/>`),
  ].join("")}</w:styles>`;
}

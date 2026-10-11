/**
 * The token contract: layering (e& values only in primitives, read only by the
 * semantic layer) and WCAG 2.2 contrast for every text/surface pair, in both
 * themes. The same matrix is published in docs/design-system.md.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest runs from the frontend folder (vitest.config.ts); jsdom replaces URL, so read by path.
const read = (name: string) => readFileSync(join(process.cwd(), "src/design/tokens", name), "utf8");
const primitive = read("primitive.css");
const semantic = read("semantic.css");
const component = read("component.css");

function declarations(css: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const [, name, value] of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map.set(name!, value!.trim());
  return map;
}

/** The body of the first rule whose selector matches. */
function block(css: string, selector: RegExp): string {
  const match = selector.exec(css);
  if (!match) throw new Error(`no block for ${selector}`);
  const start = css.indexOf("{", match.index) + 1;
  let depth = 1;
  let index = start;
  while (depth > 0 && index < css.length) {
    if (css[index] === "{") depth++;
    if (css[index] === "}") depth--;
    index++;
  }
  return css.slice(start, index - 1);
}

const prims = declarations(primitive);
const light = declarations(block(semantic, /^:root,\s*\[data-theme="light"\]/m));
const dark = declarations(block(semantic, /^\[data-theme="dark"\]/m));

function resolve(token: string, theme: Map<string, string>): string {
  let value = theme.get(token) ?? prims.get(token);
  for (let hops = 0; value && value.startsWith("var(") && hops < 6; hops++) {
    const name = value.slice(4, -1).trim();
    value = theme.get(name) ?? prims.get(name);
  }
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${token} did not resolve to a hex colour (${value})`);
  return value;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const TEXT: [string, string][] = [
  ["--color-ink", "--color-surface"], ["--color-ink", "--color-surface-1"], ["--color-ink", "--color-surface-2"], ["--color-ink", "--color-surface-3"],
  ["--color-ink-2", "--color-surface"], ["--color-ink-2", "--color-surface-2"], ["--color-ink-2", "--color-surface-3"],
  ["--color-ink-3", "--color-surface"], ["--color-ink-3", "--color-surface-1"], ["--color-ink-3", "--color-surface-2"],
  ["--color-on-action-fill", "--color-action-fill"], ["--color-on-action-fill", "--color-action-fill-hover"],
  ["--color-on-selected", "--color-selected"], ["--color-ink", "--color-selected"],
  ["--color-link", "--color-surface"], ["--color-link", "--color-surface-2"],
  ["--color-action", "--color-surface"],
  ["--color-on-masthead", "--color-masthead"],
  ["--color-on-danger", "--color-danger"],
  ["--color-danger", "--color-danger-bg"], ["--color-danger", "--color-surface"],
  ["--color-warning", "--color-warning-bg"], ["--color-warning", "--color-surface"],
  ["--color-success", "--color-success-bg"], ["--color-success", "--color-surface"],
  ["--color-info", "--color-info-bg"], ["--color-info", "--color-surface"],
  ["--color-ink", "--color-highlight"], ["--color-ink", "--color-proof"],
];

const NON_TEXT: [string, string][] = [
  ["--color-rule-strong", "--color-surface"], ["--color-rule-strong", "--color-surface-2"],
  ["--color-focus", "--color-surface"], ["--color-focus", "--color-surface-2"], ["--color-focus", "--color-selected"],
  ["--color-brand-accent", "--color-surface"], ["--color-brand-accent", "--color-selected"], ["--color-brand-accent", "--color-masthead"],
  ["--color-rule-heavy", "--color-surface"],
  ["--color-chart-1", "--color-surface"], ["--color-chart-2", "--color-surface"], ["--color-chart-3", "--color-surface"],
  ["--color-chart-4", "--color-surface"], ["--color-chart-5", "--color-surface"], ["--color-chart-6", "--color-surface"],
];

describe("design tokens", () => {
  for (const [name, theme] of [["light", light], ["dark", dark]] as const) {
    it.each(TEXT)(`${name}: %s on %s reaches 4.5:1`, (fg, bg) => {
      expect(ratio(resolve(fg, theme), resolve(bg, theme))).toBeGreaterThanOrEqual(4.5);
    });
    it.each(NON_TEXT)(`${name}: %s against %s reaches 3:1`, (fg, bg) => {
      expect(ratio(resolve(fg, theme), resolve(bg, theme))).toBeGreaterThanOrEqual(3);
    });
  }

  it("keeps raw colours in the primitive layer only", () => {
    for (const css of [semantic, component]) expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  });

  it("lets only the semantic layer read e& primitives", () => {
    expect(component).not.toMatch(/var\(--eand-/);
    expect(semantic).toMatch(/var\(--eand-/);
  });

  it("states the brand primitives once, with the brief's values", () => {
    expect(prims.get("--eand-red")).toBe("#e00800");
    expect(prims.get("--eand-maroon")).toBe("#4b0f1e");
    expect(prims.get("--eand-grey")).toBe("#636363");
    expect(prims.get("--eand-beige")).toBe("#e6e6dc");
  });

  it("never lets brand red stand for a state", () => {
    for (const theme of [light, dark]) {
      const red = resolve("--color-brand-accent", theme);
      for (const state of ["--color-danger", "--color-warning", "--color-success", "--color-info", "--color-action-fill"]) {
        expect(resolve(state, theme)).not.toBe(red);
      }
    }
  });
});

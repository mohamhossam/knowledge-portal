import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The lab's own modules and what each imports from beside it ("./name").
// Vitest runs from frontend/ (its config), so the folder is found from there.
const dir = resolve(process.cwd(), "src/design-lab/catalogue");
const modules = readdirSync(dir).filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));
const named = (spec: string) => modules.find((file) => file === `${spec}.ts` || file === `${spec}.tsx`);
const imports = new Map(
  modules.map((file) => [
    file,
    [...readFileSync(`${dir}/${file}`, "utf8").matchAll(/(?:from|import) "\.\/([^"]+)"/g)].map((match) => named(match[1]!)).filter((target): target is string => Boolean(target)),
  ]),
);

/** Every cycle once, as the modules round it ("a → b → a"). */
function cycles(): string[] {
  const found = new Set<string>();
  const walk = (file: string, path: string[]) => {
    for (const next of imports.get(file) ?? []) {
      const at = path.indexOf(next);
      if (at >= 0) {
        const loop = path.slice(at);
        const first = loop.indexOf([...loop].sort()[0]!);
        found.add([...loop.slice(first), ...loop.slice(0, first), loop[first]].join(" → "));
      } else walk(next, [...path, next]);
    }
  };
  for (const file of modules) walk(file, [file]);
  return [...found];
}

describe("the catalogue lab's modules", () => {
  it("import one another without a cycle (pages import the chrome, never the router)", () => {
    expect(modules.length).toBeGreaterThan(10);
    expect(cycles()).toEqual([]);
  });
});

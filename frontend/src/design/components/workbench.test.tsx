import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecordView, Workbench } from "./workbench";

afterEach(() => vi.restoreAllMocks());

/** Lays the bench out: the list ends at 400px, the record starts at `recordTop`. */
function layOut(recordTop: number) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const box = this.classList.contains("ds-bench__list") ? { top: 0, bottom: 400, height: 400 } : { top: recordTop, bottom: recordTop + 300, height: 300 };
    return { ...box, left: 0, right: 390, width: 390, x: 0, y: box.top, toJSON: () => ({}) } as DOMRect;
  });
  const scrolled = vi.fn();
  Element.prototype.scrollIntoView = scrolled;
  return scrolled;
}

function bench() {
  return render(
    <Workbench listLabel="Systems" chosen list={<p>The list</p>} record={<RecordView title="Order Hub" />} />,
  );
}

describe("Workbench on a narrow screen", () => {
  it("brings a record opened from a link into view when it stacks under the list, without taking focus", () => {
    const scrolled = layOut(420);
    bench();
    expect(scrolled).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(document.body);
  });

  it("leaves the window alone when the record sits beside the list", () => {
    const scrolled = layOut(0);
    bench();
    expect(scrolled).not.toHaveBeenCalled();
  });
});

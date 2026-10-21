/**
 * Where a link between two systems is known from. A journey is one press away; an
 * interface is named only, since it belongs to one of the two systems the row already
 * links to. Two or fewer of a kind are named in place; more are counted, and the count
 * opens the list.
 */
import { Fragment, type ReactNode, useId, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "../design/components";
import { count } from "../home/format";
import type { SystemLink } from "./links";

type Source = { key: string; name: string; href?: string };

const capital = (word: string) => word.charAt(0).toLocaleUpperCase() + word.slice(1);

export function LinkBasis({ link, base }: { link: SystemLink; base: string }) {
  const parts: ReactNode[] = [];
  if (link.stated) parts.push("Stated");
  if (link.interfaces.length) {
    parts.push(
      <Sources
        noun="interface"
        items={link.interfaces.map((item) => ({ key: item.id, name: item.name }))}
      />,
    );
  }
  if (link.journeys.length) {
    parts.push(
      <Sources
        noun="journey"
        items={link.journeys.map((item) => ({ key: item.id, name: item.name, href: `${base}/journeys/${encodeURIComponent(item.id)}` }))}
      />,
    );
  }
  return (
    <div className="cat-basis">
      {parts.map((part, index) => (
        <Fragment key={index}>
          {/* The separator keeps to the word before it, so a wrapped line never starts with it. */}
          {index > 0 && "\u00a0· "}
          {part}
        </Fragment>
      ))}
    </div>
  );
}

function Sources({ noun, items }: { noun: string; items: Source[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (items.length <= 2) {
    return (
      <>
        {capital(items.length === 1 ? noun : `${noun}s`)}{" "}
        {items.map((item, index) => (
          <Fragment key={item.key}>
            {index > 0 && ", "}
            <Named item={item} />
          </Fragment>
        ))}
      </>
    );
  }
  return (
    <>
      <Button variant="link" aria-expanded={open} aria-controls={id} onClick={() => setOpen((shown) => !shown)}>
        {count(items.length, noun)}
      </Button>
      <ul id={id} className="cat-basis__list" hidden={!open}>
        {items.map((item) => (
          <li key={item.key}>
            <Named item={item} />
          </li>
        ))}
      </ul>
    </>
  );
}

function Named({ item }: { item: Source }) {
  return item.href ? <Link to={item.href} dir="auto">{item.name}</Link> : <bdi>{item.name}</bdi>;
}

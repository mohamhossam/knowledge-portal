import { RouterLink } from "../shell/links";

/**
 * ADR-0121: a retired system or concept says so in words, with what replaced it when
 * something did. It stays readable everywhere; matching leaves it out.
 */
export function Retired({ successor }: { successor?: { name: string; href: string } }) {
  return (
    <span className="cat-inline">
      {/* Words, not the stopped glyph: beside a name its square reads as a box to tick. */}
      <span className="cat-quiet">Retired</span>
      {successor && (
        <span>
          Replaced by <RouterLink href={successor.href}><bdi>{successor.name}</bdi></RouterLink>
        </span>
      )}
    </span>
  );
}

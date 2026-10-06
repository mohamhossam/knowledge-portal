import { type ReactNode, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

import { REQUIREMENT_APP_URL } from "../auth/paths";
import { requirementOverview } from "../home/derive";
import { FINDINGS_PATH, HISTORIC_PATH, KNOWLEDGE_PATH, REQUIREMENTS_PATH, useCorpusSummary } from "./knowledge";

/** Overview · Requirements · Findings · Historic: the pages of Table 4. */
export function KnowledgeSubIndex() {
  const { pathname } = useLocation();
  const pages = [
    { label: "Overview", to: KNOWLEDGE_PATH, current: pathname === KNOWLEDGE_PATH || pathname === `${KNOWLEDGE_PATH}/` },
    { label: "Requirements", to: REQUIREMENTS_PATH, current: pathname.startsWith(REQUIREMENTS_PATH) },
    { label: "Findings", to: FINDINGS_PATH, current: pathname.startsWith(FINDINGS_PATH) },
    { label: "Historic", to: HISTORIC_PATH, current: pathname.startsWith(HISTORIC_PATH) },
  ];
  return (
    <nav className="subindex" aria-label="This table">
      <ul className="subindex__list">
        {pages.map((page) => (
          <li key={page.label}>
            <Link to={page.to} className="subindex__link" aria-current={page.current ? "page" : undefined}>{page.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Table 4's head over one of its pages: the margin number, the title, and the same edition
 * line the overview carries, so the head and its sub-index hold still from page to page.
 */
export function KnowledgePage({ page, children }: { page: string; children: ReactNode }) {
  const summary = useCorpusSummary();
  useEffect(() => {
    document.title = `${page} · Requirement knowledge · Knowledge portal`;
  }, [page]);
  const edition = summary.data
    ? requirementOverview(summary.data, REQUIREMENT_APP_URL).edition.text
    : summary.isError
      ? "Requirement work did not answer with its counts."
      : "Reading requirement knowledge…";
  return (
    <section className="docpage knowledge" aria-labelledby="knowledge-title">
      <header className="docpage__head">
        <p className="docpage__number" aria-hidden="true">4</p>
        <div className="docpage__heading">
          <h1 id="knowledge-title" className="docpage__title">
            <span className="visually-hidden">Table 4:</span> Requirement knowledge
          </h1>
          <p className="docpage__edition">{edition}</p>
          <KnowledgeSubIndex />
        </div>
      </header>
      {children}
    </section>
  );
}

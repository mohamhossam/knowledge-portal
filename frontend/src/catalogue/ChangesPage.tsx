import { useQuery } from "@tanstack/react-query";
import { ArrowRight, RotateCw } from "lucide-react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import { errorMessage } from "../api/errors";
import { DiffTable } from "./DiffTable";
import { useCatalogueContext } from "./useCatalogue";

/** Every difference from the version in service, counted, then listed by kind. */
export function ChangesPage() {
  const { book, base, inService } = useCatalogueContext();
  const release = book.release;
  const diff = useQuery({
    queryKey: ["architecture", "releases", release.id, "changes", release.revision],
    queryFn: () => api.releaseChanges(release.id),
    enabled: !inService,
  });
  return (
    <section className="govsection catalogue__first" aria-labelledby="changes-title">
      <h2 id="changes-title" className="govsection__title">Changes from the version in service</h2>
      {inService ? (
        <p className="timetable__quiet">This is the version in service; it has nothing to compare with.</p>
      ) : diff.isPending ? (
        <p className="timetable__quiet">Comparing…</p>
      ) : diff.isError ? (
        <p className="docpage__failure" role="alert">
          {errorMessage(diff.error)}
          <button type="button" className="text-button" onClick={() => void diff.refetch()}>
            <RotateCw size={14} aria-hidden="true" />
            Try again
          </button>
        </p>
      ) : (
        <DiffTable
          diff={diff.data}
          caption={`What ‘${release.name ?? release.id}’ changes against the version in service`}
          systemLink={(key) => (book.systems.has(key) ? `${base}/systems/${encodeURIComponent(key)}` : null)}
          release={release}
        />
      )}
      {!inService && release.status === "draft" && (
        <p className="timetable__next">
          <Link to={`${base}/check`}>
            Check the samples against this draft
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </p>
      )}
    </section>
  );
}

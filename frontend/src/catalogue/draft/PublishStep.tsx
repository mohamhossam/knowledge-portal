import { useNavigate } from "react-router-dom";

import type { Release } from "../../api/client";
import { errorMessage } from "../../api/errors";
import { ActionGroup, Button, type CheckItem, Checklist, ConsequencePanel, Section } from "../../design/components";
import { useDisclosure } from "../../design/hooks";
import { count } from "../../home/format";
import { RouterLink } from "../../shell/links";
import { changeSentence } from "../catalogue";
import { impactVerdict } from "../drafting";
import { useCatalogueContext, useMappingImpact } from "../useCatalogue";
import { usePublish, useSamples } from "../useEditing";
import { type DraftProgress, useDraftProgress, useSampleResults } from "./progress";

/**
 * Step 5 of a draft: putting it in service. A pre-flight checklist first
 * (built, suggestions decided, samples compared, what changes and for whom),
 * then Publish opens its consequence, where the curator says what they checked.
 */
export function PublishStep() {
  const { book } = useCatalogueContext();
  if (book.release.status !== "draft") return null;
  return <Publish release={book.release} />;
}

function Publish({ release }: { release: Release }) {
  const { base } = useCatalogueContext();
  const navigate = useNavigate();
  const progress = useDraftProgress(release);
  const publish = usePublish(release);
  const impact = useMappingImpact();
  const samples = useSamples().samples.data?.items ?? [];
  const { results } = useSampleResults(release);
  const confirm = useDisclosure(() => document.getElementById("draft-publish"));
  const name = release.name || "Untitled version";
  const sentence = progress.changes.data ? changeSentence(progress.changes.data) : null;
  const mapped = impact.data ? impact.data.requirements - impact.data.outdated_requirements : null;
  const buildFirst = progress.build !== "built";
  const items = preflight({ base, progress, sentence, mapped, samples: samples.map((item) => item.id ?? item.text), results });
  const blocked = items.find((item) => item.tone === "attention");

  return (
    <div className="draft-step">
      <Section title="Before publishing">
        <Checklist label="Checks before publishing" items={items} />
      </Section>
      <Section title="Put it in service">
        <p className="draft-lead">
          Publishing puts it in service at once: requirement work maps against it from its next look at the catalogue.
        </p>
        {confirm.open ? (
          <ConsequencePanel
            panelRef={confirm.panel}
            title={<>Publish <bdi>‘{name}’</bdi></>}
            happens={<>It goes into service at once{sentence ? <>, and would {sentence}</> : null}.</>}
            affects={
              <>
                {mapped !== null && (
                  <p>
                    {mapped
                      ? <><strong className="ds-num">{count(mapped, "requirement")}</strong> mapped with the version in service will show as mapped with an earlier version, for their owners to map again.</>
                      : "No requirement has been mapped with the version in service yet."}
                  </p>
                )}
                {progress.counts.waiting > 0 && <p>{count(progress.counts.waiting, "suggestion")} still {progress.counts.waiting === 1 ? "waits" : "wait"} undecided and {progress.counts.waiting === 1 ? "is" : "are"} left out.</p>}
                {buildFirst && <p>It isn't built at this revision, so it is built first, which can take a few minutes.</p>}
              </>
            }
            reversibility="You can put the version in service now back from Versions; requirement work then maps against it again."
            reason={{ label: "What did you check?", hint: "Kept in the version's history, for whoever reads it next." }}
            confirmLabel={buildFirst ? "Build it, then publish" : "Publish it"}
            busyLabel={buildFirst ? "Building, then publishing…" : "Publishing…"}
            keepLabel="Not yet"
            busy={publish.isPending}
            failure={publish.isError ? errorMessage(publish.error) : null}
            onConfirm={(rationale) =>
              // The page becomes "already published" as soon as the draft is; the promise still lands.
              publish
                .mutateAsync({ rationale, buildFirst })
                .then(() => navigate("/architecture", { state: { notice: `‘${name}’ is in service.` } }))
                .catch(() => undefined)
            }
            onKeep={confirm.close}
          />
        ) : (
          <ActionGroup>
            <Button
              id="draft-publish"
              variant="primary"
              unavailableReason={blocked ? `${blocked.word}: ${typeof blocked.title === "string" ? blocked.title : "see the checks above"}.` : null}
              aria-expanded={false}
              onClick={(event) => {
                publish.reset();
                confirm.show(event);
              }}
            >
              Publish ‘{name}’…
            </Button>
          </ActionGroup>
        )}
      </Section>
    </div>
  );
}

/** The checks before publishing, each with its state in words and the way to settle it. */
function preflight({ base, progress, sentence, mapped, samples, results }: {
  base: string;
  progress: DraftProgress;
  sentence: string | null;
  mapped: number | null;
  samples: string[];
  results: ReturnType<typeof useSampleResults>["results"];
}): CheckItem[] {
  const step = (to: string, label: string) => <RouterLink href={`${base}/${to}`}>{label}</RouterLink>;
  const { counts } = progress;
  const compared = samples.filter((key) => results[key]?.comparison);
  const moved = compared.filter((key) => impactVerdict(results[key]!.comparison!).moved).length;
  const items: CheckItem[] = [];

  items.push(
    progress.reading
      ? { id: "reading", tone: "attention", word: "Wait", title: `${count(progress.reading, "document")} still being read`, detail: "Their suggestions aren't in yet; publish once the reading is done.", action: step("sources", "See Sources") }
      : progress.failed
        ? { id: "reading", tone: "held", word: "Worth a look", title: `${count(progress.failed, "document")} could not be read`, detail: "What they say is not in the draft.", action: step("sources", "Read them again") }
        : { id: "reading", tone: "done", word: "Ready", title: progress.sources ? `Every source is read (${count(progress.sources, "source")})` : "No document or change request is read into it", detail: progress.sources ? undefined : "Its changes come from hand edits or a catalogue file only." },
  );
  items.push(
    !progress.suggestions.data
      ? { id: "decided", tone: "neutral", word: "Checking", title: "Reading the suggestions…" }
      : counts.waiting
        ? { id: "decided", tone: "held", word: "Left out", title: `${count(counts.waiting, "suggestion")} ${counts.waiting === 1 ? "waits" : "wait"} undecided`, detail: "Publishing leaves them out.", action: step("decide", "Decide them") }
        : { id: "decided", tone: "done", word: "Ready", title: counts.all ? `Every suggestion is decided (${counts.accepted.toLocaleString("en")} accepted, ${counts.rejected.toLocaleString("en")} rejected)` : "Nothing waits to be decided" },
  );
  items.push(
    progress.build === "built"
      ? { id: "built", tone: "done", word: "Ready", title: "Built for matching at this revision" }
      : progress.build === "building"
        ? { id: "built", tone: "attention", word: "Wait", title: "It is being built", detail: "Publish once the build is done.", action: step("check", "See Check") }
        : progress.build === "failed"
          ? { id: "built", tone: "held", word: "Worth a look", title: "The last build failed", detail: "Publishing tries the build again first.", action: step("check", "See Check") }
          : { id: "built", tone: "held", word: "Builds first", title: progress.build === "stale" ? "Edited since it was built" : "Not built yet", detail: "Publishing builds it first, which can take a few minutes.", action: step("check", "Build it on Check") },
  );
  items.push(
    !samples.length
      ? { id: "samples", tone: "neutral", word: "No samples", title: "The team has no sample requirements to compare", action: step("check", "Add samples") }
      : !compared.length
        ? { id: "samples", tone: "held", word: "Not compared", title: `${count(samples.length, "sample requirement")} not compared with this draft`, detail: "Comparing shows which mappings publishing would move.", action: step("check", "Compare them") }
        : moved
          ? { id: "samples", tone: "held", word: "Worth a look", title: `${count(moved, "sample mapping")} would move`, detail: `${compared.length} of ${samples.length} compared.`, action: step("check", "See the samples") }
          : { id: "samples", tone: "done", word: "Ready", title: `No sample mapping would move`, detail: `${compared.length} of ${samples.length} compared.` },
  );
  items.push(
    !progress.changes.data
      ? { id: "changes", tone: "neutral", word: "Checking", title: "Comparing with the version in service…" }
      : progress.changes.data.changes.length
        ? { id: "changes", tone: "neutral", word: "Changes", title: sentence ? `It would ${sentence}` : count(progress.changes.data.changes.length, "change"), action: step("changes", "See every change") }
        : { id: "changes", tone: "held", word: "Worth a look", title: "Its contents match the version in service", detail: "Publishing it changes nothing requirement work sees." },
  );
  if (mapped !== null) {
    items.push({
      id: "mapped",
      tone: "neutral",
      word: "Affects",
      title: mapped ? `${count(mapped, "requirement")} to map again` : "No requirement mapped yet",
      detail: mapped ? "Requirements mapped with the version in service show as mapped with an earlier version, for their owners to map again." : undefined,
    });
  }
  return items;
}

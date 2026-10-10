# Microcopy patterns

Phase 2 · Define. These are reusable string patterns. Each pattern has a slot grammar, and
real examples use seeded data. Use them with `voice-and-tone.md` and `glossary.md`.

Slots are written `{like this}`. Names in slots are always isolated with `<bdi>`.

## 1. Actions (buttons and links)

| Pattern | Grammar | Examples |
|---|---|---|
| Primary commit | Verb + object | "Publish and put in service" · "Withdraw '{title}'" · "Give {system} to a squad" |
| Opens a further step | Verb + object + "…" | "Withdraw…" · "Return to service…" · "Import a catalogue file…" |
| Safe default | Keep + object, or Cancel | "Keep it in service" · "Keep the version in service" · "Cancel" |
| Bulk | Verb + count + noun | "Exclude 12 passages…" · "Accept 14 ready suggestions…" · "Show the 14" |
| Navigation to the next item | "Next:" + item | "Next: DCRM" · "Next flagged passage" |
| Leaves to requirement-portal | Verb + "in Requirement AI" + ↗ (with visually hidden text "opens Requirement AI") | "Open in Requirement AI ↗" |

**Never use:** "Submit", "OK", "Yes", "Click here", "Proceed".

## 2. Consequence panels (confirmations)

```
{What happens, present tense}.
{Who/what it affects: count first, then names}. {Caveat if partial}
{Reversibility}.
[Reason field: "Why? {who reads it}"]
[ {Verb object} ]  [ {Safe default} ]
```

| Action | Copy |
|---|---|
| Withdraw | "Requirement work can no longer cite '{title}'. **7 requirements cite it now** (only requirements you can see). They'll be asked to keep or revise their citation in Requirement AI. You can return it to service later." · Reason: "Why are you withdrawing it? The requirement owners see this." · [Withdraw '{title}'] [Keep it in service] |
| Approve and publish | "Publishing makes **{n} passages** citable. It replaces version {k}, which **{c} requirements** cite. You looked at {seen} of {n} passages ({f} flagged, all opened)." · [Publish version {v}] [Not yet] |
| Return to service | "'{title}' was withdrawn on {date} by {person}: '{reason}'. Returning it makes version {v} citable again." · Reason (required) · [Return to service] [Keep it withdrawn] |
| Publish a draft | "Publishing puts '{draft}' in service at once. **{x} changes** · **{m} requirements would map differently** · checked at {time} ({stale?: 'the draft changed since'}). {u} suggestions are still undecided, and they won't be included. The version it replaces can be put back from Versions." · [Publish and put in service] [Not yet] |
| Put back | "'{version}' goes back in service, replacing '{current}'. {counts by kind}. {m} requirements would map differently." · Reason (required) · [Put '{version}' back in service] [Keep '{current}' in service] |
| Remove a squad | "**{s1} and {s2} will have no squad.** {person} stops being their contact." · [Remove '{squad}'] [Keep it] |
| Replace the draft from a file | "The file replaces the draft's content, **including {e} hand edits**. {diff counts}." · [Replace the draft's content] [Keep the draft as it is] |
| Delete a draft | "'{draft}' and its {d} decisions are deleted. This cannot be undone." · [Delete the draft] [Keep it] |

## 3. Undo (delayed commit)

- `"{Accepted|Rejected} '{label}'. Undo (z)"`. It is visible for 6 s, then becomes the row's
  decided state.
- When it is undone, the message is "Undone. '{label}' is back to decide.".
- For bulk, the message is "Accepted 14 suggestions. Undo (z)".

## 4. Errors

```
{What failed}. {Why, in plain words}. {What to do}.
```

| Case | Copy |
|---|---|
| Field: required reason | "Give a reason. {Who} sees it." |
| Field: blank text | "The passage text can't be empty. Exclude the passage instead if it shouldn't be published." |
| Reading failed (parse) | "Couldn't read '{file}'. {cause, e.g. 'The columns aren't separated by commas.'} Upload a new version, or try reading it again." |
| Held by the malware scan | "'{file}' is held: the malware scan flagged it. It won't be read. Upload a clean copy." |
| Indexing failed | "Couldn't make version {v} searchable. {cause}. Try again; the version in service stays citable meanwhile." |
| Conflict (409) | "Someone changed {object} while you were working. Reload to see their change. {Your unsaved decisions stay listed. \| Your reason stays.}" |
| Rate limit (429) | "Too many checks in a minute. You can try again in {s} s." |
| Permission (403) | "You're signed in as {name}. {Action} needs the {role name} role. Ask your platform administrator to add you." |
| Service unreachable | "The portal can't reach its service. Your unsaved work stays here. Trying again…" |
| Section failed | "Couldn't read {what}. Try again." (the rest of the page keeps working) |
| requirement-portal unreachable | "Couldn't ask Requirement AI who cites it. The count is unknown, not zero." |
| Stale link | "This link asks for '{x}', which isn't in the catalogue in service. Showing '{y}'." |

**Never use:** error codes on their own, "Something went wrong", "Invalid", "Oops", or blame.

## 5. Empty states

```
{What this is}. {Why it's empty / where it comes from}. [{Next action}]
```

| Where | Copy |
|---|---|
| Your work, nothing for you | "Nothing needs you. Next re-confirmation: {date}." / "No re-confirmations are scheduled." |
| Documents | "No documents yet. Upload a policy or reference document; you review what was read before requirement work can cite it." [Upload documents] |
| Search, no results | "No published passage matches '{q}'. Only passages in service are searched." [Clear search] |
| Filters, no results | "Nothing matches these filters." [Clear filters] |
| Decide, done | "Every suggestion is decided. Next: review the changes." [Review changes] |
| Gaps, none | "Every system in service has a squad and a contact." |
| Requirements | "No requirements yet. Requirement work keeps them; they appear here once Requirement AI holds some." [Open Requirement AI ↗] |
| Historic, none | "No historic requirements yet. Import the first BRDs to build them." [Import BRDs] |
| Cited by, none | "No requirement you can see cites this document." |
| Explorer, not recorded | "Not recorded yet: {list}." (one quiet line) |

## 6. Job messages

| State | Row or state line | Live announcement (polite, once) |
|---|---|---|
| Waiting | "Waiting to be read" | — |
| Working | "Reading… 1 min 20 s" (elapsed time updates; it is **not** announced) | — |
| Long | "Still reading (2 min). You can leave this page; it continues." | — |
| Done | "Ready for review" | "Reading finished: '{title}' is ready for review." |
| Needs attention | "Couldn't read: {cause}" + actions | "Reading failed: '{title}'. See Jobs." |
| Stopped | "Reading stopped by {person}" | "Stopped reading '{title}'." |
| Held | "Held by the malware scan" | "'{file}' is held by the malware scan." |
| Client-orchestrated | "Building, then publishing. Keep this tab open until it finishes." | — |

## 7. Status words (one set, used everywhere)

These map to the job model in `interaction/model.md` §6 and to the object states.

| Group | Words |
|---|---|
| Work | **To decide**, **Waits for {x}**, **Ready**, **Accepted**, **Rejected**, **Seen** / **Not seen yet**, **Flagged**, **Blocks approval** |
| Lifecycle | **Being read**, **Ready for review**, **In service**, **Withdrawn**, **Replaced**, **Draft** |
| Jobs | **Waiting**, **Working**, **Done**, **Needs attention**, **Stopped**, **Held** |
| Re-confirmation | **Confirmed {date}**, **Due {date}**, **Overdue since {date}** |

## 8. Help text (toggletips, the Help panel)

```
{Term}: {one-sentence definition}. {Why it matters here}.
```

Example: "Search index for tables: a second index that keeps table rows together, so searches
over tables find whole rows. You preview it before it replaces the standard one."

## 9. Accessible names

- Icon-only buttons get a full name: `aria-label="Retry reading 'Product eligibility matrix'"`.
- Row actions include the row's name: "Exclude passage 14".
- Counts in navigation use visually hidden text: "Your work, 6 need you".
- Lists announce their totals politely after filtering: "12 documents".

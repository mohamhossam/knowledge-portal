/**
 * Exports for the teams that build on the catalogue, in the formats their
 * tools import:
 * - a journey's flow as BPMN 2.0 XML with diagram interchange (OMG BPMN 2.0,
 *   ISO/IEC 19510), so Camunda Modeler, Signavio, ARIS, Bizagi or Visio open it
 *   laid out as it is shown;
 * - integrations as a UML sequence diagram in PlantUML or Mermaid text;
 * - the integration register as CSV.
 * Everything is generated in the browser from the model.
 */
import { SOURCES, laneName } from "./data/landscape";
import { GEOMETRY, layoutFlow } from "./flowLayout";
import { EVIDENCE_WORDS, type Evidence, type Integration, type Journey, type Step } from "./model";

const xml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const id = (text: string) => text.replace(/[^A-Za-z0-9_]/g, "_");

export function evidenceText(evidence: Evidence): string {
  const source = SOURCES.find((item) => item.id === evidence.source);
  return [EVIDENCE_WORDS[evidence.status], source && `${source.id === "sdd" ? "SDD" : "SMB reference"} v${source.version}`, evidence.where, evidence.note]
    .filter(Boolean)
    .join(" · ");
}

function laneLabel(journey: Journey, lane: string) {
  return journey.laneLabels?.[lane] ?? laneName(lane);
}

function documentation(journey: Journey, step: Step): string {
  const calls = journey.integrations
    .filter((integration) => integration.step === step.id)
    .map((integration) => `Integration: ${laneName(integration.from)} → ${laneName(integration.to)}${integration.via ? ` via ${laneName(integration.via)}` : ""}: ${integration.operation} (${integration.style}, ${integration.mode})`);
  return [step.detail, step.etom && `eTOM: ${step.etom}`, step.ponr && `Point of no return: ${step.ponr}`, ...calls, `Evidence: ${evidenceText(step.evidence)}`]
    .filter(Boolean)
    .join("\n");
}

function element(journey: Journey, step: Step): string {
  const tag = {
    start: "startEvent",
    end: "endEvent",
    "error-end": "endEvent",
    exclusive: "exclusiveGateway",
    parallel: "parallelGateway",
    task: step.lane === "customer" || step.lane === "mss" ? "userTask" : "serviceTask",
  }[step.kind];
  const flows = journey.steps
    .flatMap((from) => from.next.map((next) => ({ from: from.id, to: next.to })))
    .filter((flow) => flow.from === step.id || flow.to === step.id)
    .map((flow) => (flow.to === step.id ? `<bpmn:incoming>Flow_${id(flow.from)}_${id(flow.to)}</bpmn:incoming>` : `<bpmn:outgoing>Flow_${id(flow.from)}_${id(flow.to)}</bpmn:outgoing>`))
    .join("");
  const error = step.kind === "error-end" ? "<bpmn:errorEventDefinition />" : "";
  return `    <bpmn:${tag} id="${id(step.id)}" name="${xml(step.name)}"><bpmn:documentation>${xml(documentation(journey, step))}</bpmn:documentation>${flows}${error}</bpmn:${tag}>`;
}

export function toBpmn(journey: Journey): string {
  const layout = layoutFlow(journey);
  const process = `Process_${id(journey.id)}`;
  const lanes = layout.lanes
    .map((lane) => {
      const refs = journey.steps.filter((step) => step.lane === lane).map((step) => `<bpmn:flowNodeRef>${id(step.id)}</bpmn:flowNodeRef>`).join("");
      return `      <bpmn:lane id="Lane_${id(lane)}" name="${xml(laneLabel(journey, lane))}">${refs}</bpmn:lane>`;
    })
    .join("\n");
  const flows = journey.steps
    .flatMap((step) => step.next.map((next) => `    <bpmn:sequenceFlow id="Flow_${id(step.id)}_${id(next.to)}" sourceRef="${id(step.id)}" targetRef="${id(next.to)}"${next.label ? ` name="${xml(next.label)}"` : ""} />`))
    .join("\n");
  const shapes = [
    `      <bpmndi:BPMNShape id="Participant_${id(journey.id)}_di" bpmnElement="Participant_${id(journey.id)}" isHorizontal="true"><dc:Bounds x="0" y="0" width="${layout.width}" height="${layout.height}" /></bpmndi:BPMNShape>`,
    ...layout.lanes.map((lane, index) => `      <bpmndi:BPMNShape id="Lane_${id(lane)}_di" bpmnElement="Lane_${id(lane)}" isHorizontal="true"><dc:Bounds x="30" y="${index * GEOMETRY.laneHeight}" width="${layout.width - 30}" height="${GEOMETRY.laneHeight}" /></bpmndi:BPMNShape>`),
    ...[...layout.placed.values()].map((place) => `      <bpmndi:BPMNShape id="${id(place.step.id)}_di" bpmnElement="${id(place.step.id)}"><dc:Bounds x="${Math.round(place.x)}" y="${Math.round(place.y)}" width="${place.width}" height="${place.height}" /></bpmndi:BPMNShape>`),
    ...layout.edges.map((edge) => `      <bpmndi:BPMNEdge id="Flow_${id(edge.from)}_${id(edge.to)}_di" bpmnElement="Flow_${id(edge.from)}_${id(edge.to)}">${edge.points.map(([x, y]) => `<di:waypoint x="${Math.round(x)}" y="${Math.round(y)}" />`).join("")}</bpmndi:BPMNEdge>`),
  ].join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_${id(journey.id)}" targetNamespace="https://knowledge-portal/architecture" exporter="Knowledge portal architecture catalogue" exporterVersion="1">
  <bpmn:collaboration id="Collaboration_${id(journey.id)}">
    <bpmn:participant id="Participant_${id(journey.id)}" name="${xml(journey.name)}" processRef="${process}" />
  </bpmn:collaboration>
  <bpmn:process id="${process}" name="${xml(journey.name)}" isExecutable="false">
    <bpmn:documentation>${xml(journey.summary)}</bpmn:documentation>
    <bpmn:laneSet id="LaneSet_${id(journey.id)}">
${lanes}
    </bpmn:laneSet>
${journey.steps.map((step) => element(journey, step)).join("\n")}
${flows}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_${id(journey.id)}">
    <bpmndi:BPMNPlane id="Plane_${id(journey.id)}" bpmnElement="Collaboration_${id(journey.id)}">
${shapes}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
}

/** The order participants appear in, from the first message. */
function participants(messages: Integration[]): string[] {
  const seen: string[] = [];
  for (const message of messages) for (const lane of [message.from, message.via, message.to]) if (lane && !seen.includes(lane)) seen.push(lane);
  return seen;
}

export function toPlantUml(name: string, messages: Integration[]): string {
  const lines = ["@startuml", `title ${name}`, "autonumber"];
  for (const lane of participants(messages)) lines.push(`participant "${laneName(lane)}" as ${id(lane)}`);
  for (const message of messages) {
    const arrow = message.style === "Callback" ? "-->" : message.mode === "async" ? "->>" : "->";
    const label = `${message.operation}${message.via ? ` (via ${laneName(message.via)})` : ""} [${message.style}, ${message.mode}]`;
    lines.push(`${id(message.from)} ${arrow} ${id(message.to)} : ${label}`);
  }
  lines.push("@enduml");
  return lines.join("\n");
}

export function toMermaid(name: string, messages: Integration[]): string {
  const lines = ["sequenceDiagram", `    title ${name}`, "    autonumber"];
  for (const lane of participants(messages)) lines.push(`    participant ${id(lane)} as ${laneName(lane)}`);
  for (const message of messages) {
    const arrow = message.style === "Callback" ? "-->>" : message.mode === "async" ? "-)" : "->>";
    lines.push(`    ${id(message.from)}${arrow}${id(message.to)}: ${message.operation}${message.via ? ` (via ${laneName(message.via)})` : ""}`);
  }
  return lines.join("\n");
}

const csvCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function toCsv(messages: Integration[]): string {
  const header = ["#", "From", "To", "Via", "Operation", "Purpose", "Style", "Sync / async", "Payload", "TMF equivalent (hypothesis)", "Evidence"];
  const rows = messages.map((message, index) => [
    String(index + 1),
    laneName(message.from),
    laneName(message.to),
    message.via ? laneName(message.via) : "",
    message.operation,
    message.purpose,
    message.style,
    message.mode,
    message.payload ?? "",
    message.tmf ?? "",
    evidenceText(message.evidence),
  ]);
  // A byte-order mark so Excel reads the file as UTF-8.
  return "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function download(fileName: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

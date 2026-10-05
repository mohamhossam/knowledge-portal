/**
 * The Solution Architecture document as a Word file (requirement-portal
 * ADR-0101, step 6): the model, its parts, and the package.
 */
import { solutionDocument, type DocumentInput, type SolutionDocument } from "./model";
import { documentParts } from "./wordml";
import { zip } from "./zip";

export const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** "Business_Pro_Plus_New_Activation_B2B_Digital_Solution_Architecture.docx", as the original named it. */
export function documentName(input: Pick<DocumentInput, "scenario">): string {
  const { offering, orderType, channel } = input.scenario;
  const stem = [offering.name, orderType.name, channel?.name ?? "Every_channel", "Solution_Architecture"]
    .join("_")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_|_$/g, "");
  return `${stem}.docx`;
}

export async function solutionArchitecture(input: DocumentInput): Promise<{ blob: Blob; fileName: string; model: SolutionDocument }> {
  const model = solutionDocument(input);
  const bytes = await zip(documentParts(model, input.at), { at: input.at });
  return { blob: new Blob([bytes as BlobPart], { type: DOCX }), fileName: documentName(input), model };
}

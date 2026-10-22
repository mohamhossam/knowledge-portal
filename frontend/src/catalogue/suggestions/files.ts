/** The files the service reads, typed as it wants them. */

/** The extension a file must carry for the service to read it. */
export const ACCEPTED_FILES = ".pdf,.docx,.txt,.md,.markdown,.xlsx,.csv,.tsv,.png,.jpg,.jpeg";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/** Browsers type some files loosely; the service wants the type its extension implies. */
export function typedFile(file: File): File {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const type = MIME[extension];
  return type && file.type !== type ? new File([file], file.name, { type }) : file;
}

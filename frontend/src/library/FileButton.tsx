import { Upload } from "lucide-react";
import { type ReactNode, useRef } from "react";

import { Button, type ButtonVariant } from "../design/components";

/** What the library reads: PDF, Word, Excel, PowerPoint, CSV, text, Markdown or an image. */
export const ACCEPT = ".pdf,.docx,.xlsx,.pptx,.csv,.tsv,.txt,.md,.png,.jpg,.jpeg";

/**
 * A real button that opens the file chooser (a hidden file input), so it reads
 * and focuses like every other action. Choosing a file calls `onFile`.
 */
export function FileButton({
  children,
  onFile,
  variant = "secondary",
  busy,
  unavailableReason,
  multiple = false,
}: {
  children: ReactNode;
  onFile: (files: File[]) => void;
  variant?: ButtonVariant;
  busy?: boolean;
  unavailableReason?: string | null;
  multiple?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant={variant} icon={<Upload size={14} />} busy={busy} unavailableReason={unavailableReason} onClick={() => input.current?.click()}>
        {children}
      </Button>
      <input
        ref={input}
        type="file"
        hidden
        tabIndex={-1}
        aria-hidden="true"
        accept={ACCEPT}
        multiple={multiple}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) onFile(files);
        }}
      />
    </>
  );
}

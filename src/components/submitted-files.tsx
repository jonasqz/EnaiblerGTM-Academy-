import { FileText } from "lucide-react";

import type { SubmittedFile } from "@/db/schema/learning";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Files of one attempt: image thumbnails, other files as download links. */
export function SubmittedFiles(props: { files: readonly SubmittedFile[]; label: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{props.label}</p>
      <ul className="flex flex-wrap gap-3">
        {props.files.map((file) => (
          <li key={file.fileId}>
            <a
              href={`/files/${file.fileId}${file.kind === "image" ? "" : "?download=1"}`}
              target={file.kind === "image" ? "_blank" : undefined}
              rel="noopener"
              className="flex items-center gap-2 rounded-control border border-line bg-card p-2 text-sm hover:underline"
            >
              {file.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/files/${file.fileId}`}
                  alt=""
                  className="size-14 rounded-control object-cover"
                />
              ) : (
                <FileText aria-hidden size={20} className="text-muted" />
              )}
              <span className="max-w-48">
                <span className="block truncate font-semibold">{file.name}</span>
                <span className="text-xs text-muted">{formatSize(file.size)}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

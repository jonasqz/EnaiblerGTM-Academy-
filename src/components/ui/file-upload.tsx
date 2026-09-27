"use client";

import { FileText, ImageIcon, Paperclip, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";

/**
 * Uploads files as they are chosen (to /api/uploads, with progress) and puts
 * their ids into the surrounding form as hidden inputs, so the form's own
 * action only receives ids. Used by learners (hand-ins) and in the Studio.
 */

export interface UploadedFile {
  id: string;
  name: string;
  contentType: string;
  size: number;
  url: string;
}

export interface FileUploadLabels {
  choose: string;
  drop: string;
  uploading: string;
  remove: string;
  errors: {
    too_large: string;
    type_not_allowed: string;
    invalid_content: string;
    too_many: string;
    rate_limited: string;
    failed: string;
  };
}

interface Item {
  key: string;
  name: string;
  progress: number;
  file?: UploadedFile;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** POSTs one file to the upload route, reporting progress; used by FileUpload and editors. */
export function uploadFile(
  endpoint: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<{ ok: true; file: UploadedFile } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open("POST", endpoint);
    request.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(request.responseText) as Record<string, unknown>;
      } catch {
        // not JSON: treated as a failure below
      }
      if (request.status === 201) resolve({ ok: true, file: body as unknown as UploadedFile });
      else resolve({ ok: false, error: typeof body.error === "string" ? body.error : "failed" });
    };
    request.onerror = () => resolve({ ok: false, error: "failed" });
    request.send(file);
  });
}

export function FileUpload(props: {
  /** e.g. /api/uploads?purpose=submission&course=validation-lab */
  endpoint: string;
  /** Hidden input name the ids are submitted under. */
  name: string;
  accept: string;
  maxFiles: number;
  maxBytes: number;
  labels: FileUploadLabels;
  onBusyChange?: (busy: boolean) => void;
  onChange?: (files: UploadedFile[]) => void;
  /** Rendered as the drop zone's first line (e.g. what may be uploaded). */
  hint?: string;
  id?: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { onBusyChange, onChange } = props;

  const busy = items.some((item) => !item.file);
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);
  useEffect(() => {
    onChange?.(items.flatMap((item) => (item.file ? [item.file] : [])));
  }, [items, onChange]);

  const message = useCallback(
    (error: string, name: string) => {
      const known = props.labels.errors[error as keyof FileUploadLabels["errors"]];
      const template =
        known ??
        (error === "unknown_type"
          ? props.labels.errors.type_not_allowed
          : props.labels.errors.failed);
      return template.replace("{name}", name).replace("{max}", String(props.maxFiles));
    },
    [props.labels.errors, props.maxFiles],
  );

  const add = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const chosen = [...list];
    const room = props.maxFiles - items.length;
    const problems: string[] = [];
    if (chosen.length > room) problems.push(message("too_many", ""));
    const accepted = chosen.slice(0, Math.max(0, room)).filter((file) => {
      if (file.size > props.maxBytes) {
        problems.push(message("too_large", file.name));
        return false;
      }
      return true;
    });
    setErrors(problems);
    for (const file of accepted) {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`;
      setItems((current) => [...current, { key, name: file.name, progress: 0 }]);
      void uploadFile(props.endpoint, file, (fraction) =>
        setItems((current) =>
          current.map((item) => (item.key === key ? { ...item, progress: fraction } : item)),
        ),
      ).then((result) => {
        if (result.ok) {
          setItems((current) =>
            current.map((item) =>
              item.key === key ? { ...item, progress: 1, file: result.file } : item,
            ),
          );
        } else {
          setItems((current) => current.filter((item) => item.key !== key));
          setErrors((current) => [...current, message(result.error, file.name)]);
        }
      });
    }
    if (input.current) input.current.value = "";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    add(event.dataTransfer.files);
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-2 rounded-control border-2 border-dashed px-4 py-6 text-center text-sm transition-colors ${
          dragging ? "border-primary bg-primary-soft" : "border-line bg-subtle"
        }`}
      >
        <Upload aria-hidden size={22} className="text-muted" />
        {props.hint && <p className="text-muted">{props.hint}</p>}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => input.current?.click()}
            disabled={items.length >= props.maxFiles}
          >
            <Paperclip aria-hidden size={16} /> {props.labels.choose}
          </button>
          <span className="text-muted">{props.labels.drop}</span>
        </div>
        <input
          ref={input}
          id={props.id}
          type="file"
          multiple={props.maxFiles > 1}
          accept={props.accept}
          className="sr-only"
          onChange={(event) => add(event.target.files)}
        />
      </div>

      {errors.length > 0 && (
        <ul
          role="alert"
          className="space-y-1 text-sm font-semibold"
          style={{ color: "var(--status-critical)" }}
        >
          {errors.map((error, index) => (
            <li key={index}>{error}</li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.key}
              className="flex items-center gap-3 rounded-control border border-line bg-card px-3 py-2 text-sm"
            >
              {item.file?.contentType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.file.url}
                  alt=""
                  className="size-10 shrink-0 rounded-control object-cover"
                />
              ) : item.file ? (
                <FileText aria-hidden size={20} className="shrink-0 text-muted" />
              ) : (
                <ImageIcon aria-hidden size={20} className="shrink-0 text-muted" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{item.file?.name ?? item.name}</span>
                <span className="text-xs text-muted">
                  {item.file
                    ? formatSize(item.file.size)
                    : props.labels.uploading.replace(
                        "{percent}",
                        String(Math.round(item.progress * 100)),
                      )}
                </span>
                {!item.file && (
                  <span className="progress mt-1 block" aria-hidden>
                    <span style={{ width: `${Math.round(item.progress * 100)}%` }} />
                  </span>
                )}
              </span>
              {item.file && (
                <>
                  <input type="hidden" name={props.name} value={item.file.id} />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label={`${props.labels.remove}: ${item.file.name}`}
                    onClick={() =>
                      setItems((current) => current.filter((other) => other.key !== item.key))
                    }
                  >
                    <X aria-hidden size={16} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

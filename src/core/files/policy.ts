import type { StorageArea } from "@/core/storage/keys";
import type { FileFamily, SniffedType } from "@/core/files/sniff";

/**
 * What each kind of upload may contain, how big it may be and who may read it
 * back. Files are private by default (brief §3): only brand assets, path
 * visuals and lesson media are served to anyone on the academy's domain.
 */
export const FILE_PURPOSES = [
  "submission",
  "lesson_media",
  "source",
  "keyframe",
  "exemplar",
  "brand_logo",
  "brand_font",
  "path_visual",
  "showcase",
  "export",
] as const;
export type FilePurpose = (typeof FILE_PURPOSES)[number];

/**
 * public: anyone on the academy's domain (unguessable ids, cached forever).
 * owner_or_reviewer: the learner who uploaded it and the review team.
 * studio: people who edit courses.
 * owner: only the learner it belongs to.
 * showcase: public while a public credential shows it.
 */
export type FileAccess = "public" | "owner_or_reviewer" | "studio" | "owner" | "showcase";

const MB = 1024 * 1024;

export interface PurposeRule {
  families: readonly FileFamily[];
  /** Exact types within the families; all of the family when absent. */
  mimes?: readonly string[];
  maxBytes: number;
  access: FileAccess;
  area: StorageArea;
  /** Learner-owned files live under the learner's prefix, so deleting a learner deletes them. */
  ownerPrefix: boolean;
  /** Longest image side after processing; larger images are scaled down. */
  maxImageSide?: number;
}

const WEB_IMAGES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export const PURPOSE_RULES: Record<FilePurpose, PurposeRule> = {
  // Per assignment the accepted kinds and the size are narrower (submission-types.ts).
  submission: {
    families: ["pdf", "image", "text"],
    mimes: [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
      "text/plain",
      "text/markdown",
    ],
    maxBytes: 50 * MB,
    access: "owner_or_reviewer",
    area: "submissions",
    ownerPrefix: true,
    maxImageSide: 4096,
  },
  lesson_media: {
    families: ["image", "video"],
    mimes: [...WEB_IMAGES, "image/avif", "video/mp4", "video/webm"],
    maxBytes: 500 * MB,
    access: "public",
    area: "assets",
    ownerPrefix: false,
    maxImageSide: 2400,
  },
  source: {
    families: ["video", "audio", "pdf", "text"],
    maxBytes: 2048 * MB,
    access: "studio",
    area: "sources",
    ownerPrefix: false,
  },
  keyframe: {
    families: ["image"],
    mimes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 10 * MB,
    access: "studio",
    area: "sources",
    ownerPrefix: false,
    maxImageSide: 2400,
  },
  exemplar: {
    families: ["pdf", "text"],
    maxBytes: 20 * MB,
    access: "studio",
    area: "sources",
    ownerPrefix: false,
  },
  brand_logo: {
    families: ["image", "svg"],
    mimes: ["image/png", "image/webp", "image/svg+xml"],
    maxBytes: 2 * MB,
    access: "public",
    area: "assets",
    ownerPrefix: false,
    maxImageSide: 1024,
  },
  brand_font: {
    families: ["font"],
    maxBytes: 5 * MB,
    access: "public",
    area: "assets",
    ownerPrefix: false,
  },
  path_visual: {
    families: ["svg", "image"],
    mimes: ["image/svg+xml", "image/png", "image/webp"],
    maxBytes: 1 * MB,
    access: "public",
    area: "assets",
    ownerPrefix: false,
    maxImageSide: 1200,
  },
  showcase: {
    families: ["image"],
    mimes: ["image/png", "image/jpeg", "image/webp"],
    maxBytes: 5 * MB,
    access: "showcase",
    area: "credentials",
    ownerPrefix: true,
    maxImageSide: 2000,
  },
  export: {
    families: [],
    maxBytes: 2048 * MB,
    access: "owner",
    area: "exports",
    ownerPrefix: true,
  },
};

export type UploadIssue = "unknown_type" | "type_not_allowed" | "too_large";

/** Checks a sniffed type against the purpose; `maxBytes` narrows the purpose's own limit. */
export function uploadIssue(
  purpose: FilePurpose,
  type: SniffedType | null,
  size: number,
  maxBytes = PURPOSE_RULES[purpose].maxBytes,
): UploadIssue | null {
  const rule = PURPOSE_RULES[purpose];
  if (!type) return "unknown_type";
  if (!rule.families.includes(type.family)) return "type_not_allowed";
  if (rule.mimes && !rule.mimes.includes(type.mime)) return "type_not_allowed";
  if (size > Math.min(maxBytes, rule.maxBytes)) return "too_large";
  return null;
}

/** Download names: plain, short, with the stored type's extension. */
export function safeFileName(name: string, ext: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/\.[A-Za-z0-9]{1,8}$/, "")
    .replace(/[^\w .-]+/g, "")
    .replace(/\.{2,}/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s.-]+|[\s.-]+$/g, "")
    .slice(0, 80);
  return `${base || "file"}.${ext}`;
}

/** Where browsers may show a file instead of downloading it. */
export function inlineAllowed(family: FileFamily): boolean {
  return family === "image" || family === "video" || family === "audio" || family === "font";
}

export interface FileAccessSubject {
  purpose: FilePurpose;
  status: "pending" | "attached";
  ownerUserId: string | null;
}

export interface FileReader {
  userId: string;
  canReview: boolean;
  canEditCourses: boolean;
}

/**
 * Read access to a stored file. Everything that is not public needs a
 * signed-in viewer of the academy; a pending upload is only visible to the
 * person who uploaded it. Showcase files are public while a public
 * credential shows them (checked by the caller); otherwise owner only.
 */
export function canReadFile(
  file: FileAccessSubject,
  reader: FileReader | null,
  context: { showcasedPublicly?: boolean } = {},
): boolean {
  const isOwner = reader !== null && file.ownerUserId === reader.userId;
  if (file.status === "pending") return isOwner;
  switch (PURPOSE_RULES[file.purpose].access) {
    case "public":
      return true;
    case "owner":
      return isOwner;
    case "showcase":
      return isOwner || context.showcasedPublicly === true;
    case "owner_or_reviewer":
      return isOwner || (reader?.canReview ?? false);
    case "studio":
      return reader?.canEditCourses ?? false;
  }
}

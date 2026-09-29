import { join } from "node:path";

import { groupByTime } from "@/core/authoring/transcript";
import { jobErrorCode, JobFailure, PERMANENT_JOB_ERRORS } from "@/core/authoring/job-errors";
import { isLocale } from "@/core/i18n/locales";
import { normalizeChapters } from "@/core/media/chapters";
import type { Database } from "@/db/client";
import { usageMeter } from "@/server/ai-usage";
import { downloadFile, extractAudio, tempDir } from "@/server/authoring/media";
import { meteredModel, type AuthoringModel } from "@/server/authoring/model";
import { fineSegments, topicsFromModel } from "@/server/authoring/recordings";
import { transcribe, type WhisperConfig } from "@/server/authoring/speech";
import { loadVideo, originalOf, updateVideoRow } from "@/server/media/library";
import { probeVideo } from "@/server/media/transcode";

/*
 * The `media.transcribe` job: captions, the searchable transcript and the
 * chapters of an uploaded video (webinar brief §2.4), by the same pipeline
 * as course recordings: our own Whisper, then topic segmentation. Both calls
 * are metered for the academy and checked against its AI allowance. The
 * video plays without it; captions appear when this is done.
 */
export async function transcribeVideo(
  db: Database,
  tenantId: string,
  assetId: string,
  deps: { whisper: WhisperConfig | null; model: AuthoringModel | null; finalAttempt: boolean },
): Promise<void> {
  const asset = await loadVideo(db, tenantId, assetId);
  if (!asset || asset.kind !== "upload") return;
  const fail = (error: string) =>
    updateVideoRow(db, tenantId, assetId, { transcriptStatus: "failed", transcriptError: error });
  if (!deps.whisper) return fail("whisper_missing");
  const original = await originalOf(db, tenantId, asset);
  if (!original) return fail("file_missing");

  await updateVideoRow(db, tenantId, assetId, {
    transcriptStatus: "processing",
    transcriptError: null,
  });
  const dir = await tempDir("enaibler-media-");
  try {
    const input = join(dir.path, `original.${original.contentType.split("/")[1] ?? "bin"}`);
    await downloadFile(original, input);
    const probe = await probeVideo(input);
    if (probe && !probe.hasAudio) throw new JobFailure("no_speech");
    const audio = join(dir.path, "audio.mp3");
    await extractAudio(input, audio);

    const locale = isLocale(asset.locale) ? asset.locale : null;
    const scope = { tenantId, refId: assetId };
    const segments = await transcribe(
      deps.whisper,
      audio,
      locale,
      usageMeter(db, { ...scope, kind: "transcription" }),
    );
    if (segments.length === 0) throw new JobFailure("no_speech");
    const topics =
      (deps.model && locale
        ? await topicsFromModel(
            meteredModel(db, deps.model, { ...scope, kind: "recording_topics" }),
            segments,
            locale,
          )
        : null) ?? groupByTime(segments);

    const current = await loadVideo(db, tenantId, assetId);
    if (!current) return;
    await updateVideoRow(db, tenantId, assetId, {
      transcript: fineSegments(segments),
      transcriptStatus: "ready",
      transcriptError: null,
      // Chapters the authors already named stay; a first transcript brings them.
      ...(current.chapters.some((chapter) => chapter.title)
        ? {}
        : { chapters: normalizeChapters(topics, probe?.durationSec ?? current.durationSec) }),
    });
  } catch (error) {
    const code = jobErrorCode(error, "transcription_failed");
    if (!deps.finalAttempt && !PERMANENT_JOB_ERRORS.has(code) && code !== "no_speech") throw error;
    console.error("[media] transcription failed", error);
    await fail(code);
  } finally {
    await dir.cleanup();
  }
}

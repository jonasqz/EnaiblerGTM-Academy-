import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  buildTopicsPrompt,
  formatClock,
  groupByTime,
  keyframeTimes,
  parseTopics,
  TOPICS_JSON_SCHEMA,
  TOPICS_PROMPT_VERSION,
  type TimedText,
  type Topic,
} from "@/core/authoring/transcript";
import { isLocale, type Locale } from "@/core/i18n/locales";
import { JobFailure, jobErrorCode } from "@/core/authoring/job-errors";
import type { Database } from "@/db/client";
import type { TranscriptSegment } from "@/db/schema/authoring";
import { usageRecorder } from "@/server/ai-usage";
import { meteredModel, type AuthoringModel } from "@/server/authoring/model";
import {
  downloadFile,
  extractAudio,
  grabFrame,
  hasVideo,
  sceneChanges,
  tempDir,
} from "@/server/authoring/media";
import { loadSource, storeSourceText, updateSource } from "@/server/authoring/sources";
import { transcribe, type WhisperConfig } from "@/server/authoring/speech";
import { deleteFiles, loadFile, storeFile } from "@/server/files";
import type { QueueName, JobPayloads } from "@/server/jobs/queues";
import { QUEUES } from "@/server/jobs/queues";

/*
 * Screen recordings with narration (brief §7, step 2): transcription on our
 * own Whisper, topic segments, and one screenshot per step. Runs in the
 * worker; both jobs can be retried from scratch.
 */

export type NextJob = <Q extends QueueName>(name: Q, data: JobPayloads[Q]) => Promise<void>;

async function topicsFromModel(
  model: AuthoringModel,
  segments: readonly TimedText[],
  locale: Locale,
): Promise<Topic[] | null> {
  if (segments.length < 2 || segments.length > 1_500) return null;
  const prompt = buildTopicsPrompt(segments, locale, randomUUID());
  try {
    const call = await model.llm({
      model: model.model,
      temperature: 0.2,
      maxTokens: 2_000,
      jsonSchema: { ...TOPICS_JSON_SCHEMA, schema: { ...TOPICS_JSON_SCHEMA.schema } },
      metadata: { purpose: "recording-topics", prompt_version: TOPICS_PROMPT_VERSION },
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    });
    return parseTopics(call.content, segments);
  } catch (error) {
    console.warn("[authoring] topic segmentation failed; grouping by time", error);
    return null;
  }
}

function transcriptText(topics: readonly TranscriptSegment[]): string {
  return topics
    .map(
      (topic) =>
        `## ${topic.title ?? formatClock(topic.startSec)} (${formatClock(topic.startSec)}–${formatClock(topic.endSec)})\n\n${topic.text}`,
    )
    .join("\n\n");
}

/** The `transcription.run` job. */
export async function transcribeRecording(
  db: Database,
  tenantId: string,
  sourceId: string,
  deps: {
    whisper: WhisperConfig | null;
    model: AuthoringModel | null;
    next: NextJob;
    finalAttempt: boolean;
  },
): Promise<void> {
  const source = await loadSource(db, tenantId, sourceId);
  if (!source || source.kind !== "recording") return;
  if (!deps.whisper) {
    await updateSource(db, tenantId, sourceId, {
      status: "failed",
      error: "whisper_missing",
    });
    return;
  }
  const record = source.fileId ? await loadFile(db, tenantId, source.fileId) : null;
  if (!record) {
    await updateSource(db, tenantId, sourceId, {
      status: "failed",
      error: "file_missing",
    });
    return;
  }
  await updateSource(db, tenantId, sourceId, { status: "processing", error: null });
  const dir = await tempDir();
  try {
    const input = join(dir.path, `recording.${record.contentType.split("/")[1] ?? "bin"}`);
    await downloadFile(record, input);
    const audio = join(dir.path, "audio.mp3");
    await extractAudio(input, audio);
    const locale = isLocale(source.locale) ? source.locale : null;
    const scope = { tenantId, courseId: source.courseId, refId: sourceId };
    const segments = await transcribe(
      deps.whisper,
      audio,
      locale,
      usageRecorder(db, { ...scope, kind: "transcription" }),
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
    const transcript: TranscriptSegment[] = topics.map((topic) => ({
      startSec: Math.round(topic.startSec * 10) / 10,
      endSec: Math.round(topic.endSec * 10) / 10,
      ...(topic.title ? { title: topic.title } : {}),
      text: topic.text,
    }));
    await updateSource(db, tenantId, sourceId, { transcript });
    await storeSourceText(db, tenantId, sourceId, transcriptText(transcript));
    if (await hasVideo(input)) await deps.next(QUEUES.keyframes, { tenantId, sourceId });
  } catch (error) {
    if (!deps.finalAttempt) throw error;
    console.error("[authoring] transcription failed", error);
    await updateSource(db, tenantId, sourceId, {
      status: "failed",
      error: jobErrorCode(error, "transcription_failed"),
    });
  } finally {
    await dir.cleanup();
  }
}

/** The `keyframes.extract` job: a screenshot per topic, at its last step change. */
export async function extractKeyframes(
  db: Database,
  tenantId: string,
  sourceId: string,
): Promise<void> {
  const source = await loadSource(db, tenantId, sourceId);
  if (!source?.transcript?.length || !source.fileId) return;
  const record = await loadFile(db, tenantId, source.fileId);
  if (!record) return;
  const dir = await tempDir();
  try {
    const input = join(dir.path, `recording.${record.contentType.split("/")[1] ?? "bin"}`);
    await downloadFile(record, input);
    const times = keyframeTimes(source.transcript, await sceneChanges(input));

    const previous = (
      await Promise.all(
        source.transcript.map((segment) =>
          segment.keyframeFileId ? loadFile(db, tenantId, segment.keyframeFileId) : null,
        ),
      )
    ).filter((file) => file?.purpose === "keyframe");

    const transcript: TranscriptSegment[] = [];
    for (const [index, segment] of source.transcript.entries()) {
      const frame = join(dir.path, `frame-${index}.jpg`);
      let keyframeFileId: string | undefined;
      try {
        await grabFrame(input, times[index]!, frame);
        const stored = await storeFile(db, tenantId, {
          purpose: "keyframe",
          body: new Uint8Array(await readFile(frame)),
          name: `${segment.title ?? `Step ${index + 1}`}.jpg`,
          createdBy: source.createdBy,
        });
        keyframeFileId = stored.id;
      } catch (error) {
        console.warn(`[authoring] no keyframe for topic ${index}`, error);
      }
      transcript.push({ ...segment, keyframeFileId });
    }
    await updateSource(db, tenantId, sourceId, { transcript });
    await deleteFiles(
      db,
      tenantId,
      previous.filter((file): file is NonNullable<typeof file> => file !== null),
    );
  } finally {
    await dir.cleanup();
  }
}

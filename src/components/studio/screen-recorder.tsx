"use client";

import { Circle, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useStudioText } from "@/components/studio/studio-text";
import { uploadFile, type UploadedFile } from "@/components/ui/file-upload";

/**
 * Records the screen with the author's narration in the browser (no extension,
 * no extra app) and uploads the result as a course source.
 */

type Phase = "idle" | "recording" | "uploading" | "error";

function supportedType(): string {
  for (const type of ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
  }
  return "video/webm";
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ScreenRecorder(props: {
  endpoint: string;
  onUploaded: (file: UploadedFile) => void;
}) {
  const t = useStudioText();
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const streams = useRef<MediaStream[]>([]);
  const supported =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getDisplayMedia) &&
    typeof MediaRecorder !== "undefined";

  useEffect(() => {
    if (phase !== "recording") return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const stopTracks = () => {
    for (const stream of streams.current) stream.getTracks().forEach((track) => track.stop());
    streams.current = [];
  };

  const start = async () => {
    setError(null);
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15 },
        audio: false,
      });
      const voice = await navigator.mediaDevices
        .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
        .catch(() => null);
      streams.current = [screen, ...(voice ? [voice] : [])];
      const stream = new MediaStream([
        ...screen.getVideoTracks(),
        ...(voice ? voice.getAudioTracks() : []),
      ]);
      const type = supportedType();
      const chunks: Blob[] = [];
      const next = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 1_500_000 });
      next.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      next.onstop = async () => {
        stopTracks();
        setPhase("uploading");
        const file = new File(
          [new Blob(chunks, { type: "video/webm" })],
          `${t.t("common.recorder.fileName")}.webm`,
          {
            type: "video/webm",
          },
        );
        const result = await uploadFile(props.endpoint, file, (fraction) =>
          setPercent(Math.round(fraction * 100)),
        );
        if (result.ok) {
          setPhase("idle");
          props.onUploaded(result.file);
        } else {
          setPhase("error");
          setError(t.t("common.recorder.uploadFailed"));
        }
      };
      // The browser's own "Stop sharing" button ends the recording too.
      screen.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (next.state === "recording") next.stop();
      });
      recorder.current = next;
      next.start(1000);
      setSeconds(0);
      setPhase("recording");
      if (!voice) setError(t.t("common.recorder.noMicrophone"));
    } catch {
      stopTracks();
      setPhase("idle");
      setError(t.t("common.recorder.cancelled"));
    }
  };

  if (!supported) {
    return <p className="text-sm text-muted">{t.t("common.recorder.unsupported")}</p>;
  }
  return (
    <div className="space-y-2">
      {phase === "recording" ? (
        <button
          type="button"
          className="btn btn-danger btn-sm"
          onClick={() => recorder.current?.stop()}
        >
          <Square aria-hidden size={14} /> {t.t("common.recorder.stop", { time: clock(seconds) })}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void start()}
          disabled={phase === "uploading"}
        >
          <Circle aria-hidden size={14} className="text-[var(--status-critical)]" />
          {phase === "uploading"
            ? t.t("common.recorder.uploading", { percent })
            : t.t("common.recorder.start")}
        </button>
      )}
      {error && <p className="hint">{error}</p>}
    </div>
  );
}

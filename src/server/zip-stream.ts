import { Zip, ZipDeflate, ZipPassThrough } from "fflate";

/**
 * A zip archive produced while the client downloads it: files are read from
 * storage one chunk at a time, so an export never has to fit in memory.
 */
export type ZipPart =
  | { path: string; text: string }
  | { path: string; open: () => Promise<ReadableStream<Uint8Array>> };

export function zipStream(parts: readonly ZipPart[]): ReadableStream<Uint8Array> {
  const ready: Uint8Array[] = [];
  let finished = false;
  let failure: Error | null = null;
  const zip = new Zip((error, chunk, final) => {
    if (error) failure = error;
    else {
      ready.push(chunk);
      if (final) finished = true;
    }
  });

  async function* feed() {
    for (const part of parts) {
      if ("text" in part) {
        const entry = new ZipDeflate(part.path, { level: 6 });
        zip.add(entry);
        entry.push(new TextEncoder().encode(part.text), true);
        yield;
        continue;
      }
      const entry = new ZipPassThrough(part.path);
      zip.add(entry);
      const reader = (await part.open()).getReader();
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        entry.push(next.value);
        yield;
      }
      entry.push(new Uint8Array(0), true);
      yield;
    }
    zip.end();
  }
  const steps = feed();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (ready.length === 0 && !finished && !failure) {
          if ((await steps.next()).done) break;
        }
      } catch (error) {
        failure = error as Error;
      }
      if (failure) return controller.error(failure);
      while (ready.length > 0) controller.enqueue(ready.shift()!);
      if (finished) controller.close();
    },
    async cancel() {
      await steps.return(undefined);
    },
  });
}

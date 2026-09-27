import { getDb } from "@/db/client";
import { getSession } from "@/server/access";
import { loadFile, openFile } from "@/server/files";
import { exportMyData } from "@/server/profile";
import { zipStream, type ZipPart } from "@/server/zip-stream";

/** Data export (brief §9): everything this academy stores about the learner, with their files. */
export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Not found", { status: 404 });
  const { tenant, viewer } = session;
  const data = await exportMyData(getDb(), tenant, viewer.userId);

  const parts: ZipPart[] = [{ path: "my-data.json", text: JSON.stringify(data, null, 2) }];
  for (const file of data.files) {
    parts.push({
      // The id keeps names unique; the JSON lists the same ids.
      path: `files/${file.id.slice(0, 8)}-${file.name}`,
      open: async () => {
        const record = await loadFile(getDb(), tenant.id, file.id);
        if (!record) throw new Error("File disappeared during the export");
        return (await openFile(record)).body;
      },
    });
  }
  return new Response(zipStream(parts), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${tenant.slug}-my-data.zip"`,
      "cache-control": "private, no-store",
    },
  });
}

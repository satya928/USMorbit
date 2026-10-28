import { getDb } from "@/db";
import { getContext } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { getAttachmentForDownload } from "@/domain/files/service";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  const { id } = await params;
  try {
    const { file, bytes } = await getAttachmentForDownload(getDb(), ctx, id);
    const inline = file.contentType.startsWith("image/") || file.contentType === "application/pdf";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(file.fileName)}"`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (e) {
    // Out-of-scope and missing files are indistinguishable.
    if (e instanceof AppError) return Response.json({ error: e.code === "FORBIDDEN" ? "Forbidden" : "Not found" }, { status: e.code === "FORBIDDEN" ? 403 : 404 });
    throw e;
  }
}

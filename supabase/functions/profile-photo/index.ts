import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import jpeg from "npm:jpeg-js@0.4.4";
import { sanitizePhoto } from "../_shared/photo-codec.ts";
import { photoUploadHandler } from "../_shared/photo-upload.ts";
import { cleanRetiredAvatars } from "../_shared/avatar-cleanup.ts";
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
async function actor(token: string) {
  const { data, error } = await admin.auth.getUser(token);
  if (error && error.status !== 401 && error.status !== 403)
    throw new Error("Auth unavailable");
  return error ? null : (data.user?.id ?? null);
}
const upload = photoUploadHandler({
  actor,
  async claim(actor, id) {
    const { data, error } = await admin
      .rpc("claim_avatar_upload", { actor, asset_id: id })
      .single();
    if (error?.code === "42501") return null;
    if (error || !data) throw new Error("Avatar unavailable");
    return data as { id: string; path: string };
  },
  sanitize: (bytes) =>
    sanitizePhoto(bytes, jpeg, { dimension: 320, bytes: 262144 }),
  async store(asset, bytes, actor) {
    const uploaded = await admin.storage
      .from("profile-photos")
      .upload(asset.path, bytes, {
        contentType: "image/jpeg",
        cacheControl: "0",
        upsert: false,
      });
    if (uploaded.error) throw new Error("Storage unavailable");
    const result = await admin.rpc("finish_avatar_upload", {
      asset_id: asset.id,
      actor,
    });
    if (result.error) throw new Error("Avatar unavailable");
    await cleanRetiredAvatars(admin, actor);
  },
});
Deno.serve(async (request) => {
  if (request.method !== "DELETE") {
    const response = await upload(request);
    if (response.ok) return response;
    const body = await response.json();
    const code =
      body.code === "invalid_photo"
        ? "avatar_invalid_photo"
        : body.code === "photo_upload_unavailable"
          ? "avatar_unavailable"
          : body.code;
    return Response.json(
      { code },
      { status: response.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  const reply = (status: number, code: string) =>
    Response.json(
      { code, removed: status === 200 },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  if (request.headers.has("origin")) return reply(403, "request_forbidden");
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([A-Za-z0-9_.-]{1,8192})$/)?.[1];
  if (!token) return reply(401, "auth_required");
  try {
    const id = await actor(token);
    if (!id) return reply(401, "auth_required");
    const result = await admin.rpc("retire_avatar", { actor: id });
    if (result.error) throw new Error("Avatar unavailable");
    await cleanRetiredAvatars(admin, id);
    return reply(200, "avatar_removed");
  } catch {
    return reply(503, "avatar_unavailable");
  }
});

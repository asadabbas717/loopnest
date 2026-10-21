import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import jpeg from "npm:jpeg-js@0.4.4";
import { sanitizePhoto } from "../_shared/photo-codec.ts";
import { photoUploadHandler } from "../_shared/photo-upload.ts";
const url = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve(
  photoUploadHandler({
    async actor(token) {
      const { data, error } = await admin.auth.getUser(token);
      if (error && error.status !== 401 && error.status !== 403)
        throw new Error("Auth unavailable");
      return !error && data.user ? data.user.id : null;
    },
    async claim(actor, id) {
      const { data, error } = await admin
        .rpc("claim_photo_validation", { asset_id: id, actor })
        .single();
      if (error) {
        if (error.code === "42501") return null;
        throw new Error("Claim unavailable");
      }
      const asset = data as { id: string; path: string } | null;
      if (
        !asset ||
        typeof asset.id !== "string" ||
        typeof asset.path !== "string"
      )
        throw new Error("Claim unavailable");
      return asset;
    },
    sanitize(bytes) {
      return sanitizePhoto(bytes, jpeg);
    },
    async store(asset, bytes, actor) {
      const { error } = await admin.storage
        .from("chat-photos")
        .upload(asset.path, bytes, {
          contentType: "image/jpeg",
          upsert: false,
          cacheControl: "0",
        });
      if (error) throw new Error("Storage unavailable");
      const result = await admin.rpc("finish_photo_validation", {
        asset_id: asset.id,
        actor,
      });
      if (result.error) throw new Error("Finalization unavailable");
    },
  }),
);

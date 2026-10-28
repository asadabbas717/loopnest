import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { openPhotoHandler } from "../_shared/open-photo.ts";
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
Deno.serve(
  openPhotoHandler({
    async actor(token) {
      const { data, error } = await admin.auth.getUser(token);
      if (error && error.status !== 401 && error.status !== 403)
        throw new Error("Auth unavailable");
      return error ? null : (data.user?.id ?? null);
    },
    async claim(actor, id) {
      const { data, error } = await admin
        .rpc("claim_one_time_photo", { asset_id: id, actor })
        .single();
      if (error?.code === "42501") return null;
      if (error || typeof data?.path !== "string")
        throw new Error("Claim unavailable");
      if (typeof data.server_time !== "string")
        throw new Error("Deadline unavailable");
      return {
        path: data.path as string,
        expires_at: data.expires_at as string | null,
        server_time: data.server_time as string,
      };
    },
    async read(path) {
      const { data, error } = await admin.storage
        .from("chat-photos")
        .download(path);
      if (error || !data) throw new Error("Photo unavailable");
      return new Uint8Array(await data.arrayBuffer());
    },
  }),
);

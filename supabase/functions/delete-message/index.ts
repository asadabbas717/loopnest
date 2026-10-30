import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { deleteMessageHandler } from "../_shared/delete-message.ts";
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
Deno.serve(
  deleteMessageHandler({
    async actor(token) {
      const { data, error } = await admin.auth.getUser(token);
      if (error && error.status !== 401 && error.status !== 403)
        throw new Error("Auth unavailable");
      return error ? null : (data.user?.id ?? null);
    },
    async begin(cid, mid, actor) {
      const { data, error } = await admin
        .rpc("begin_message_delete", { cid, mid, actor })
        .single();
      if (error) throw error;
      return data as { done: boolean; path: string | null };
    },
    async remove(path) {
      const { error } = await admin.storage.from("chat-photos").remove([path]);
      if (error) throw new Error("Storage unavailable");
    },
    async finish(mid) {
      const { error } = await admin.rpc("finish_message_delete", { mid });
      if (error) throw new Error("Deletion pending");
    },
  }),
);

import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { clearChatHandler } from "../_shared/clear-chat.ts";
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
Deno.serve(
  clearChatHandler({
    async actor(token) {
      const { data, error } = await admin.auth.getUser(token);
      if (error && error.status !== 401 && error.status !== 403)
        throw new Error("Auth unavailable");
      return error ? null : (data.user?.id ?? null);
    },
    async begin(cid, actor, requestId) {
      const { data, error } = await admin
        .rpc("begin_chat_clear", { cid, actor, request_id: requestId })
        .single();
      if (error) throw error;
      return data as { job_id: string; done: boolean };
    },
    async paths(id, offset) {
      const { data, error } = await admin
        .rpc("chat_clear_paths", { clear_id: id })
        .range(offset, offset + 99);
      if (error) throw new Error("Enumeration unavailable");
      return (data as { path: string }[]).map((row) => row.path);
    },
    async remove(paths) {
      const { error } = await admin.storage.from("chat-photos").remove(paths);
      if (error) throw new Error("Storage unavailable");
    },
    async finish(id) {
      const { error } = await admin.rpc("finish_chat_clear", { clear_id: id });
      if (error) throw new Error("Clear pending");
    },
  }),
);

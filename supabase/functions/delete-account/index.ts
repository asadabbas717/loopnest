import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { accountErasureHandler } from "../_shared/erasure.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const publicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve(
  accountErasureHandler({
    async actor(token) {
      const { data, error } = await admin.auth.getUser(token);
      if (error && error.status !== 401 && error.status !== 403)
        throw new Error("Auth service unavailable");
      return !error && data.user?.email
        ? { id: data.user.id, email: data.user.email }
        : null;
    },
    async reauthenticate(actor, password) {
      const isolated = createClient(url, publicKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await isolated.auth.signInWithPassword({
        email: actor.email,
        password,
      });
      if (error && error.code !== "invalid_credentials") {
        if (error.status === 429)
          throw Object.assign(new Error("Auth rate limit"), {
            code: "over_request_rate_limit",
          });
        throw new Error("Auth service unavailable");
      }
      const valid = !error && data.user?.id === actor.id;
      if (data.session) await isolated.auth.signOut({ scope: "local" });
      return valid;
    },
    async freeze(id) {
      const { error } = await admin.rpc("begin_account_erasure", { actor: id });
      if (error) throw new Error("Freeze failed");
    },
    async paths(id, offset) {
      const { data, error } = await admin
        .rpc("account_erasure_paths", { actor: id })
        .order("path")
        .range(offset, offset + 99);
      if (error) throw new Error("Enumeration failed");
      return (data as { path: string }[]).map((row) => row.path);
    },
    async remove(paths) {
      const { error } = await admin.storage.from("chat-photos").remove(paths);
      if (error) throw new Error("Storage removal failed");
    },
    async deleteUser(id) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw new Error("Auth deletion failed");
    },
  }),
);

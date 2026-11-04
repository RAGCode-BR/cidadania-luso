import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (Boolean(url) !== Boolean(key)) {
  throw new Error("Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY juntos.");
}

export const cloudEnabled = Boolean(url && key);
export const cloud = cloudEnabled ? createClient(url, key) : null;

export async function signedInUser() {
  if (!cloud) return null;
  const { data, error } = await cloud.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") throw error;
  return data?.user || null;
}

export async function memberFor(user) {
  if (!user) return null;
  const { data, error } = await cloud.from("luso_members")
    .select("display_name").eq("user_id", user.id).eq("active", true).maybeSingle();
  if (error) throw error;
  return data ? { role: "admin", teamId: "equipe", name: data.display_name } : null;
}

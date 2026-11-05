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
  const { data: sessionData, error: sessionError } = await cloud.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) return null;
  const { data, error } = await cloud.auth.getUser();
  if (error) throw error;
  return data.user;
}

// No CRM todos os membros têm acesso completo (role "admin"); isAdmin controla
// apenas a gestão de usuários. teamId é o próprio usuário: é quem fica
// responsável pelos cartões que cria.
export async function memberFor(user) {
  if (!user) return null;
  const { data, error } = await cloud.from("luso_members")
    .select("display_name, login, is_admin, must_change_password").eq("user_id", user.id).eq("active", true).maybeSingle();
  if (error) throw error;
  return data ? {
    role: "admin", teamId: user.id, name: data.display_name, userId: user.id, login: data.login,
    isAdmin: data.is_admin, mustChangePassword: data.must_change_password,
  } : null;
}

// Nomes da equipe ativa, visíveis para todos os membros (função luso_team).
export async function listTeam() {
  const { data, error } = await cloud.rpc("luso_team");
  if (error) throw error;
  return data.map((row) => ({ id: row.user_id, name: row.display_name }));
}

export async function listMembers() {
  const { data, error } = await cloud.from("luso_members")
    .select("user_id, display_name, login, is_admin, must_change_password, active, created_at")
    .order("display_name");
  if (error) throw error;
  return data;
}

// Chama a Edge Function luso-users e traduz o erro devolvido por ela.
export async function manageUsers(action, payload = {}) {
  const { data, error } = await cloud.functions.invoke("luso-users", { body: { action, ...payload } });
  if (error) {
    const body = await error.context?.json?.().catch(() => null);
    throw new Error(body?.error || "Não foi possível falar com o servidor. Tente novamente.");
  }
  return data;
}

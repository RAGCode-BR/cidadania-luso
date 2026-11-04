// Gestão de usuários da Luso. Roda no Supabase com a chave service role, que
// nunca vai para o navegador. Toda chamada exige um usuário autenticado:
// - create / update / delete: somente administradores ativos;
// - set-password: o próprio usuário, apenas enquanto a senha for temporária.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const LOGIN_DOMAIN = "usuarios.luso.internal";
const LOGIN_PATTERN = /^[a-z0-9][a-z0-9._-]{2,39}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class Failure extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function checkPassword(value: unknown) {
  const password = typeof value === "string" ? value : "";
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX)
    throw new Failure(`A senha deve ter de ${PASSWORD_MIN} a ${PASSWORD_MAX} caracteres.`);
  return password;
}

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function caller(request: Request) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Failure("Entre no sistema novamente.", 401);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Failure("Sua sessão expirou. Entre novamente.", 401);
  const { data: member, error: memberError } = await admin.from("luso_members")
    .select("user_id, is_admin, must_change_password, active").eq("user_id", data.user.id).maybeSingle();
  if (memberError) throw memberError;
  if (!member?.active) throw new Failure("Sua conta não tem acesso à equipe Luso.", 403);
  return member;
}

function checkLogin(value: unknown) {
  const login = String(value ?? "").trim().toLowerCase();
  if (!LOGIN_PATTERN.test(login))
    throw new Failure("Use um login de 3 a 40 caracteres: letras sem acento, números, ponto, hífen ou sublinhado.");
  return login;
}
function checkName(value: unknown) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!name || name.length > 120) throw new Failure("Informe o nome do usuário (até 120 caracteres).");
  return name;
}
const duplicateLogin = (message: string) => /already|exists|registered/i.test(message);

async function otherActiveAdmins(exceptId: string) {
  const { count, error } = await admin.from("luso_members")
    .select("user_id", { count: "exact", head: true }).eq("is_admin", true).eq("active", true).neq("user_id", exceptId);
  if (error) throw error;
  return count ?? 0;
}

async function createUser(input: Record<string, unknown>) {
  const login = checkLogin(input.login);
  const name = checkName(input.name);
  const password = checkPassword(input.password);
  const { data, error } = await admin.auth.admin.createUser({
    email: `${login}@${LOGIN_DOMAIN}`, password, email_confirm: true, user_metadata: { display_name: name },
  });
  if (error) {
    if (duplicateLogin(error.message)) throw new Failure("Já existe um usuário com esse login.", 409);
    throw error;
  }
  const member = { user_id: data.user.id, display_name: name, login, is_admin: input.isAdmin === true, must_change_password: true, active: true };
  const { error: insertError } = await admin.from("luso_members").insert(member);
  if (insertError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw insertError;
  }
  return { user: member };
}

async function deleteUser(self: { user_id: string }, input: Record<string, unknown>) {
  const id = String(input.userId ?? "");
  if (id === self.user_id) throw new Failure("Você não pode excluir a própria conta.");
  const { data: target, error } = await admin.from("luso_members").select("user_id, is_admin").eq("user_id", id).maybeSingle();
  if (error) throw error;
  if (!target) throw new Failure("Usuário não encontrado.", 404);
  if (target.is_admin && (await otherActiveAdmins(id)) < 1) throw new Failure("Mantenha ao menos um administrador.");
  const { error: deleteError } = await admin.auth.admin.deleteUser(id);
  if (deleteError) throw deleteError;
  return { deleted: id };
}

// Edita nome, login e perfil; opcionalmente define nova senha temporária, o que
// obriga a pessoa a criar outra senha no próximo acesso.
async function updateUser(self: { user_id: string }, input: Record<string, unknown>) {
  const id = String(input.userId ?? "");
  const { data: target, error } = await admin.from("luso_members").select("user_id, login, is_admin").eq("user_id", id).maybeSingle();
  if (error) throw error;
  if (!target) throw new Failure("Usuário não encontrado.", 404);
  const name = checkName(input.name);
  const login = checkLogin(input.login);
  const isAdmin = input.isAdmin === true;
  const password = input.password ? checkPassword(input.password) : "";
  if (id === self.user_id && !isAdmin) throw new Failure("Você não pode remover o próprio acesso de administrador.");
  if (id === self.user_id && password) throw new Failure("Para trocar a sua própria senha, peça a outro administrador.");
  if (target.is_admin && !isAdmin && (await otherActiveAdmins(id)) < 1) throw new Failure("Mantenha ao menos um administrador.");
  const changes: Record<string, unknown> = {};
  if (login !== target.login) Object.assign(changes, { email: `${login}@${LOGIN_DOMAIN}`, email_confirm: true });
  if (password) changes.password = password;
  if (Object.keys(changes).length) {
    const { error: authError } = await admin.auth.admin.updateUserById(id, { ...changes, user_metadata: { display_name: name } });
    if (authError) {
      if (duplicateLogin(authError.message)) throw new Failure("Já existe um usuário com esse login.", 409);
      throw authError;
    }
  }
  const member: Record<string, unknown> = { display_name: name, login, is_admin: isAdmin };
  if (password) member.must_change_password = true;
  const { data: updated, error: updateError } = await admin.from("luso_members").update(member).eq("user_id", id)
    .select("user_id, display_name, login, is_admin, must_change_password").single();
  if (updateError) throw updateError;
  return { user: updated };
}

async function setPassword(self: { user_id: string; must_change_password: boolean }, input: Record<string, unknown>) {
  if (!self.must_change_password) throw new Failure("Sua senha já foi definida.", 409);
  const password = checkPassword(input.password);
  const { error } = await admin.auth.admin.updateUserById(self.user_id, { password });
  if (error) throw error;
  const { error: updateError } = await admin.from("luso_members").update({ must_change_password: false }).eq("user_id", self.user_id);
  if (updateError) throw updateError;
  return { ok: true };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return reply({ error: "Método não permitido." }, 405);
  try {
    const self = await caller(request);
    const input = await request.json().catch(() => ({}));
    if (input.action === "set-password") return reply(await setPassword(self, input));
    if (!self.is_admin) throw new Failure("Somente administradores podem gerenciar usuários.", 403);
    if (input.action === "create") return reply(await createUser(input));
    if (input.action === "delete") return reply(await deleteUser(self, input));
    if (input.action === "update") return reply(await updateUser(self, input));
    throw new Failure("Ação inválida.");
  } catch (cause) {
    if (cause instanceof Failure) return reply({ error: cause.message }, cause.status);
    console.error(cause);
    return reply({ error: "Não foi possível concluir a operação. Tente novamente." }, 500);
  }
});

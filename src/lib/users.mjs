import { LOGIN_PATTERN, normalizeLogin } from "./login.mjs";

// Regras espelhadas na Edge Function luso-users; o servidor valida de novo.
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export const newUserDraft = () => ({ name: "", login: "", password: "", isAdmin: false, active: true });

export function checkPassword(password) {
  const value = String(password || "");
  if (value.length < PASSWORD_MIN || value.length > PASSWORD_MAX)
    throw new Error(`A senha deve ter de ${PASSWORD_MIN} a ${PASSWORD_MAX} caracteres.`);
  return value;
}

export function validateNewUser(draft) {
  const name = String(draft.name || "").trim().replace(/\s+/g, " ");
  if (!name || name.length > 120) throw new Error("Informe o nome do usuário (até 120 caracteres).");
  const login = normalizeLogin(draft.login);
  if (!LOGIN_PATTERN.test(login))
    throw new Error("Use um login de 3 a 40 caracteres: letras sem acento, números, ponto, hífen ou sublinhado.");
  return { name, login, password: checkPassword(draft.password), isAdmin: draft.isAdmin === true, active: draft.active !== false };
}

export const editUserDraft = (member) => ({
  userId: member.user_id, name: member.display_name, login: member.login || "", password: "", isAdmin: member.is_admin, active: member.active !== false,
});

// Na edição a senha é opcional: preenchida, vira nova senha temporária.
export function validateUserEdit(draft) {
  const { name, login, isAdmin, active } = validateNewUser({ ...draft, password: "x".repeat(PASSWORD_MIN) });
  return { userId: draft.userId, name, login, isAdmin, active, password: draft.password ? checkPassword(draft.password) : "" };
}

export function validatePasswordChange(password, confirmation) {
  checkPassword(password);
  if (password !== confirmation) throw new Error("As senhas não conferem.");
  return password;
}

// Texto copiado para enviar à pessoa (WhatsApp, e-mail…).
export const credentialsText = ({ login, password }) => `Login - ${login}\nSenha temporária - ${password}`;

// Senha temporária legível: sem 0/O, 1/l/I para evitar erro ao digitar.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function temporaryPassword(length = 10) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

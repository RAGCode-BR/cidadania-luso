// O Supabase Auth só autentica por e-mail. Cada login vira um e-mail técnico
// em um domínio reservado (.internal nunca é delegado), que não recebe mensagens
// e não aparece na interface.
export const LOGIN_DOMAIN = "usuarios.luso.internal";
export const LOGIN_PATTERN = /^[a-z0-9][a-z0-9._-]{2,39}$/;

export const normalizeLogin = (value) => String(value || "").trim().toLowerCase();

export function loginEmail(value) {
  const login = normalizeLogin(value);
  if (!LOGIN_PATTERN.test(login))
    throw new Error("Use um login de 3 a 40 caracteres: letras sem acento, números, ponto, hífen ou sublinhado.");
  return `${login}@${LOGIN_DOMAIN}`;
}

const AUTH_MESSAGES = {
  invalid_credentials: "Login ou senha incorretos.",
  email_not_confirmed: "Esta conta ainda não foi ativada. Fale com a administração.",
  user_banned: "Esta conta está bloqueada. Fale com a administração.",
  over_request_rate_limit: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
};

export function authErrorMessage(error) {
  if (AUTH_MESSAGES[error?.code]) return AUTH_MESSAGES[error.code];
  if (/invalid login credentials/i.test(error?.message || "")) return AUTH_MESSAGES.invalid_credentials;
  if (/fetch|network/i.test(error?.message || "")) return "Sem conexão com o servidor. Verifique a internet e tente novamente.";
  return error?.message || "Não foi possível entrar.";
}

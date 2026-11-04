import test from "node:test";
import assert from "node:assert/strict";
import { LOGIN_DOMAIN, authErrorMessage, loginEmail } from "../src/lib/login.mjs";

test("login vira e-mail técnico normalizado", () => {
  assert.equal(loginEmail("  Joao.Silva "), `joao.silva@${LOGIN_DOMAIN}`);
  assert.equal(loginEmail("ana_2"), `ana_2@${LOGIN_DOMAIN}`);
});

test("login inválido é recusado antes de chamar o servidor", () => {
  for (const value of ["", "ab", "joão", "joao silva", "joao@gmail.com", "-joao", "a".repeat(41)])
    assert.throws(() => loginEmail(value), /login de 3 a 40 caracteres/, value);
});

test("erros do Supabase aparecem em português", () => {
  assert.equal(authErrorMessage({ code: "invalid_credentials", message: "Invalid login credentials" }), "Login ou senha incorretos.");
  assert.equal(authErrorMessage({ message: "Invalid login credentials" }), "Login ou senha incorretos.");
  assert.equal(authErrorMessage(new Error("Use um login válido.")), "Use um login válido.");
});

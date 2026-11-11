import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { credentialsText, editUserDraft, temporaryPassword, validateNewUser, validatePasswordChange, validateUserEdit } from "../src/lib/users.mjs";

globalThis.crypto ||= webcrypto;

test("novo usuário: nome, login normalizado, senha temporária e perfil", () => {
  assert.deepEqual(validateNewUser({ name: "  Ana   Lima ", login: " Ana.Lima ", password: "temporaria1", isAdmin: true }),
    { name: "Ana Lima", login: "ana.lima", password: "temporaria1", isAdmin: true, active: true });
  assert.equal(validateNewUser({ name: "Ana", login: "ana", password: "12345678" }).isAdmin, false);
  assert.equal(validateNewUser({ name: "Ana", login: "ana", password: "12345678", active: false }).active, false);
  assert.throws(() => validateNewUser({ name: "", login: "ana", password: "12345678" }), /nome/);
  assert.throws(() => validateNewUser({ name: "Ana", login: "ana lima", password: "12345678" }), /login/);
  assert.throws(() => validateNewUser({ name: "Ana", login: "ana", password: "1234567" }), /8 a 72/);
});

test("troca de senha exige tamanho mínimo e confirmação igual", () => {
  assert.equal(validatePasswordChange("minhasenha", "minhasenha"), "minhasenha");
  assert.throws(() => validatePasswordChange("curta", "curta"), /8 a 72/);
  assert.throws(() => validatePasswordChange("minhasenha", "outrasenha"), /não conferem/);
});

test("senha temporária gerada é legível e varia", () => {
  const a = temporaryPassword(), b = temporaryPassword();
  assert.equal(a.length, 10);
  assert.match(a, /^[a-km-zA-HJ-NP-Z2-9]+$/);
  assert.notEqual(a, b);
});

test("edição: senha é opcional e, se preenchida, vira nova senha temporária", () => {
  const draft = editUserDraft({ user_id: "u1", display_name: "Ana", login: "ana", is_admin: false, active: false });
  assert.deepEqual(validateUserEdit({ ...draft, name: " Ana  Lima ", login: "Ana.Lima" }),
    { userId: "u1", name: "Ana Lima", login: "ana.lima", isAdmin: false, active: false, password: "" });
  assert.equal(validateUserEdit({ ...draft, active: true }).active, true);
  assert.equal(validateUserEdit({ ...draft, password: "novatemp1" }).password, "novatemp1");
  assert.throws(() => validateUserEdit({ ...draft, password: "curta" }), /8 a 72/);
  assert.throws(() => validateUserEdit({ ...draft, login: "a b" }), /login/);
});

test("texto copiado traz login e senha prontos para enviar", () => {
  assert.equal(credentialsText({ login: "igormorgado", password: "igor12345" }), "Login - igormorgado\nSenha temporária - igor12345");
});

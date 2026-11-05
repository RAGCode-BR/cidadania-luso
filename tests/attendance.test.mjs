import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { DATA_VERSION, emptyData, newAttendance, today, validateClient } from "../src/lib/domain.mjs";
import { applyCrmAction, createCrmOpportunity, crmTimeline, emptyCrm, migrateState, opportunityAttendances, recordAttendance } from "../src/lib/crm.mjs";

globalThis.crypto ||= webcrypto;
const actor = { role: "admin", teamId: "equipe", name: "Equipe Luso" };
const withCard = (client = { name: "Maria Silva" }, products = ["CIDADANIA ITALIANA"]) => {
  const crm = createCrmOpportunity(emptyCrm(), client, actor);
  Object.assign(crm.opportunities[0], { products: [...products], pendingProducts: [...products] });
  return { ...emptyData(), products: products.map((name, index) => ({ id: String(index), name })), crm };
};
const attend = (state, extra) => recordAttendance(state, {
  ...newAttendance("equipe", state.crm.opportunities[0].id), allowedProducts: state.products.map((row) => row.name), ...extra,
}, actor);

test("cliente exige só o nome; telefone e e-mail são opcionais e validados", () => {
  assert.deepEqual(validateClient({ name: "  Maria   Silva " }), { name: "Maria Silva", phone: "", email: "" });
  assert.equal(validateClient({ name: "Ana", email: " ANA@Exemplo.com " }).email, "ana@exemplo.com");
  assert.throws(() => validateClient({ name: " " }), /nome do cliente/);
  assert.throws(() => validateClient({ name: "Ana", phone: "123" }), /telefone/);
  assert.throws(() => validateClient({ name: "Ana", email: "ana@" }), /e-mail/);
});

test("cartão guarda o cliente, sem obra nem endereço, e permite nomes repetidos", () => {
  let crm = createCrmOpportunity(emptyCrm(), { name: "Maria Silva", phone: "11912345678" }, actor);
  crm = createCrmOpportunity(crm, { name: "Maria Silva" }, actor);
  assert.equal(crm.opportunities.length, 2);
  const [item] = crm.opportunities;
  assert.deepEqual(item.client, { name: "Maria Silva", phone: "11912345678", email: "" });
  for (const key of ["work", "workKey", "primaryWorkId", "source"]) assert.equal(key in item, false, key);
});

test("atendimento entra no histórico do cartão e soma produtos à negociação", () => {
  let state = withCard();
  state.products.push({ id: "x", name: "PASSAPORTE" });
  state = attend(state, { channel: "whatsapp", offered: ["PASSAPORTE"], notes: "Pediu orçamento." });
  const item = state.crm.opportunities[0];
  assert.deepEqual(item.pendingProducts, ["CIDADANIA ITALIANA", "PASSAPORTE"]);
  assert.equal(item.lastContactDate, today());
  assert.equal(item.version, 2);
  const [row] = opportunityAttendances(state, item.id);
  assert.equal(row.channel, "whatsapp");
  assert.equal(row.notes, "Pediu orçamento.");
  assert.equal(crmTimeline(state.crm.activities, item.id)[0].type, "attendance");
});

test("atendimento de fechamento registra a venda uma única vez", () => {
  let state = attend(withCard(), { kind: "closing", offered: ["CIDADANIA ITALIANA"], sold: ["CIDADANIA ITALIANA"], saleValue: "3500" });
  const item = state.crm.opportunities[0];
  assert.equal(state.crm.sales.length, 1);
  assert.equal(state.crm.sales[0].value, 3500);
  assert.equal(state.crm.sales[0].client.name, "Maria Silva");
  assert.equal(item.stage, "won");
  const events = crmTimeline(state.crm.activities, item.id).map((event) => event.type);
  assert.deepEqual(events.slice(0, 2), ["sale", "attendance"]);
  assert.throws(() => attend(state, { kind: "closing", offered: ["CIDADANIA ITALIANA"], sold: ["CIDADANIA ITALIANA"] }), /encerrada/);
  assert.equal(attend(state, { kind: "relationship", offered: [] }).attendances.length, 2);
});

test("atendimento recusa dados inconsistentes", () => {
  const state = withCard();
  assert.throws(() => attend(state, { offered: [] }), /produto apresentado/);
  assert.throws(() => attend(state, { offered: ["INEXISTENTE"] }), /Produto inválido/);
  assert.throws(() => attend(state, { offered: ["CIDADANIA ITALIANA"], sold: ["CIDADANIA ITALIANA"] }), /fechamento/);
  assert.throws(() => attend(state, { channel: "fax", offered: ["CIDADANIA ITALIANA"] }), /forma de contato/);
  assert.throws(() => attend(state, { date: "2999-01-01", offered: ["CIDADANIA ITALIANA"] }), /data/);
  const crm = applyCrmAction(state.crm, state.crm.opportunities[0].id, { type: "delete", version: 1, note: "Cadastro duplicado" }, actor, []);
  assert.throws(() => attend({ ...state, crm }, { offered: ["CIDADANIA ITALIANA"] }), /não está mais disponível/);
});

test("estado antigo com obras e visitas é convertido para clientes", () => {
  const old = {
    version: 1, products: [], works: [{ id: "w" }], visits: [{ id: "v" }], services: [],
    crm: { ...emptyCrm(), visitLinks: [{}], opportunities: [{ id: "o", work: { name: "Obra Alfa", phone: "1199" }, workKey: "k", primaryWorkId: "w", source: "visit", lastVisitDate: "2026-01-02", products: [] }],
      sales: [{ id: "s", work: { name: "Obra Alfa" }, sourceVisitId: "v" }] },
  };
  const state = migrateState(old);
  assert.equal(state.version, DATA_VERSION);
  assert.deepEqual(state.attendances, []);
  for (const key of ["works", "visits", "services"]) assert.equal(key in state, false, key);
  assert.equal("visitLinks" in state.crm, false);
  assert.deepEqual(state.crm.opportunities[0].client, { name: "Obra Alfa", phone: "1199", email: "" });
  assert.equal(state.crm.opportunities[0].lastContactDate, "2026-01-02");
  assert.equal("work" in state.crm.opportunities[0], false);
  assert.equal(state.crm.sales[0].client.name, "Obra Alfa");
  assert.equal(migrateState(state), state);
});

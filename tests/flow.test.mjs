import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { emptyData, today } from "../src/lib/domain.mjs";
import { emptyCrm, createCrmOpportunity, applyCrmAction, changeCrmColumns } from "../src/lib/crm.mjs";

globalThis.crypto ||= webcrypto;
const actor = { role: "admin", teamId: "equipe", name: "Equipe Luso" };
const client = () => ({ name: "Maria Silva", phone: "(11) 91234-5678", email: "maria@exemplo.com" });

test("CRM cria cartão e registra venda", () => {
  let state = { ...emptyData(), crm: emptyCrm() };
    state.crm = createCrmOpportunity(state.crm, client(), actor);
  const item = state.crm.opportunities[0];
  item.products = ["FORRO"];
  item.pendingProducts = ["FORRO"];
  state.crm = applyCrmAction(state.crm, item.id, { type: "sale", version: item.version, products: ["FORRO"], sellerTeamId: "equipe", date: today(), value: 500 }, actor, ["FORRO"]);
  assert.equal(state.crm.sales.length, 1);
  assert.equal(state.crm.sales[0].value, 500);
});

test("reordenar coluna conserva cartão e produtos", () => {
    const original = createCrmOpportunity(emptyCrm(), client(), actor);
  const id = original.opportunities[0].id;
  const next = changeCrmColumns(original, { type: "reorder", previousOrder: original.stageOrder, order: [...original.stageOrder].reverse() }, actor);
  assert.equal(next.opportunities[0].id, id);
  assert.equal(next.opportunities[0].stage, "prospecting");
});

import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { emptyData, today, uid } from "../src/lib/domain.mjs";
import { emptyCrm, createCrmOpportunity, applyCrmAction, changeCrmColumns } from "../src/lib/crm.mjs";
import { newService, saveInstaller, saveService, decideInstallation } from "../src/lib/services.mjs";

globalThis.crypto ||= webcrypto;
const actor = { role: "admin", teamId: "equipe", name: "Equipe Luso" };
const work = () => ({ id: uid(), name: "Obra teste", street: "Rua Um", number: "10", neighborhood: "Centro", city: "São Paulo", state: "SP", type: "Comercial" });

test("CRM cria cartão, registra venda e Serviços vincula o fechamento sem duplicar valor", () => {
  let state = { ...emptyData(), crm: emptyCrm(), services: [], installers: [], serviceDecisions: {}, nextInstallationNumber: 1 };
  const obra = work();
  state.crm = createCrmOpportunity(state.crm, obra, actor);
  const item = state.crm.opportunities[0];
  item.products = ["FORRO"];
  item.pendingProducts = ["FORRO"];
  state.crm = applyCrmAction(state.crm, item.id, { type: "sale", version: item.version, products: ["FORRO"], sellerTeamId: "equipe", date: today(), value: 500 }, actor, ["FORRO"]);
  assert.equal(state.crm.sales.length, 1);
  state = saveInstaller(state, { name: "Ana" });
  const sale = state.crm.sales[0];
  state = saveService(state, { ...newService(), saleId: sale.id, name: "Obra teste", address: "Rua Um, 10", neighborhood: "Centro", city: "São Paulo", description: "Instalar forro", products: ["FORRO"] }, actor.name);
  assert.equal(state.services[0].number, 1);
  assert.equal(state.services[0].saleId, sale.id);
  assert.equal(state.crm.sales.length, 1);
  assert.throws(() => decideInstallation(state, sale.id, "not_required"), /serviço ativo/i);
});

test("reordenar coluna conserva cartão e produtos", () => {
  const obra = work();
  const original = createCrmOpportunity(emptyCrm(), obra, actor);
  const id = original.opportunities[0].id;
  const next = changeCrmColumns(original, { type: "reorder", previousOrder: original.stageOrder, order: [...original.stageOrder].reverse() }, actor);
  assert.equal(next.opportunities[0].id, id);
  assert.equal(next.opportunities[0].stage, "prospecting");
});

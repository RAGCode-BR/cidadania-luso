import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { catalogProducts, emptyData, newAttendance, productNames, uid } from "../src/lib/domain.mjs";
import { createCrmOpportunity, emptyCrm, recordAttendance } from "../src/lib/crm.mjs";
import { deleteProduct, ensureProducts, productUsage, saveProduct } from "../src/lib/products.mjs";

globalThis.crypto ||= webcrypto;
const actor = { role: "admin", teamId: "equipe", name: "Equipe Luso" };
const blank = () => ({ ...emptyData(), crm: emptyCrm() });
const withCard = (state, products) => {
  const crm = createCrmOpportunity(state.crm, { name: "Cliente teste" }, actor);
  const item = crm.opportunities.at(-1);
  item.products = [...products];
  item.pendingProducts = [...products];
  return { ...state, crm };
};

test("cadastra produto com nome em maiúsculas, descrição e preço", () => {
  const state = saveProduct(blank(), { name: "  forro   de gesso ", description: " Placa 60x60 ", price: "89.9" });
  const [product] = catalogProducts(state);
  assert.equal(product.name, "FORRO DE GESSO");
  assert.equal(product.description, "Placa 60x60");
  assert.equal(product.price, 89.9);
  assert.ok(product.id && product.createdAt && product.updatedAt);
});

test("preço é opcional e aceita vírgula", () => {
  let state = saveProduct(blank(), { name: "Piso", price: "" });
  assert.equal(catalogProducts(state)[0].price, null);
  state = saveProduct(state, { name: "Rodapé", price: "1.234,5" });
  assert.equal(catalogProducts(state).find((row) => row.name === "RODAPÉ").price, 1234.5);
  assert.throws(() => saveProduct(state, { name: "Teto", price: "-1" }), /preço válido/);
  assert.throws(() => saveProduct(state, { name: "Teto", price: "abc" }), /preço válido/);
});

test("recusa nome vazio, longo ou repetido (ignorando acento e maiúsculas)", () => {
  const state = saveProduct(blank(), { name: "Divisória" });
  assert.throws(() => saveProduct(state, { name: "   " }), /nome do produto/);
  assert.throws(() => saveProduct(state, { name: "x".repeat(81) }), /até 80/);
  assert.throws(() => saveProduct(state, { name: "divisoria" }), /Já existe/);
});

test("editar renomeia o produto nos cartões, mas não no histórico de vendas", () => {
  let state = saveProduct(blank(), { name: "Forro" });
  state = withCard(state, ["FORRO"]);
  state.crm.sales = [{ id: uid(), products: ["FORRO"] }];
  const id = catalogProducts(state)[0].id;
  state = saveProduct(state, { id, name: "Forro mineral", description: "", price: "" });
  assert.deepEqual(productNames(state), ["FORRO MINERAL"]);
  assert.deepEqual(state.crm.opportunities[0].products, ["FORRO MINERAL"]);
  assert.deepEqual(state.crm.opportunities[0].pendingProducts, ["FORRO MINERAL"]);
  assert.deepEqual(state.crm.sales[0].products, ["FORRO"]);
  assert.equal(state.products.length, 1);
});

test("excluir tira do catálogo, mas o cartão continua aceitando atendimentos com o produto", () => {
  let state = saveProduct(blank(), { name: "Forro" });
  state = withCard(state, ["FORRO"]);
  const id = catalogProducts(state)[0].id;
  assert.equal(productUsage(state, "FORRO"), 1);
  state = deleteProduct(state, id);
  assert.deepEqual(productNames(state), []);
  assert.equal(state.products[0].deleted, true);
  assert.throws(() => deleteProduct(state, id), /já foi excluído/);
  const item = state.crm.opportunities[0];
  const draft = { ...newAttendance("equipe", item.id), offered: ["FORRO"], allowedProducts: productNames(state) };
  assert.equal(recordAttendance(state, draft, actor).attendances.length, 1);
});

test("recadastrar um produto excluído reaproveita o mesmo registro", () => {
  let state = saveProduct(blank(), { name: "Forro", price: "10" });
  const id = state.products[0].id;
  state = deleteProduct(state, id);
  state = saveProduct(state, { name: "forro", price: "12" });
  assert.equal(state.products.length, 1);
  assert.equal(state.products[0].id, id);
  assert.equal(state.products[0].deleted, undefined);
  assert.equal(state.products[0].price, 12);
});

test("nomes digitados no CRM usam o nome do cadastro e criam os novos", () => {
  let state = saveProduct(blank(), { name: "Divisória", price: "50" });
  const result = ensureProducts(state, ["DIVISORIA", "Piso vinílico", "piso vinilico"]);
  assert.deepEqual(result.names, ["DIVISÓRIA", "PISO VINÍLICO"]);
  assert.equal(catalogProducts(result.data).length, 2);
  assert.equal(catalogProducts(result.data).find((row) => row.name === "DIVISÓRIA").price, 50);
});

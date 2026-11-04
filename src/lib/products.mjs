import { normalize, productName, uid } from "./domain.mjs";

// Cadastro de produtos. As oportunidades guardam o NOME do produto, por isso:
// - renomear atualiza as listas das oportunidades (o histórico de vendas, atendimentos
//   e atividades mantém o nome da época);
// - excluir só marca o produto como excluído: oportunidades e histórico continuam
//   mostrando o nome, mas ele deixa de aparecer para novos cartões.

export const PRODUCT_NAME_MAX = 80;
export const PRODUCT_DESCRIPTION_MAX = 1000;
export const PRODUCT_PRICE_MAX = 1_000_000_000;

export const newProduct = () => ({ name: "", description: "", price: "" });

export const productDraft = (product) => ({
  id: product.id,
  name: product.name,
  description: product.description || "",
  price: product.price == null ? "" : String(product.price),
});

function parsePrice(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const price = Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text);
  if (!Number.isFinite(price) || price < 0 || price > PRODUCT_PRICE_MAX)
    throw new Error("Informe um preço válido, maior ou igual a zero.");
  return Math.round(price * 100) / 100;
}

const sameName = (a, b) => normalize(a) === normalize(b);
const unique = (items) => [...new Set(items)];
const OPPORTUNITY_LISTS = ["products", "pendingProducts", "completedProducts", "discardedProducts"];

function renameInOpportunities(crm, from, to) {
  if (!crm || from === to) return crm;
  const rename = (list) => unique((list || []).map((name) => (name === from ? to : name)));
  return {
    ...crm,
    opportunities: crm.opportunities.map((item) =>
      OPPORTUNITY_LISTS.some((key) => item[key]?.includes(from))
        ? { ...item, ...Object.fromEntries(OPPORTUNITY_LISTS.map((key) => [key, rename(item[key])])) }
        : item,
    ),
  };
}

export function saveProduct(data, draft, { id = uid(), at = new Date().toISOString() } = {}) {
  const name = productName(draft.name);
  if (!name) throw new Error("Informe o nome do produto.");
  if (name.length > PRODUCT_NAME_MAX) throw new Error(`O nome deve ter até ${PRODUCT_NAME_MAX} caracteres.`);
  const description = String(draft.description || "").trim();
  if (description.length > PRODUCT_DESCRIPTION_MAX)
    throw new Error(`A descrição deve ter até ${PRODUCT_DESCRIPTION_MAX} caracteres.`);
  const price = parsePrice(draft.price);
  const products = data.products || [];
  const current = draft.id ? products.find((item) => item.id === draft.id && !item.deleted) : null;
  if (draft.id && !current) throw new Error("Este produto foi excluído ou não existe mais.");
  if (products.some((item) => !item.deleted && item.id !== draft.id && sameName(item.name, name)))
    throw new Error("Já existe um produto com esse nome.");

  // Um produto excluído com o mesmo nome volta a ficar ativo, mantendo o mesmo registro.
  const revived = current ? null : products.find((item) => item.deleted && sameName(item.name, name));
  const base = current || revived;
  const record = {
    ...(base || { id, createdAt: at }),
    name,
    description,
    price,
    updatedAt: at,
  };
  delete record.deleted;
  delete record.deletedAt;
  const next = base
    ? products.map((item) => (item.id === base.id ? record : item))
    : [...products, record];
  return {
    ...data,
    products: next,
    crm: current ? renameInOpportunities(data.crm, current.name, name) : data.crm,
  };
}

export function deleteProduct(data, productId, at = new Date().toISOString()) {
  const products = data.products || [];
  if (!products.some((item) => item.id === productId && !item.deleted))
    throw new Error("Este produto já foi excluído.");
  return {
    ...data,
    products: products.map((item) =>
      item.id === productId ? { ...item, deleted: true, deletedAt: at, updatedAt: at } : item,
    ),
  };
}

// Usa o nome já cadastrado quando o texto digitado só difere em acento ou
// maiúsculas, e cadastra (ou reativa) os nomes novos. Devolve os nomes oficiais.
export function ensureProducts(data, rawNames, at = new Date().toISOString()) {
  let next = data;
  const names = [];
  for (const raw of rawNames) {
    const typed = productName(raw);
    if (!typed) continue;
    if (!(next.products || []).some((item) => !item.deleted && sameName(item.name, typed))) {
      const old = (next.products || []).find((item) => item.deleted && sameName(item.name, typed));
      next = saveProduct(next, { name: typed, ...(old ? productDraft(old) : {}), id: undefined }, { at });
    }
    names.push(next.products.find((item) => !item.deleted && sameName(item.name, typed)).name);
  }
  return { data: next, names: unique(names) };
}

// Quantas oportunidades em aberto ou encerradas citam o produto.
export function productUsage(data, name) {
  return (data.crm?.opportunities || []).filter(
    (item) => !item.deleted && item.products?.includes(name),
  ).length;
}

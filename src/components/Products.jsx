import React, { useState } from "react";
import { catalogProducts, money, normalize } from "../lib/domain.mjs";
import { PRODUCT_DESCRIPTION_MAX, PRODUCT_NAME_MAX, newProduct, productDraft, productUsage } from "../lib/products.mjs";
import { Empty, Field, Icon, Modal, PageHeader, Summary } from "./ui.jsx";
import "../products.css";

const usageLabel = (count) =>
  count === 0 ? "Ainda não usado no CRM" : count === 1 ? "Em 1 oportunidade" : `Em ${count} oportunidades`;

export default function Products({ data, onSave, onDelete }) {
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState(null);
  const [removing, setRemoving] = useState(null);
  const products = catalogProducts(data)
    .map((item) => ({ ...item, usage: productUsage(data, item.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const visible = products.filter((item) => normalize(`${item.name} ${item.description || ""}`).includes(normalize(query)));
  const priced = products.filter((item) => item.price != null);
  return <div className="products-page">
    <PageHeader title="Produtos" note="Os produtos cadastrados aparecem para seleção ao criar um cartão no CRM.">
      <button className="button primary" onClick={() => setEditor(newProduct())}><Icon name="plus" size={18} />Novo produto</button>
    </PageHeader>
    <Summary label="Resumo dos produtos" items={[
      { label: "Cadastrados", value: products.length },
      { label: "Em uso no CRM", value: products.filter((item) => item.usage).length },
      { label: "Com preço de referência", value: priced.length },
      ...(priced.length ? [{ label: "Faixa de preço", value: priced.length === 1 ? money(priced[0].price) : `${money(Math.min(...priced.map((item) => item.price)))} a ${money(Math.max(...priced.map((item) => item.price)))}` }] : []),
    ]} />
    <section className="panel products-panel">
      {products.length > 0 && <div className="products-toolbar">
        <Field label="Buscar produtos" placeholder="Nome ou descrição…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <span aria-live="polite">{visible.length === products.length ? `${products.length} produto(s)` : `${visible.length} de ${products.length} produto(s)`}</span>
      </div>}
      {!products.length && <Empty icon="passport" title="Nenhum produto cadastrado" description="Cadastre o primeiro produto. Produtos digitados ao criar um cartão no CRM também entram aqui."
        action={<button className="button primary" onClick={() => setEditor(newProduct())}><Icon name="plus" size={18} />Cadastrar produto</button>} />}
      {products.length > 0 && !visible.length && <p className="products-none">Nenhum produto encontrado para “{query}”.</p>}
      {!!visible.length && <ul className="products-list" aria-label="Produtos cadastrados">
        {visible.map((item) => <li key={item.id}>
          <div className="products-main">
            <strong>{item.name}</strong>
            {item.description && <p>{item.description}</p>}
            <small>{usageLabel(item.usage)}</small>
          </div>
          <span className={`products-price ${item.price == null ? "empty" : ""}`}>{item.price == null ? "Sem preço" : money(item.price)}</span>
          <div className="products-actions">
            <button className="icon-button" aria-label={`Editar ${item.name}`} title="Editar" onClick={() => setEditor(productDraft(item))}><Icon name="edit" size={18} /></button>
            <button className="icon-button danger" aria-label={`Excluir ${item.name}`} title="Excluir" onClick={() => setRemoving(item)}><Icon name="trash" size={18} /></button>
          </div>
        </li>)}
      </ul>}
    </section>
    {editor && <ProductForm key={editor.id || "new"} initial={editor} onSave={onSave} onClose={() => setEditor(null)} />}
    {removing && <DeleteProduct product={removing} onDelete={onDelete} onClose={() => setRemoving(null)} />}
  </div>;
}

function ProductForm({ initial, onSave, onClose }) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const field = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }));
  const renamed = initial.id && normalize(draft.name) !== normalize(initial.name);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try { await onSave(draft); onClose(); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  return <Modal title={initial.id ? "Editar produto" : "Novo produto"} onClose={() => !busy && onClose()}>
    <form onSubmit={submit} className="products-form">
      <Field label="Nome do produto" value={draft.name} onChange={field("name")} required maxLength={PRODUCT_NAME_MAX} autoFocus
        hint="O nome é salvo em letras maiúsculas e não pode se repetir." />
      {renamed && <p className="products-note">Os cartões do CRM que usam <strong>{initial.name}</strong> passarão a mostrar o novo nome. Vendas e atendimentos já registrados mantêm o nome antigo.</p>}
      <Field label="Descrição">
        <textarea value={draft.description} onChange={field("description")} rows={3} maxLength={PRODUCT_DESCRIPTION_MAX} placeholder="Opcional: documentos necessários, prazo médio, etapas do processo…" />
      </Field>
      <Field label="Preço de referência (R$)" type="number" inputMode="decimal" min="0" step="0.01" value={draft.price} onChange={field("price")} placeholder="Opcional" />
      {error && <p className="error" role="alert">{error}</p>}
      <footer className="modal-actions">
        <button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="button primary" disabled={busy}>{busy ? "Salvando…" : initial.id ? "Salvar alterações" : "Cadastrar produto"}</button>
      </footer>
    </form>
  </Modal>;
}

function DeleteProduct({ product, onDelete, onClose }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError("");
    try { await onDelete(product.id); onClose(); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  return <Modal title="Excluir produto?" onClose={() => !busy && onClose()}>
    <p><strong>{product.name}</strong> deixará de aparecer para novos cartões.
      {product.usage === 1 ? " A oportunidade que já o cita continua com ele, assim como vendas e atendimentos." : product.usage > 1 ? ` As ${product.usage} oportunidades que já o citam continuam com ele, assim como vendas e atendimentos.` : ""}</p>
    {error && <p className="error" role="alert">{error}</p>}
    <footer className="modal-actions"><button className="button secondary" onClick={onClose} disabled={busy}>Cancelar</button>
      <button className="button primary" disabled={busy} onClick={submit}>{busy ? "Excluindo…" : "Excluir produto"}</button></footer>
  </Modal>;
}

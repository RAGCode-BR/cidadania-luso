import React, { useEffect, useRef, useState } from "react";
import {
  CRM_STAGES,
  crmStageOrder,
  crmActiveStageIds,
  crmTimeline,
  emptyCrm,
  opportunityAttendances,
} from "../lib/crm.mjs";
import {
  ATTENDANCE_CHANNELS,
  ATTENDANCE_KINDS,
  TEAM,
  dateLabel,
  isTeamMember,
  money,
  normalize,
  person,
  phoneDigits,
  productNames,
  today,
} from "../lib/domain.mjs";
import { Badge, Empty, Field, Icon, Modal, PageHeader, Select, Summary } from "./ui.jsx";
import Pagination from "./Pagination.jsx";
import "../crm.css";

const NO_OWNER = "__sem-responsavel";
// Vendas do ciclo atual da negociação e os nomes de quem vendeu.
const cycleSales = (crm, item) => crm.sales.filter((sale) => sale.opportunityId === item.id && (sale.cycle ?? item.cycle) === item.cycle);
const deletedEvent = (crm, item) => crm.activities.findLast?.((event) => event.opportunityId === item.id && event.type === "deleted");
const sellerNames = (sales) => [...new Set(sales.map((sale) => person(sale.sellerTeamId)))].join(", ");
const active = (item) => !["won", "lost"].includes(item.stage);
const overdue = (item) =>
  active(item) && item.nextDate && item.nextDate < today();
export default function Crm({
  data,
  actorId,
  account,
  onAction,
  onCreate,
  onColumns,
  onLabels,
  onAttendance,
}) {
  const crm = data.crm || emptyCrm();
  const labels = { ...CRM_STAGES, ...crm.stageLabels };
  const stageOrder = crmStageOrder(crm);
  const activeStageIds = crmActiveStageIds(crm);
  const [query, setQuery] = useState("");
  const [responsible, setResponsible] = useState("");
  const [product, setProduct] = useState("");
  const [returns, setReturns] = useState("");
  const [mobileStage, setMobileStage] = useState("prospecting");
  const [dialog, setDialog] = useState(null);
  const [addingCard, setAddingCard] = useState(false);
  const [addingColumn, setAddingColumn] = useState(false);
  const [reorderingColumns, setReorderingColumns] = useState(false);
  const [editingLabel, setEditingLabel] = useState(null);
  const [deletingColumn, setDeletingColumn] = useState(null);
  const [deletingCard, setDeletingCard] = useState(null);
  const [drop, setDrop] = useState("");
  const [moveError, setMoveError] = useState("");
  const moving = useRef(false);
  const draggingCard = useRef(false);
  const [view, setView] = useState("board");
  const [closedStage, setClosedStage] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [query, responsible, product, closedStage, view]);
  useEffect(() => {
    if (!stageOrder.includes(mobileStage)) setMobileStage(stageOrder[0]);
  }, [stageOrder.join("|"), mobileStage]);
  const matches = (item) =>
    (!responsible || (responsible === NO_OWNER ? !isTeamMember(item.responsibleId) : item.responsibleId === responsible)) &&
    (!product || item.products.includes(product)) &&
    normalize(item.client.name).includes(normalize(query));
  const deletedItems = crm.opportunities
    .filter((item) => item.deleted && matches(item))
    .sort((a, b) => (b.deletedAt || b.updatedAt).localeCompare(a.deletedAt || a.updatedAt));
  const filtered = crm.opportunities.filter(
    (item) =>
      !item.deleted &&
      matches(item) &&
      (!returns ||
        (returns === "overdue"
          ? overdue(item)
          : active(item) && item.nextDate === today())),
  );
  const archived = filtered
    .filter(
      (item) => !active(item) && (!closedStage || item.stage === closedStage),
    )
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
    );
  const listed = view === "deleted" ? deletedItems : archived;
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(listed.length / 12)),
  );
  const showView = (next, stage = "") => {
    setView(next);
    setClosedStage(stage);
    setReturns("");
    setPage(1);
  };
  const open = (
    item,
    type = "update",
    stage = item.stage,
    version = item.version,
  ) => setDialog({ id: item.id, type, stage, version });
  const selected = crm.opportunities.find((item) => item.id === dialog?.id);
  const attend = (item) => {
    setDialog(null);
    onAttendance(item);
  };
  // Produtos do cadastro e também os que ficaram em cartões após serem excluídos do cadastro.
  const productFilterOptions = [...new Set([
    ...productNames(data),
    ...crm.opportunities.filter((item) => !item.deleted).flatMap((item) => item.products),
  ])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const overdueCount = crm.opportunities.filter((item) => !item.deleted && overdue(item)).length;
  const contacts = (item) => (data.attendances || []).filter((row) => row.opportunityId === item.id).length;
  const dropped = async (event, stage) => {
    event.preventDefault();
    setDrop("");
    setMoveError("");
    if (moving.current) return;
    try {
      const source = JSON.parse(
        event.dataTransfer.getData("application/x-luso-crm"),
      );
      const item = crm.opportunities.find((row) => row.id === source.id);
      if (!item || item.stage === stage) return;
      if (!active(item) || !active({ stage })) {
        setMoveError("Para concluir ou reabrir uma oportunidade, abra o cartão e registre os dados do fechamento.");
        return;
      }
      moving.current = true;
      await onAction(item.id, {
        type: "update",
        version: source.version,
        stage,
        responsibleId: item.responsibleId,
        nextAction: item.nextAction,
        nextDate: item.nextDate,
      });
    } catch (error) {
      setMoveError(error.message || "Não foi possível mover o cartão.");
    } finally {
      moving.current = false;
    }
  };
  return (
    <div className="crm-page">
      <PageHeader title="CRM">
        {(!account || account.role === "admin") && (
          <>
            <button className="button secondary" onClick={() => setAddingColumn(true)}><Icon name="plus" size={18} />Adicionar coluna</button>
            <button className="button secondary" onClick={() => setReorderingColumns(true)}><Icon name="reorder" size={18} />Reordenar colunas</button>
          </>
        )}
        <button className="button primary" onClick={() => setAddingCard(true)}><Icon name="plus" size={18} />Nova oportunidade</button>
      </PageHeader>
      <Summary label="Resumo do CRM" items={[
        { label: "Em andamento", value: crm.opportunities.filter((item) => !item.deleted && active(item)).length },
        { label: "Em negociação", value: crm.opportunities.filter((item) => !item.deleted && active(item) && (item.stage === "negotiating" || item.completedProducts.length)).length },
        { label: "Retornos em atraso", value: overdueCount, tone: overdueCount ? "alert" : "" },
        { label: "Total vendido", value: money(crm.sales.reduce((total, sale) => total + sale.value, 0)), tone: "strong" },
      ]} />
      <section className="crm-workspace" aria-label="Quadro de oportunidades">
        <div
          className="crm-view-tabs"
          role="group"
          aria-label="Visualização do CRM"
        >
          <button
            aria-pressed={view === "board"}
            onClick={() => showView("board")}
          >
            Em andamento
            <span>{crm.opportunities.filter((item) => !item.deleted && active(item)).length}</span>
          </button>
          <button
            aria-pressed={view === "closed"}
            onClick={() => showView("closed")}
          >
            Encerradas
            <span>
              {crm.opportunities.filter((item) => !item.deleted && !active(item)).length}
            </span>
          </button>
          <button
            aria-pressed={view === "deleted"}
            onClick={() => showView("deleted")}
          >
            Excluídos
            <span>{crm.opportunities.filter((item) => item.deleted).length}</span>
          </button>
        </div>
        <div className="crm-toolbar">
          <div className="field crm-search-field">
            <label htmlFor="crm-search">Buscar cliente</label>
            <div className="search-input">
            <Icon name="search" size={17} />
            <input
              id="crm-search"
              placeholder="Nome do cliente…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            </div>
          </div>
          {TEAM.length > 1 && <Select
            label="Usuário"
            value={responsible}
            onChange={setResponsible}
          >
            <option value="">Todos os usuários</option>
            {TEAM.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id === actorId ? `${item.name} (você)` : item.name}
              </option>
            ))}
            {crm.opportunities.some((item) => !item.deleted && !isTeamMember(item.responsibleId)) &&
              <option value={NO_OWNER}>Sem responsável</option>}
          </Select>}
          <Select label="Produto" value={product} onChange={setProduct}>
            <option value="">Todos os produtos</option>
            {productFilterOptions.map((name) => <option key={name} value={name}>{name}</option>)}
          </Select>
          {view === "closed" ? (
            <Select
              label="Resultado da negociação"
              value={closedStage}
              onChange={setClosedStage}
            >
              <option value="">Todos os resultados</option>
              <option value="won">{labels.won}</option>
              <option value="lost">{labels.lost}</option>
            </Select>
          ) : view === "board" && (
            <Select
              label="Próximo retorno"
              value={returns}
              onChange={setReturns}
            >
              <option value="">Todos os retornos</option>
              <option value="today">Para hoje</option>
              <option value="overdue">Em atraso</option>
            </Select>
          )}
        </div>
        {view === "board" ? (
          <>
            {moveError && <p className="error" role="alert">{moveError}</p>}
            <div
              className="crm-mobile-tabs"
              role="group"
              aria-label="Etapas do CRM"
            >
              {stageOrder.map((id) => (
                <button
                  key={id}
                  className={mobileStage === id ? "active" : ""}
                  onClick={() => setMobileStage(id)}
                >
                  {labels[id]}
                  <span>
                    {filtered.filter((item) => item.stage === id).length}
                  </span>
                </button>
              ))}
            </div>
            <div className="crm-board" style={{ "--crm-columns": stageOrder.length }}>
              {stageOrder.map((stage) => {
                const label = labels[stage];
                const items = filtered
                  .filter((item) => item.stage === stage)
                  .sort(
                    (a, b) =>
                      Number(overdue(b)) - Number(overdue(a)) ||
                      (a.nextDate || "9999").localeCompare(
                        b.nextDate || "9999",
                      ) ||
                      b.updatedAt.localeCompare(a.updatedAt),
                  );
                return (
                  <section
                    key={stage}
                    className={`crm-column crm-${stage} ${mobileStage === stage ? "mobile-selected" : ""} ${drop === stage ? "drop-target" : ""}`}
                    aria-label={label}
                    onDragOver={(event) => {
                      if (
                        event.dataTransfer.types.includes(
                          "application/x-luso-crm",
                        )
                      ) {
                        event.preventDefault();
                        setDrop(stage);
                      }
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget))
                        setDrop("");
                    }}
                    onDrop={(event) => dropped(event, stage)}
                  >
                    <header className="crm-column-heading">
                      <span className="crm-column-title">
                        <i />
                        <span className="crm-column-name" title={label}>{label}</span>
                        {(!account || account.role === "admin") && (
                          <>
                            <button type="button" className="crm-column-edit"
                              aria-label={`Renomear coluna ${label}`} title={`Renomear coluna ${label}`}
                              onClick={() => setEditingLabel(stage)}><Icon name="edit" size={15} /></button>
                            <button type="button" className="crm-column-edit crm-column-delete"
                              aria-label={`Excluir coluna ${label}`} title={`Excluir coluna ${label}`}
                              onClick={() => setDeletingColumn(stage)}><Icon name="close" size={15} /></button>
                          </>
                        )}
                      </span>
                      <b>{items.length}</b>
                    </header>
                    <div className="crm-column-cards">
                      {!active({ stage }) ? (
                        <div className="crm-closed-summary">
                          <strong>
                            {items.length === 1 ? "1 negociação" : `${items.length} negociações`}
                          </strong>
                          <p>
                            {stage === "won" ? "Fechadas com venda." : "Encerradas sem negócio."}
                          </p>
                          <button
                            className="button secondary"
                            onClick={() => showView("closed", stage)}
                          >
                            {stage === "won" ? "Ver vendas" : "Ver encerradas"}
                          </button>
                        </div>
                      ) : (
                        items.map((item) => (
                          <article
                            className={`crm-card ${overdue(item) ? "is-late" : ""}`}
                            key={item.id}
                            draggable
                            title="Arraste para mudar de etapa"
                            onClick={(event) => {
                              if (draggingCard.current || event.target.closest("button, a")) return;
                              open(item, active(item) ? "update" : "details");
                            }}
                            onDragStart={(event) => {
                              draggingCard.current = true;
                              event.dataTransfer.setData(
                                "application/x-luso-crm",
                                JSON.stringify({
                                  id: item.id,
                                  version: item.version,
                                }),
                              );
                            }}
                            onDragEnd={() => setTimeout(() => { draggingCard.current = false; }, 150)}
                          >
                            <button
                              className="crm-card-title"
                              onClick={() =>
                                open(item, active(item) ? "update" : "details")
                              }
                            >
                              {item.client.name}
                            </button>
                            {item.completedProducts.length > 0 && active(item) && (
                              <span className="crm-partial">Venda parcial por {sellerNames(cycleSales(crm, item))}</span>
                            )}
                            <p className="crm-card-contact">
                              <Icon name={!item.client.phone && item.client.email ? "mail" : "phone"} size={15} />
                              <span>{item.client.phone || item.client.email || "Sem contato informado"}</span>
                            </p>
                            {TEAM.length > 1 && <p className={`crm-card-owner ${isTeamMember(item.responsibleId) ? "" : "empty"}`}>
                              <Icon name="users" size={15} />
                              <span>{item.responsibleId === actorId ? `${person(item.responsibleId)} (você)` : person(item.responsibleId)}</span>
                            </p>}
                            {!!(active(item) ? item.pendingProducts : item.products).length && <ul className="crm-product-chips" aria-label="Produtos">
                              {(active(item) ? item.pendingProducts : item.products).slice(0, 3).map((name) => <li key={name}>{name}</li>)}
                              {(active(item) ? item.pendingProducts : item.products).length > 3 && <li>+{(active(item) ? item.pendingProducts : item.products).length - 3}</li>}
                            </ul>}
                            <p className={`crm-card-next ${!item.nextAction ? "empty" : ""}`}>
                              <Icon name="clock" size={15} />
                              <span>
                                {item.nextDate && <strong>{overdue(item) ? `Atrasado desde ${dateLabel(item.nextDate)}` : dateLabel(item.nextDate)}</strong>}
                                {item.nextAction || "Sem próximo passo"}
                              </span>
                            </p>
                            <footer>
                              <small>
                                {contacts(item) === 0 ? "Nenhum atendimento" : contacts(item) === 1 ? "1 atendimento" : `${contacts(item)} atendimentos`}
                                {item.lastContactDate ? `, último em ${dateLabel(item.lastContactDate)}` : ""}
                              </small>
                              <button
                                className="icon-button"
                                aria-label={`Registrar atendimento de ${item.client.name}`}
                                title="Registrar atendimento"
                                onClick={() => attend(item)}
                              >
                                <Icon name="message" size={18} />
                              </button>
                              <button className="icon-button danger" aria-label={`Excluir cartão ${item.client.name}`} title="Excluir cartão"
                                onClick={() => setDeletingCard(item)}><Icon name="trash" size={18} /></button>
                            </footer>
                          </article>
                        ))
                      )}
                    </div>
                    {!items.length && active({ stage }) && (
                      <div className="crm-column-empty">
                        <Icon
                          name={stage === "won" ? "check" : "kanban"}
                          size={25}
                        />
                        <p>
                          {crm.opportunities.length
                            ? "Nenhuma oportunidade nesta etapa"
                            : "Crie uma oportunidade para começar"}
                        </p>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
            {!filtered.length && !!crm.opportunities.length && (
              <p className="crm-no-results">
                Nenhuma oportunidade corresponde aos filtros.
              </p>
            )}
          </>
        ) : view === "closed" ? (
          <div className="crm-archive">
            <div className="crm-archive-heading">
              <div>
                <h2>Negociações encerradas</h2>
                <p>
                  Abra uma negociação para consultar o histórico ou reabri-la.
                </p>
              </div>
              <span className="crm-archive-count">{archived.length === 1 ? "1 negociação" : `${archived.length} negociações`}</span>
            </div>
            <div className="crm-archive-list">
              {archived
                .slice((currentPage - 1) * 12, currentPage * 12)
                .map((item) => (
                  <article className="crm-archive-row" key={item.id}>
                    <div className="crm-archive-work">
                      <Badge tone={item.stage === "won" ? "success" : ""}>
                        {labels[item.stage]}
                      </Badge>
                      <button
                        className="crm-card-title"
                        onClick={() => open(item, "details")}
                      >
                        {item.client.name}
                      </button>
                      <p>
                        {item.client.phone || item.client.email || "Sem contato informado"}
                      </p>
                      {!!item.products.length && <ul className="crm-product-chips" aria-label="Produtos">{item.products.map((name) => <li key={name}>{name}</li>)}</ul>}
                    </div>
                    <div className="crm-archive-meta">
                      {item.stage === "won" && cycleSales(crm, item).length > 0 && <span className="crm-archive-seller">
                        Vendido por<strong>{sellerNames(cycleSales(crm, item))}</strong>
                      </span>}
                      <span>
                        Responsável<strong>{person(item.responsibleId)}</strong>
                      </span>
                      <span>
                        Última atualização
                        <strong>
                          {new Date(item.updatedAt).toLocaleDateString("pt-BR")}
                        </strong>
                      </span>
                      <span>
                        Total vendido
                        <strong>
                          {money(
                            crm.sales
                              .filter((sale) => sale.opportunityId === item.id)
                              .reduce((total, sale) => total + sale.value, 0),
                          )}
                        </strong>
                      </span>
                    </div>
                    <button
                      className="button secondary"
                      aria-label={`Abrir oportunidade ${item.client.name}`}
                      onClick={() => open(item, "details")}
                    >
                      Ver histórico
                    </button>
                    <button className="button text-button" onClick={() => setDeletingCard(item)} aria-label={`Excluir cartão ${item.client.name}`}>Excluir cartão</button>
                  </article>
                ))}
            </div>
            {!archived.length && (
              <Empty
                icon="check"
                title="Nenhuma negociação encerrada"
                description="As negociações encerradas aparecerão aqui. Confira também os filtros selecionados."
              />
            )}
            <Pagination
              page={currentPage}
              totalItems={archived.length}
              pageSize={12}
              onChange={setPage}
              itemLabel="negociações encerradas"
            />
          </div>
        ) : (
          <div className="crm-archive">
            <div className="crm-archive-heading">
              <div>
                <h2>Cartões excluídos</h2>
                <p>Quem excluiu, quando e por quê. O histórico de cada cartão continua disponível.</p>
              </div>
              <span className="crm-archive-count">{deletedItems.length === 1 ? "1 cartão" : `${deletedItems.length} cartões`}</span>
            </div>
            <div className="crm-archive-list">
              {deletedItems.slice((currentPage - 1) * 12, currentPage * 12).map((item) => (
                <article className="crm-archive-row crm-deleted-row" key={item.id}>
                  <div className="crm-archive-work">
                    <Badge tone="red">Excluído</Badge>
                    <button className="crm-card-title" onClick={() => open(item, "details")}>{item.client.name}</button>
                    <p>{item.client.phone || item.client.email || "Sem contato informado"}</p>
                  </div>
                  <div className="crm-archive-meta">
                    <span>Excluído por<strong>{item.deletedByName || deletedEvent(crm, item)?.actorName || "Não registrado"}</strong></span>
                    <span>Em<strong>{item.deletedAt || deletedEvent(crm, item)?.at ? new Date(item.deletedAt || deletedEvent(crm, item).at).toLocaleDateString("pt-BR") : "—"}</strong></span>
                    <span>Responsável<strong>{person(item.responsibleId)}</strong></span>
                  </div>
                  <button className="button secondary" aria-label={`Ver histórico de ${item.client.name}`} onClick={() => open(item, "details")}>Ver histórico</button>
                  <p className="crm-deleted-reason">
                    <strong>Motivo:</strong> {item.deletedReason || "não informado (excluído antes de o motivo ser obrigatório)."}
                  </p>
                </article>
              ))}
            </div>
            {!deletedItems.length && (
              <Empty
                icon="trash"
                title="Nenhum cartão excluído"
                description="Quando alguém excluir um cartão, ele aparece aqui com o motivo. Confira também os filtros selecionados."
              />
            )}
            <Pagination
              page={currentPage}
              totalItems={deletedItems.length}
              pageSize={12}
              onChange={setPage}
              itemLabel="cartões excluídos"
            />
          </div>
        )}
      </section>
      {selected && (
        <CrmDialog
          key={`${selected.id}-${dialog.type}-${dialog.version}`}
          opportunity={selected}
          initial={dialog}
          crm={crm}
          data={data}
          actorId={actorId}
          account={account}
          onAction={onAction}
          onClose={() => setDialog(null)}
          onAttendance={() => attend(selected)}
          onMode={(type) => open(selected, type)}
          labels={labels}
          stageOrder={stageOrder}
        />
      )}
      {addingCard && <AddCrmCard actorId={actorId} catalog={productNames(data)} stageIds={activeStageIds} labels={labels}
        onCreate={onCreate} onClose={() => setAddingCard(false)} />}
      {addingColumn && <AddCrmColumn onSave={onColumns} onClose={() => setAddingColumn(false)} />}
      {reorderingColumns && <ReorderCrmColumns order={stageOrder} labels={labels}
        counts={Object.fromEntries(stageOrder.map((stage) => [stage,
          crm.opportunities.filter((item) => !item.deleted && item.stage === stage).length]))}
        onSave={onColumns} onClose={() => setReorderingColumns(false)} />}
      {editingLabel && <EditCrmLabel key={editingLabel} stage={editingLabel} labels={labels}
        onSave={onLabels} onClose={() => setEditingLabel(null)} />}
      {deletingColumn && <DeleteCrmColumn stage={deletingColumn} label={labels[deletingColumn]}
        count={crm.opportunities.filter((item) => !item.deleted && item.stage === deletingColumn).length}
        destination={active({ stage: deletingColumn }) ? labels[activeStageIds.find((id) => id !== deletingColumn)] : ""}
        onDelete={onColumns} onClose={() => setDeletingColumn(null)} />}
      {deletingCard && <DeleteCrmCard item={deletingCard} onAction={onAction} onClose={() => setDeletingCard(null)} />}
    </div>
  );
}

function AddCrmCard({ actorId, catalog, stageIds, labels, onCreate, onClose }) {
  const [stage, setStage] = useState(stageIds[0] || "");
  const [draft, setDraft] = useState({ name: "", phone: "", email: "", products: [], newProducts: "", responsibleId: isTeamMember(actorId) ? actorId : TEAM[0]?.id || "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const field = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    if (!stage) return setError("Selecione uma coluna.");
    setBusy(true);
    setError("");
    try {
      await onCreate({ client: { name: draft.name, phone: draft.phone, email: draft.email }, products: draft.products, newProducts: draft.newProducts, responsibleId: draft.responsibleId }, stage);
      onClose();
    }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  return <Modal title="Nova oportunidade" onClose={onClose}>
    <form onSubmit={submit}>
      <Field label="Nome do cliente" value={draft.name} onChange={field("name")} required maxLength={180} autoComplete="off" />
      <div className="fields two">
        <Field label="Telefone" type="tel" value={draft.phone} onChange={field("phone")} maxLength={25} placeholder="(11) 91234-5678" />
        <Field label="E-mail" type="email" value={draft.email} onChange={field("email")} maxLength={254} placeholder="cliente@exemplo.com" />
      </div>
      {!!catalog.length && <fieldset className="crm-product-options crm-new-card-products"><legend>Produtos a negociar</legend>
        {catalog.map((name) => <label key={name}><input type="checkbox" checked={draft.products.includes(name)}
          onChange={(event) => setDraft((current) => ({ ...current, products: event.target.checked ? [...current.products, name] : current.products.filter((row) => row !== name) }))} />{name}</label>)}
      </fieldset>}
      <Field label={catalog.length ? "Outros produtos (novos)" : "Produtos a negociar"} value={draft.newProducts} onChange={field("newProducts")} required={!catalog.length}
        placeholder="Separe os produtos por vírgula" hint="Produtos digitados aqui também entram no cadastro de Produtos." />
      <div className={TEAM.length > 1 ? "fields two" : ""}>
        <Select label="Coluna" value={stage} onChange={setStage} required>
          {stageIds.map((id) => <option key={id} value={id}>{labels[id]}</option>)}
        </Select>
        {TEAM.length > 1 && <Select label="Responsável" value={draft.responsibleId} onChange={(responsibleId) => setDraft((current) => ({ ...current, responsibleId }))} required>
          {TEAM.map((user) => <option key={user.id} value={user.id}>{user.id === actorId ? `${user.name} (você)` : user.name}</option>)}
        </Select>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button>
        <button className="button primary" disabled={busy}>{busy ? "Salvando…" : "Adicionar cartão"}</button></footer>
    </form>
  </Modal>;
}
function AddCrmColumn({ onSave, onClose }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try { await onSave({ type: "add", name }); onClose(); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  return <Modal title="Adicionar coluna ao CRM" onClose={onClose}>
    <form onSubmit={submit}>
      <Field label="Nome da coluna" value={name} maxLength={35} required
        onChange={(event) => setName(event.target.value)} />
      {error && <p className="error" role="alert">{error}</p>}
      <footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button>
        <button className="button primary" disabled={busy}>{busy ? "Salvando…" : "Adicionar coluna"}</button></footer>
    </form>
  </Modal>;
}
function ReorderCrmColumns({ order: currentOrder, labels, counts, onSave, onClose }) {
  const [order, setOrder] = useState(currentOrder);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const drag = useRef(null);
  const [dragging, setDragging] = useState("");
  const [dropTarget, setDropTarget] = useState("");
  const rowAt = (event) => document.elementFromPoint(event.clientX, event.clientY)
    ?.closest(".crm-reorder-list li[data-stage]");
  const startDrag = (event, stage) => {
    if (busy || event.target.closest("button") ||
      (event.pointerType !== "mouse" && !event.target.closest(".crm-reorder-grip")) ||
      (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { stage, pointerId: event.pointerId };
    setDragging(stage);
  };
  const dragOver = (event) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    const target = rowAt(event)?.dataset.stage;
    setDropTarget(target && target !== drag.current.stage ? target : "");
    const dialog = event.currentTarget.closest("dialog");
    const bounds = dialog.getBoundingClientRect();
    if (event.clientY < bounds.top + 45) dialog.scrollTop -= 12;
    if (event.clientY > bounds.bottom - 45) dialog.scrollTop += 12;
  };
  const finishDrag = (event) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    const source = drag.current.stage;
    const targetRow = rowAt(event);
    const target = targetRow?.dataset.stage;
    if (target && target !== source) {
      const bounds = targetRow.getBoundingClientRect();
      const after = event.clientY > bounds.top + bounds.height / 2;
      setOrder((current) => {
        const next = current.filter((stage) => stage !== source);
        next.splice(next.indexOf(target) + Number(after), 0, source);
        return next;
      });
    }
    drag.current = null;
    setDragging("");
    setDropTarget("");
  };
  const cancelDrag = (event) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging("");
    setDropTarget("");
  };
  const move = (index, offset) => {
    setOrder((current) => {
      const next = [...current];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
  };
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({ type: "reorder", previousOrder: currentOrder, order });
      onClose();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  const unchanged = order.every((stage, index) => stage === currentOrder[index]);
  return <Modal title="Reordenar colunas" onClose={busy ? () => {} : onClose}>
    <form onSubmit={submit}>
      <p>Arraste pelo ícone pontilhado ou use as setas para mudar a ordem. Os cartões acompanham suas colunas.</p>
      <ol className="crm-reorder-list" aria-label="Ordem das colunas">
        {order.map((stage, index) => <li key={stage} data-stage={stage}
          className={`${dragging === stage ? "dragging" : ""} ${dropTarget === stage ? "drop-target" : ""}`}
          onPointerDown={(event) => startDrag(event, stage)}
          onPointerMove={dragOver} onPointerUp={finishDrag} onPointerCancel={cancelDrag}>
          <span className="crm-reorder-grip" aria-hidden="true"><Icon name="grip" size={17} /></span>
          <span className="crm-reorder-position">{index + 1}</span>
          <span className="crm-reorder-name">{labels[stage]}<small>{counts[stage]} {counts[stage] === 1 ? "cartão" : "cartões"}</small></span>
          <button type="button" className="icon-button" disabled={busy || index === 0}
            aria-label={`Mover ${labels[stage]} para cima`} onClick={() => move(index, -1)}>
            <Icon name="move-up" size={17} />
          </button>
          <button type="button" className="icon-button" disabled={busy || index === order.length - 1}
            aria-label={`Mover ${labels[stage]} para baixo`} onClick={() => move(index, 1)}>
            <Icon name="move-down" size={17} />
          </button>
        </li>)}
      </ol>
      {error && <p className="error" role="alert">{error}</p>}
      <footer className="modal-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancelar</button>
        <button className="button primary" disabled={busy || unchanged}>{busy ? "Salvando…" : "Salvar ordem"}</button>
      </footer>
    </form>
  </Modal>;
}
function DeleteCrmColumn({ stage, label, count, destination, onDelete, onClose }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError("");
    try { await onDelete({ type: "delete", stage }); onClose(); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  return <Modal title={`Excluir coluna ${label}?`} onClose={onClose}>
    <p>{count
      ? destination
        ? `Esta coluna tem ${count} ${count === 1 ? "cartão" : "cartões"}. Ao excluí-la, ${count === 1 ? "ele será movido" : "eles serão movidos"} para ${destination}. O histórico será preservado.`
        : `Esta coluna tem ${count} ${count === 1 ? "cartão" : "cartões"}. Eles continuarão na lista de encerradas, com o histórico preservado.`
      : "A coluna vazia será removida do quadro. O histórico das oportunidades será preservado."}</p>
    {error && <p className="error" role="alert">{error}</p>}
    <footer className="modal-actions">
      <button className="button secondary" disabled={busy} onClick={onClose}>Cancelar</button>
      <button className="button primary" disabled={busy} onClick={submit}>{busy ? "Excluindo…" : "Excluir coluna"}</button>
    </footer>
  </Modal>;
}
function EditCrmLabel({ stage, labels, onSave, onClose }) {
  const [draft, setDraft] = useState(labels[stage]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try { await onSave({ ...labels, [stage]: draft }); onClose(); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  return <Modal title="Renomear coluna do CRM" onClose={onClose}>
    <form onSubmit={submit}>
      <Field label="Nome da coluna" value={draft} maxLength={35} required
        onChange={(event) => setDraft(event.target.value)} />
      {error && <p className="error" role="alert">{error}</p>}
      <footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button>
        <button className="button primary" disabled={busy}>{busy ? "Salvando…" : "Salvar nome"}</button></footer>
    </form>
  </Modal>;
}
function DeleteCrmCard({ item, onAction, onClose }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try { await onAction(item.id, { type: "delete", version: item.version, note: reason }); onClose(); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  return <Modal title="Excluir cartão do CRM?" onClose={() => !busy && onClose()}>
    <form onSubmit={submit}>
      <p className="form-note"><strong>{item.client.name}</strong> sai do quadro. Atendimentos, vendas e histórico são preservados, e o cartão fica na aba Excluídos com o motivo.</p>
      <Field label="Motivo da exclusão" required>
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} minLength={5} maxLength={1000} required autoFocus
          placeholder="Ex.: cliente duplicado, cadastro feito por engano, cliente desistiu antes do atendimento…" />
      </Field>
      {error && <p className="error" role="alert">{error}</p>}
      <footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="button primary" disabled={busy || reason.trim().length < 5}>{busy ? "Excluindo…" : "Excluir cartão"}</button></footer>
    </form>
  </Modal>;
}

function CrmDialog({
  opportunity: item,
  initial,
  crm,
  data,
  actorId,
  account,
  onAction,
  onClose,
  onAttendance,
  onMode,
  labels,
  stageOrder,
}) {
  const [version, setVersion] = useState(initial.version);
  const [stage, setStage] = useState(initial.stage);
  const [responsibleId, setResponsible] = useState(item.responsibleId);
  const [nextAction, setNextAction] = useState(item.nextAction);
  const [nextDate, setNextDate] = useState(item.nextDate);
  const [note, setNote] = useState("");
  const [products, setProducts] = useState([]);
  const [value, setValue] = useState("");
  const [date, setDate] = useState(today());
  const [seller, setSeller] = useState(actorId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const type = initial.type;
  const stale = version !== item.version;
  const events = crmTimeline(crm.activities, item.id);
  const titles = {
    update: "Próximo passo",
    sale: "Registrar venda",
    lose: "Encerrar sem negócio",
    reopen: "Reabrir negociação",
    complete: "Concluir negociação",
    details: "Resumo da oportunidade",
    note: "Registrar contato",
  };
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onAction(item.id, {
        type,
        version,
        stage,
        responsibleId,
        nextAction,
        nextDate,
        note,
        products,
        value,
        date,
        sellerTeamId: seller,
      });
      onClose();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  const reconcile = () => {
    setVersion(item.version);
    setProducts((current) =>
      current.filter((name) =>
        (type === "reopen"
          ? productNames(data)
          : item.pendingProducts
        ).includes(name),
      ),
    );
    setError("");
  };
  const productOptions =
    type === "reopen" ? productNames(data) : item.pendingProducts;
  return (
    <Modal title={item.client.name} onClose={busy ? () => {} : onClose} wide>
      <div className="crm-detail-summary">
        <div>
          {item.deleted ? <Badge tone="red">Excluído</Badge> : <Badge tone={item.stage === "won" ? "success" : "blue"}>{labels[item.stage]}</Badge>}
          {cycleSales(crm, item).map((sale) => <p className="crm-detail-sale" key={sale.id}>
            {item.stage === "won" ? "Venda realizada" : "Venda parcial"} por <strong>{person(sale.sellerTeamId)}</strong> em {dateLabel(sale.date)}: {sale.products.join(", ")}, {money(sale.value)}.
          </p>)}
          {item.client.phone && (
            <a href={`tel:${phoneDigits(item.client.phone)}`}>
              <Icon name="phone" size={14} />
              {item.client.phone}
            </a>
          )}
          {item.client.email && (
            <a href={`mailto:${item.client.email}`}>
              <Icon name="mail" size={14} />
              {item.client.email}
            </a>
          )}
          {!item.client.phone && !item.client.email && <p>Sem telefone ou e-mail informado.</p>}
          {TEAM.length > 1 && <small>
            Responsável: <strong>{person(item.responsibleId)}</strong>. Criado por {person(item.prospectorId)}.
          </small>}
        </div>
        {!item.deleted && <button className="button primary" disabled={busy} onClick={onAttendance}>
          <Icon name="message" size={18} />
          Registrar atendimento
        </button>}
      </div>
      {item.deleted ? (
        <div className="crm-deleted-note" role="note">
          <strong>Cartão excluído</strong>
          <p>
            Por {item.deletedByName || deletedEvent(crm, item)?.actorName || "usuário não registrado"}
            {item.deletedAt || deletedEvent(crm, item)?.at ? ` em ${new Date(item.deletedAt || deletedEvent(crm, item).at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}.
          </p>
          <p>Motivo: {item.deletedReason || "não informado (excluído antes de o motivo ser obrigatório)."}</p>
        </div>
      ) : (
      <div className="crm-detail-actions" role="group" aria-label="O que você quer registrar">
        {active(item) ? (
          <>
            <button
              type="button"
              className={`button ${type === "update" ? "primary" : "secondary"}`}
              aria-pressed={type === "update"}
              disabled={busy}
              onClick={() => onMode("update")}
            >
              Atualizar
            </button>
            <button
              type="button"
              className={`button ${type === "sale" ? "primary" : "secondary"}`}
              aria-pressed={type === "sale"}
              disabled={busy || !item.pendingProducts.length}
              onClick={() => onMode("sale")}
            >
              Registrar venda
            </button>
            <button
              type="button"
              className={`button ${type === "note" ? "primary" : "secondary"}`}
              aria-pressed={type === "note"}
              disabled={busy}
              onClick={() => onMode("note")}
            >
              Registrar contato
            </button>
            <button
              type="button"
              className={`button ${type === "lose" ? "primary" : "secondary"}`}
              aria-pressed={type === "lose"}
              disabled={busy}
              onClick={() => onMode("lose")}
            >
              Sem negócio
            </button>
            {item.completedProducts.length > 0 && (
              <button
                type="button"
                className={`button ${type === "complete" ? "primary" : "secondary"}`}
                aria-pressed={type === "complete"}
                disabled={busy}
                onClick={() => onMode("complete")}
              >
                Concluir negociação
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              className={`button ${type === "reopen" ? "primary" : "secondary"}`}
              aria-pressed={type === "reopen"}
              disabled={busy}
              onClick={() => onMode("reopen")}
            >
              Reabrir negociação
            </button>
            <button
              type="button"
              className={`button ${type === "note" ? "primary" : "secondary"}`}
              aria-pressed={type === "note"}
              disabled={busy}
              onClick={() => onMode("note")}
            >
              Registrar contato
            </button>
          </>
        )}
      </div>
      )}
      <AttendanceHistory attendances={opportunityAttendances(data, item.id)} />
      {type !== "details" && !item.deleted && (
        <form className="crm-action-form" onSubmit={submit}>
          <h3>{titles[type]}</h3>
          {stale && (
            <div className="crm-stale" role="alert">
              <p>
                A equipe atualizou esta oportunidade. Etapa atual:{" "}
                <strong>{labels[item.stage]}</strong>. Seus campos foram
                mantidos. Responsável atual: {person(item.responsibleId)}.
                Próxima ação atual: {item.nextAction || "Não informada"}
                {item.nextDate ? `, em ${dateLabel(item.nextDate)}` : ""}.
              </p>
              <button
                type="button"
                className="button secondary"
                onClick={reconcile}
              >
                Revisar com dados atuais
              </button>
            </div>
          )}
          {type === "update" && (
            <>
              <div className="fields two">
                <Select
                  label="Etapa da oportunidade"
                  value={stage}
                  onChange={setStage}
                >
                  {stageOrder
                    .filter((key) => !["won", "lost"].includes(key))
                    .map((id) => (
                      <option key={id} value={id}>
                        {labels[id]}
                      </option>
                    ))}
                </Select>
                {TEAM.length <= 1 ? null : !account || account.role === "admin"
                  ? <Select
                      label="Responsável"
                      value={responsibleId}
                      onChange={setResponsible}
                    >
                      {!isTeamMember(item.responsibleId) && <option value={item.responsibleId}>{person(item.responsibleId)}</option>}
                      {TEAM.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.id === actorId ? `${user.name} (você)` : user.name}
                        </option>
                      ))}
                    </Select>
                  : <div className="crm-seller-readonly">
                      <span>Responsável</span>
                      <strong>{person(item.responsibleId)}</strong>
                    </div>}
              </div>
              <div className="fields two">
                <Field
                  label="Próxima ação"
                  value={nextAction}
                  maxLength={1000}
                  onChange={(event) => setNextAction(event.target.value)}
                  placeholder="Ex.: enviar orçamento ao cliente"
                />
                <Field
                  label="Data do próximo retorno"
                  type="date"
                  value={nextDate}
                  onChange={(event) => setNextDate(event.target.value)}
                />
              </div>
            </>
          )}
          {["sale", "reopen"].includes(type) && (
            <>
              <p>
                {type === "sale"
                  ? "Selecione apenas os produtos deste fechamento. Os demais continuam em negociação."
                  : "Escolha os produtos da nova negociação. As vendas anteriores serão preservadas."}
              </p>
              <fieldset className="crm-product-options">
                <legend>
                  {type === "sale"
                    ? "Produtos vendidos"
                    : "Produtos da negociação"}
                </legend>
                {productOptions.map((name) => (
                  <label key={name}>
                    <input
                      type="checkbox"
                      checked={products.includes(name)}
                      onChange={(event) =>
                        setProducts(
                          event.target.checked
                            ? [...products, name]
                            : products.filter((item) => item !== name),
                        )
                      }
                    />
                    {name}
                  </label>
                ))}
              </fieldset>
              {!productOptions.length && (
                <p className="inline-note">
                  Registre um atendimento com os produtos de interesse para
                  iniciar a negociação.
                </p>
              )}
            </>
          )}
          {type === "sale" && (
            <>
              <div className="fields two">
                <Field
                  label="Valor deste fechamento (R$)"
                  type="number"
                  min="0"
                  max="1000000000"
                  step="0.01"
                  value={value}
                  required
                  onChange={(event) => setValue(event.target.value)}
                  hint="Informe 0 se o valor ainda não foi informado."
                />
                <Field
                  label="Data da venda"
                  type="date"
                  value={date}
                  max={today()}
                  required
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
              {TEAM.length > 1 && <Select
                label="Quem realizou a venda"
                value={seller}
                onChange={setSeller}
                disabled={!!account && !account.role === "admin"}
              >
                {TEAM.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>}
            </>
          )}
          {type === "complete" && (
            <p>
              A venda parcial será mantida. Os produtos ainda pendentes serão
              encerrados sem nova venda.
            </p>
          )}
          <Field
            label={
              ["lose", "reopen", "complete"].includes(type)
                ? "Motivo"
                : type === "note"
                  ? "Ação realizada"
                  : "Observação para a equipe"
            }
          >
            <textarea
              value={note}
              maxLength={1000}
              required={["lose", "reopen", "complete", "note"].includes(type)}
              rows={3}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Conte o que aconteceu e ajude no próximo atendimento…"
            />
          </Field>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <footer className="modal-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={onClose}
            >
              Cancelar
            </button>
            <button className="button primary" disabled={busy || stale}>
              {busy
                ? "Salvando…"
                : type === "sale"
                  ? "Confirmar venda"
                  : "Salvar ação"}
            </button>
          </footer>
        </form>
      )}
      <section className="crm-timeline" aria-label="Histórico da oportunidade">
        <h3>Uma história construída pela equipe</h3>
        {events.map((event) => (
          <article key={event.id}>
            <span
              className={`crm-timeline-dot ${event.type === "sale" ? "sale" : ""}`}
            />
            <div>
              <strong>{eventLabel(event, labels)}</strong>
              <small>
                {event.actorName}, {new Date(event.at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
              </small>
              {event.note && <p>{event.note}</p>}
              {event.type === "sale" && (
                <p>
                  {money(event.value)} em {event.products.join(", ")}, vendido em {dateLabel(event.date)}
                  {TEAM.length > 1 ? ` por ${person(event.sellerTeamId)}` : ""}.
                </p>
              )}
              {event.type === "attendance" && (
                <p>
                  {ATTENDANCE_CHANNELS[event.channel]} em {dateLabel(event.date)}
                  {event.products.length ? `, com ${event.products.join(", ")}` : ""}.
                </p>
              )}
              {event.type === "updated" && (event.nextAction || TEAM.length > 1) && (
                <p>
                  {TEAM.length > 1 && event.previousResponsibleId !== event.responsibleId ? `Responsável: ${person(event.responsibleId)}. ` : ""}
                  {event.nextAction ? `Próximo passo: ${event.nextAction}${event.nextDate ? `, em ${dateLabel(event.nextDate)}` : ""}.` : ""}
                </p>
              )}
            </div>
          </article>
        ))}
      </section>
    </Modal>
  );
}
function AttendanceHistory({ attendances }) {
  return <section className="crm-prospecting-context" aria-label="Atendimentos do cliente">
    <div className="crm-prospecting-heading">
      <h3>Atendimentos</h3>
      <span>{attendances.length === 1 ? "1 registro" : `${attendances.length} registros`}</span>
    </div>
    {!attendances.length ? <p className="crm-prospecting-empty">Nenhum atendimento registrado nesta oportunidade.</p>
      : <div className="crm-prospecting-list">{attendances.map((row) =>
        <article className="crm-prospecting-visit" key={row.id}>
          <div className="crm-prospecting-visit-heading">
            <strong>{dateLabel(row.date)}</strong>
            <span>{ATTENDANCE_CHANNELS[row.channel]}, {ATTENDANCE_KINDS[row.kind].toLowerCase()}{TEAM.length > 1 ? `, por ${person(row.userId)}` : ""}</span>
          </div>
          {!!row.offered?.length && <div className="crm-prospecting-products">
            {row.offered.map((product) => <Badge key={product} tone={row.sold?.includes(product) ? "success" : "blue"}>
              {product}{row.sold?.includes(product) ? ", vendido" : ""}
            </Badge>)}
          </div>}
          {row.notes ? <p className="pre-line">{row.notes}</p> : <small>Sem anotações neste atendimento.</small>}
        </article>)}</div>}
  </section>;
}
function eventLabel(event, labels = CRM_STAGES) {
  return (
    {
      created: "Oportunidade aberta",
      attendance: "Atendimento registrado",
      deleted: "Cartão excluído",
      restored: "Cartão restaurado",
      sale: "Venda registrada",
      note: "Contato / ação realizada",
      lost: "Encerrada sem negócio",
      reopened: "Negociação reaberta",
      completed: "Negociação concluída",
      updated:
        event.from === event.to
          ? "Próximo passo atualizado"
          : `${labels[event.from]} → ${labels[event.to]}`,
    }[event.type] || "Atualização"
  );
}


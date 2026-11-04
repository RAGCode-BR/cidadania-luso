import React, { useEffect, useRef, useState } from "react";
import {
  CRM_STAGES,
  crmStageOrder,
  crmActiveStageIds,
  crmTimeline,
  emptyCrm,
} from "../lib/crm.mjs";
import {
  TEAM,
  originLabel,
  addressLabel,
  dateLabel,
  money,
  normalize,
  person,
  productNames,
  today,
} from "../lib/domain.mjs";
import { Badge, Empty, Field, Icon, Metric, Modal, Select } from "./ui.jsx";
import VisitPhoto from "./VisitPhoto.jsx";
import { repository } from "../lib/repository.mjs";
import Pagination from "./Pagination.jsx";
import "../crm.css";

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
  onVisit,
  onServices,
}) {
  const crm = data.crm || emptyCrm();
  const labels = { ...CRM_STAGES, ...crm.stageLabels };
  const stageOrder = crmStageOrder(crm);
  const activeStageIds = crmActiveStageIds(crm);
  const [query, setQuery] = useState("");
  const [responsible, setResponsible] = useState("");
  const [origin, setOrigin] = useState("");
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
  useEffect(() => setPage(1), [query, responsible, origin, closedStage, view]);
  useEffect(() => {
    if (!stageOrder.includes(mobileStage)) setMobileStage(stageOrder[0]);
  }, [stageOrder.join("|"), mobileStage]);
  const filtered = crm.opportunities.filter(
    (item) =>
      !item.deleted &&
      (!origin || (origin === "manual" ? item.source === "manual" : (item.sources?.length ? item.sources : [item.source || "visit"]).includes(origin))) &&
      (!responsible || item.responsibleId === responsible) &&
      (!returns ||
        (returns === "overdue"
          ? overdue(item)
          : active(item) && item.nextDate === today())) &&
      normalize(
        [
          item.work.name,
          item.work.responsible,
          item.work.phone,
          item.work.neighborhood,
          item.work.city,
          ...item.products,
        ].join(" "),
      ).includes(normalize(query)),
  );
  const archived = filtered
    .filter(
      (item) => !active(item) && (!closedStage || item.stage === closedStage),
    )
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
    );
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(archived.length / 12)),
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
  const visit = (item) => {
    setDialog(null);
    onVisit(item);
  };
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
      <div className="crm-intro">
        <div>
          <span className="crm-shared">
            <Icon name="users" size={15} />
            Visão da equipe
          </span>
        </div>
        <div className="crm-intro-actions">
          <button className="button secondary" onClick={() => setAddingCard(true)}>Adicionar cartão</button>
          {(!account || account.role === "admin") && (
            <>
              <button className="button secondary" onClick={() => setAddingColumn(true)}><Icon name="plus" size={16} />Adicionar coluna</button>
              <button className="button secondary" onClick={() => setReorderingColumns(true)}><Icon name="reorder" size={16} />Reordenar colunas</button>
            </>
          )}
          <button className="button primary" onClick={() => setAddingCard(true)}><Icon name="plus" size={17} />Nova oportunidade</button>
        </div>
      </div>
      <div className="metrics crm-metrics">
        <Metric
          label="Oportunidades abertas"
          value={crm.opportunities.filter((item) => !item.deleted && active(item)).length}
          detail="Obras em acompanhamento"
          icon="building"
        />
        <Metric
          label="Em negociação"
          value={
            crm.opportunities.filter((item) => !item.deleted && active(item) &&
              (item.stage === "negotiating" || item.completedProducts.length))
              .length
          }
          detail="Conversas próximas do fechamento"
          icon="trend"
        />
        <Metric
          label="Retornos em atraso"
          value={crm.opportunities.filter((item) => !item.deleted && overdue(item)).length}
          detail="Próximas ações que precisam de atenção"
          icon="clock"
        />
        <Metric
          label="Vendas no CRM"
          value={money(
            crm.sales.reduce((total, sale) => total + sale.value, 0),
          )}
          detail={`${crm.sales.length} fechamentos, incluindo os das visitas`}
          icon="chart"
          accent
        />
      </div>
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
            <Icon name="kanban" size={17} /> Em andamento
            <span>{crm.opportunities.filter((item) => !item.deleted && active(item)).length}</span>
          </button>
          <button
            aria-pressed={view === "closed"}
            onClick={() => showView("closed")}
          >
            <Icon name="check" size={17} /> Encerradas
            <span>
              {crm.opportunities.filter((item) => !item.deleted && !active(item)).length}
            </span>
          </button>
        </div>
        <div className="crm-toolbar">
          <div className="field crm-search-field">
            <label htmlFor="crm-search">Buscar oportunidades</label>
            <div className="search-input">
            <Icon name="search" size={17} />
            <input
              id="crm-search"
              aria-label="Buscar oportunidades"
              placeholder="Obra, bairro, contato ou produto…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            </div>
          </div>
          <Select
            label="Vendedor da oportunidade"
            value={responsible}
            onChange={setResponsible}
          >
            <option value="">Toda a equipe</option>
            {TEAM.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select label="Origem da oportunidade" value={origin} onChange={setOrigin}>
            <option value="">Todas as origens</option>
            <option value="visit">Visita à obra</option>
            <option value="manual">Obra cadastrada</option>
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
          ) : (
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
            <div className="crm-board-tip">
              <span>
                <Icon name="kanban" size={16} />
                Uma oportunidade por obra. Todas as visitas no mesmo fluxo.
              </span>
              <small>
                Abra um cartão para atualizar ou arraste entre as etapas.
              </small>
            </div>
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
                        {label}
                        {(!account || account.role === "admin") && (
                          <>
                            <button type="button" className="crm-column-edit"
                              aria-label={`Renomear coluna ${label}`} title={`Renomear coluna ${label}`}
                              onClick={() => setEditingLabel(stage)}><Icon name="edit" size={14} /></button>
                            <button type="button" className="crm-column-edit crm-column-delete"
                              aria-label={`Excluir coluna ${label}`} title={`Excluir coluna ${label}`}
                              onClick={() => setDeletingColumn(stage)}><Icon name="close" size={14} /></button>
                          </>
                        )}
                      </span>
                      <b>{items.length}</b>
                    </header>
                    <div className="crm-column-cards">
                      {!active({ stage }) ? (
                        <div className="crm-closed-summary">
                          <Icon
                            name={stage === "won" ? "check" : "kanban"}
                            size={27}
                          />
                          <strong>
                            {items.length}{" "}
                            {stage === "won"
                              ? "com venda realizada"
                              : "sem negócio"}
                          </strong>
                          <p>
                            Consulte os registros e o histórico na lista de
                            encerradas.
                          </p>
                          <button
                            className="button secondary"
                            onClick={() => showView("closed", stage)}
                          >
                            {stage === "won"
                              ? "Consultar vendas"
                              : "Consultar encerradas"}
                            <Icon name="arrow" size={15} />
                          </button>
                        </div>
                      ) : (
                        items.map((item) => (
                          <article
                            className="crm-card"
                            key={item.id}
                            draggable
                            onClick={(event) => {
                              if (draggingCard.current || event.target.closest("button")) return;
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
                            <div className="crm-card-top">
                              <Badge
                                tone={
                                  item.work.type === "Comercial" ? "blue" : ""
                                }
                              >
                                {item.work.type}
                              </Badge>
                              <span className="crm-origin">{originLabel(item.source)}</span>
                              {item.completedProducts.length > 0 &&
                                active(item) && (
                                  <span className="crm-partial">
                                    Venda parcial
                                  </span>
                                )}
                            </div>
                            <button
                              className="crm-card-title"
                              title={item.work.name}
                              onClick={() =>
                                open(item, active(item) ? "update" : "details")
                              }
                            >
                              {item.work.name}
                            </button>
                            <p className="crm-card-address">
                              <Icon name="visit" size={14} />
                              <span title={`${item.work.neighborhood} · ${item.work.city}`}>{item.work.neighborhood} · {item.work.city}</span>
                            </p>
                            <div className="crm-product-chips">
                              {(active(item)
                                ? item.pendingProducts
                                : item.products
                              )
                                .slice(0, 3)
                                .map((name) => (
                                  <span key={name}>{name}</span>
                                ))}
                              {(active(item)
                                ? item.pendingProducts
                                : item.products
                              ).length > 3 && (
                                <span>
                                  +
                                  {(active(item)
                                    ? item.pendingProducts
                                    : item.products
                                  ).length - 3}
                                </span>
                              )}
                            </div>
                              <div
                                className={`crm-card-next ${overdue(item) ? "late" : ""} ${!item.nextAction ? "crm-card-next-empty" : ""}`}
                                title={item.nextAction || "Sem próximo passo definido"}
                              >
                                <Icon name="clock" size={14} />
                                <span>
                                  {item.nextDate && (
                                    <strong>
                                      {overdue(item) ? "Em atraso · " : ""}
                                      {dateLabel(item.nextDate)}
                                    </strong>
                                  )}
                                  {item.nextAction || "Sem próximo passo definido"}
                                </span>
                              </div>
                            <div className="crm-card-owner">
                              <span className="avatar">
                                {
                                  TEAM.find(
                                    (row) => row.id === item.responsibleId,
                                  )?.initials
                                }
                              </span>
                              <span>
                                {person(item.responsibleId)}
                                <small>Vendedor responsável</small>
                              </span>
                              <small>
                                {
                                  crm.visitLinks.filter(
                                    (link) =>
                                      link.opportunityId === item.id &&
                                      !link.deleted,
                                  ).length
                                }{" "}
                                contatos
                              </small>
                            </div>
                            <footer>
                              <button
                                className="button text-button"
                                aria-label={`Abrir oportunidade ${item.work.name}`}
                                onClick={() =>
                                  open(
                                    item,
                                    active(item) ? "update" : "details",
                                  )
                                }
                              >
                                Ver detalhes
                                <Icon name="arrow" size={15} />
                              </button>
                              <button
                                className="icon-button"
                                aria-label={`Registrar visita em ${item.work.name}`}
                                title="Registrar visita"
                                onClick={() => visit(item)}
                              >
                                <Icon name="plus" size={18} />
                              </button>
                              <button className="icon-button" aria-label={`Excluir cartão ${item.work.name}`} title="Excluir cartão"
                                onClick={() => setDeletingCard(item)}><Icon name="close" size={17} /></button>
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
                            : "As oportunidades das visitas aparecerão aqui"}
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
        ) : (
          <div className="crm-archive">
            <div className="crm-archive-heading">
              <div>
                <h2>Negociações encerradas</h2>
                <p>
                  Histórico preservado. Abra uma obra para consultar ou reabrir
                  a negociação.
                </p>
              </div>
              <Badge>{archived.length} registros</Badge>
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
                      <span className="crm-origin">{originLabel(item.source)}</span>
                      <button
                        className="crm-card-title"
                        onClick={() => open(item, "details")}
                      >
                        {item.work.name}
                      </button>
                      <p>
                        {item.work.neighborhood} · {item.work.city}
                      </p>
                      <small>{item.products.join(" · ")}</small>
                    </div>
                    <div className="crm-archive-meta">
                      <span>
                        Vendedor<strong>{person(item.responsibleId)}</strong>
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
                      aria-label={`Abrir oportunidade ${item.work.name}`}
                      onClick={() => open(item, "details")}
                    >
                      Ver histórico <Icon name="arrow" size={15} />
                    </button>
                    <button className="button text-button" onClick={() => setDeletingCard(item)} aria-label={`Excluir cartão ${item.work.name}`}>Excluir cartão</button>
                  </article>
                ))}
            </div>
            {!archived.length && (
              <Empty
                icon="check"
                title="Nenhuma negociação encerrada"
                description="As obras encerradas aparecerão aqui. Confira também os filtros selecionados."
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
          onVisit={() => visit(selected)}
          onServices={onServices}
          onMode={(type) => open(selected, type)}
          labels={labels}
          stageOrder={stageOrder}
        />
      )}
      {addingCard && <AddCrmCard works={data.works} stageIds={activeStageIds} labels={labels}
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

function AddCrmCard({ works, stageIds, labels, onCreate, onClose }) {
  const [workId, setWorkId] = useState("");
  const [stage, setStage] = useState(stageIds[0] || "");
  const [draft, setDraft] = useState({ name: "", street: "", number: "", neighborhood: "", city: "", state: "", responsible: "", phone: "", products: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const field = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    if (!stage) return setError("Selecione uma coluna.");
    setBusy(true);
    setError("");
    try { await onCreate({ ...draft, workId }, stage); onClose(); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  return <Modal title="Nova oportunidade" onClose={onClose}>
    <form onSubmit={submit}>
      <p>Cadastre a obra e os produtos a negociar. O cartão será criado na coluna escolhida.</p>
      {!!works.length && <Select label="Obra já cadastrada (opcional)" value={workId} onChange={setWorkId}>
        <option value="">Nova obra</option>
        {works.map((work) => <option key={work.id} value={work.id}>{work.name} · {work.neighborhood}</option>)}
      </Select>}
      {!workId && <>
        <Field label="Cliente / obra" value={draft.name} onChange={field("name")} required maxLength={180} />
        <div className="fields two"><Field label="Rua / avenida" value={draft.street} onChange={field("street")} required maxLength={180} /><Field label="Número" value={draft.number} onChange={field("number")} maxLength={20} /></div>
        <div className="fields two"><Field label="Bairro" value={draft.neighborhood} onChange={field("neighborhood")} required maxLength={100} /><Field label="Cidade" value={draft.city} onChange={field("city")} required maxLength={100} /></div>
        <div className="fields two"><Field label="UF" value={draft.state} onChange={field("state")} required maxLength={2} /><Field label="Contato responsável" value={draft.responsible} onChange={field("responsible")} maxLength={180} /></div>
        <Field label="Telefone" type="tel" value={draft.phone} onChange={field("phone")} maxLength={25} />
      </>}
      <Field label="Produtos a negociar" value={draft.products} onChange={field("products")} required placeholder="Separe os produtos por vírgula" hint="Ex.: Forro, Divisória" />
      <Select label="Coluna" value={stage} onChange={setStage} required>
        {stageIds.map((id) => <option key={id} value={id}>{labels[id]}</option>)}
      </Select>
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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError("");
    try { await onAction(item.id, { type: "delete", version: item.version }); onClose(); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  return <Modal title="Excluir cartão do CRM?" onClose={onClose}>
    <p><strong>{item.work.name}</strong> sairá do quadro. Visitas, vendas e histórico serão preservados.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <footer className="modal-actions"><button className="button secondary" onClick={onClose}>Cancelar</button>
      <button className="button primary" disabled={busy} onClick={submit}>{busy ? "Excluindo…" : "Excluir cartão"}</button></footer>
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
  onVisit,
  onServices,
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
    <Modal title={item.work.name} onClose={busy ? () => {} : onClose} wide>
      <div className="crm-detail-summary">
        <div>
          <Badge tone="blue">{labels[item.stage]}</Badge>
          <Badge>{originLabel(item.source)}</Badge>
          <p>{addressLabel(item.work)}</p>
          {item.work.responsible && (
            <p>
              Responsável da obra: <strong>{item.work.responsible}</strong>
            </p>
          )}
          {item.work.phone && (
            <a href={`tel:${item.work.phone.replace(/\D/g, "")}`}>
              <Icon name="phone" size={14} />
              {item.work.phone}
            </a>
          )}
          <small>
            Prospecção: {person(item.prospectorId)} · Vendedor responsável:{" "}
            {person(item.responsibleId)}
          </small>
        </div>
        <button className="button secondary" disabled={busy} onClick={onVisit}>
          <Icon name="visit" size={16} />
          Registrar visita
        </button>
      </div>
      <div className="crm-detail-actions">
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
      <ProspectingContext opportunity={item} account={account} />
      {type !== "details" && (
        <form className="crm-action-form" onSubmit={submit}>
          <h3>{titles[type]}</h3>
          {stale && (
            <div className="crm-stale" role="alert">
              <p>
                A equipe atualizou esta oportunidade. Etapa atual:{" "}
                <strong>{labels[item.stage]}</strong>. Seus campos foram
                mantidos. Vendedor atual: {person(item.responsibleId)}.
                Próxima ação atual: {item.nextAction || "Não informada"}
                {item.nextDate ? ` · ${dateLabel(item.nextDate)}` : ""}.
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
                {!account || account.role === "admin"
                  ? <Select
                      label="Vendedor responsável"
                      value={responsibleId}
                      onChange={setResponsible}
                    >
                      {TEAM.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </Select>
                  : <div className="crm-seller-readonly">
                      <span>Vendedor responsável</span>
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
                  Registre uma visita com os produtos de interesse para iniciar
                  a negociação.
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
              <Select
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
              </Select>
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
      {onServices && crm.sales.some((sale) => sale.opportunityId === item.id) && <section className="service-crm-handoff">
        <h3>Serviços após a venda</h3>
        {crm.sales.filter((sale) => sale.opportunityId === item.id).map((sale) => <div key={sale.id}><span>{dateLabel(sale.date)} · {sale.products.join(", ")}</span><button className="button secondary" onClick={() => { onClose(); onServices(sale.id); }}><Icon name="tools" size={16} />Criar serviço</button></div>)}
      </section>}
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
                {event.actorName} · {new Date(event.at).toLocaleString("pt-BR")}
              </small>
              {event.note && <p>{event.note}</p>}
              {event.type === "sale" && (
                <p>
                  {event.products.join(", ")} · {money(event.value)} · Venda:{" "}
                  {person(event.sellerTeamId)} · {dateLabel(event.date)}
                </p>
              )}
              {event.type === "visit" && (
                <p>
                  {dateLabel(event.date)} ·{" "}
                  {event.products.join(", ") || "Relacionamento sem produtos"}
                </p>
              )}
              {event.type === "updated" && (
                <p>
                  Vendedor: {person(event.responsibleId)}
                  {event.nextAction ? ` · ${event.nextAction}` : ""}
                  {event.nextDate ? ` · ${dateLabel(event.nextDate)}` : ""}
                </p>
              )}
            </div>
          </article>
        ))}
      </section>
    </Modal>
  );
}
function ProspectingContext({ opportunity, account }) {
  const allowed = !account || account.role === "admin" ||
    account.teamId === opportunity.responsibleId;
  const key = `${opportunity.id}:${opportunity.version}`;
  const [result, setResult] = useState({ key: "", visits: null, error: "" });
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    repository.crmProspecting(opportunity.id, controller.signal)
      .then((visits) => {
        if (!controller.signal.aborted) setResult({ key, visits, error: "" });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ key, visits: null, error: error.message });
      });
    return () => controller.abort();
  }, [key, allowed]);
  const visits = result.key === key ? result.visits : null;
  return <section className="crm-prospecting-context" aria-label="Registros da prospecção">
    <div className="crm-prospecting-heading">
      <span className="crm-prospecting-icon"><Icon name="camera" size={19} /></span>
      <div>
        <h3>Registros da prospecção</h3>
        <p>Fotos e anotações para preparar a conversa com o cliente.</p>
      </div>
    </div>
    {!allowed ? <p className="crm-prospecting-empty">Disponível para o vendedor designado e a administração.</p>
      : result.key !== key ? <p className="crm-prospecting-empty" role="status">Carregando registros…</p>
      : result.error ? <p className="error" role="alert">{result.error}</p>
      : !visits?.length ? <p className="crm-prospecting-empty">Nenhuma visita vinculada a esta oportunidade.</p>
      : <div className="crm-prospecting-list">{visits.map((visit) =>
        <article className="crm-prospecting-visit" key={visit.id}>
          <div className="crm-prospecting-visit-heading">
            <strong>{dateLabel(visit.date)}</strong>
            <span>Visita de {person(visit.userId)}</span>
          </div>
          {!!visit.offered?.length && <div className="crm-prospecting-products">
            {visit.offered.map((product) => <Badge key={product} tone={visit.sold?.includes(product) ? "success" : "blue"}>
              {product}{visit.sold?.includes(product) ? " · vendido" : " · oferecido"}
            </Badge>)}
          </div>}
          {visit.notes && <p className="pre-line">{visit.notes}</p>}
          {!!visit.photos?.length && <div className="detail-photos crm-prospecting-photos">
            {visit.photos.map((photo) => <VisitPhoto key={photo.id} photo={photo} alt={`Foto da obra: ${photo.name}`} />)}
          </div>}
          {!visit.notes && !visit.photos?.length && <small>Sem fotos ou anotações neste contato.</small>}
        </article>)}</div>}
  </section>;
}
function eventLabel(event, labels = CRM_STAGES) {
  return (
    {
      created: "Oportunidade aberta",
      visit: "Visita registrada",
      deleted: "Cartão ocultado",
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


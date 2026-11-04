import React, { useEffect, useRef, useState } from "react";
import { addressLabel, catalogProducts, dateLabel, normalize, person, today } from "../lib/domain.mjs";
import { SERVICE_PERIODS, SERVICE_STATUSES, SERVICE_TYPES, changeServiceStatus, decideInstallation, deleteInstaller, newAppointment, newService, saleServiceDraft, saveInstaller, saveService, serviceCode, serviceSales, serviceWeek, shiftServiceDate } from "../lib/services.mjs";
import { AddressFields, Badge, Empty, Field, Icon, Metric, Modal, Select } from "./ui.jsx";
import ServiceDateField from "./ServiceDateField.jsx";
import ServiceHistory from "./ServiceHistory.jsx";
import Pagination from "./Pagination.jsx";
import VisitPhoto from "./VisitPhoto.jsx";
import { preparePhoto } from "../lib/photo.mjs";
import { cloudEnabled } from "../lib/auth.mjs";
import "../services.css";

const statusTone = (status) => status === "completed" ? "success" : ["cancelled", "return_required"].includes(status) ? "red" : "blue";
const active = (item) => !["completed", "cancelled"].includes(item.status);
const periodLabel = (item) => item.period === "custom" ? `${item.startTime}–${item.endTime}` : SERVICE_PERIODS[item.period];
const crew = (item, data) => item.installerIds.map((id) => data.installers?.find((row) => row.id === id)?.name || "Profissional").join(", ");
const dateRange = (item) => `${dateLabel(item.date)}${item.endDate && item.endDate !== item.date ? ` a ${dateLabel(item.endDate)}` : ""}`;
const serviceFormDraft = (initial) => ({ ...newService(), ...structuredClone(initial), street: initial.street || initial.address || "" });

export default function Services({ data, save, actor, seed }) {
  const [view, setView] = useState("agenda");
  const [period, setPeriod] = useState("week");
  const [date, setDate] = useState(today());
  const [query, setQuery] = useState("");
  const [installer, setInstaller] = useState("");
  const [status, setStatus] = useState("");
  const [editor, setEditor] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [action, setAction] = useState(null);
  const [page, setPage] = useState(1);
  const [salesFilter, setSalesFilter] = useState("pending");
  const [error, setError] = useState("");
  const services = data.services || [], sales = serviceSales(data);
  useEffect(() => {
    if (!seed?.saleId) return;
    const sale = serviceSales(data).find((row) => row.id === seed.saleId);
    if (sale) { setView("agenda"); setDetailId(null); setEditor(saleServiceDraft(sale)); }
  }, [seed?.nonce]);
  useEffect(() => setPage(1), [view, query, installer, status, salesFilter]);
  const filtered = services.filter((item) => (!status || item.status === status) &&
    (!installer || item.appointments.some((appt) => appt.installerIds.includes(installer))) &&
    normalize(`${serviceCode(item.number)} ${item.name} ${item.address} ${item.neighborhood} ${item.city} ${item.description} ${item.products.join(" ")}`).includes(normalize(query)));
  const days = period === "day" ? [date] : serviceWeek(date);
  const pending = filtered.filter((item) => active(item) && !item.appointments.some((appt) => appt.state === "planned"));
  const pendingSales = sales.filter((sale) => !(data.serviceDecisions || {})[sale.id] || data.serviceDecisions[sale.id] === "pending");
  const visibleSales = sales.filter((sale) => salesFilter === "all" || pendingSales.some((row) => row.id === sale.id))
    .filter((sale) => normalize(`${sale.work.name} ${sale.work.neighborhood} ${sale.products.join(" ")}`).includes(normalize(query)))
    .sort((a, b) => b.date.localeCompare(a.date));
  const selected = services.find((row) => row.id === detailId);
  const openNew = () => { setDetailId(null); setEditor(newService()); };
  const list = [...filtered].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const pageItems = view === "sales" ? visibleSales : list;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(pageItems.length / 12)));
  const decision = async (saleId, value) => {
    setError("");
    try { await save((current) => decideInstallation(current, saleId, value), value === "pending" ? "Venda devolvida para análise." : "Venda marcada sem instalação.", { type: "decision", saleId, decision: value }); }
    catch (cause) { setError(cause.message); }
  };
  return <div className="services-page">
    <div className="services-intro">
      <div>{cloudEnabled ? <><span className="eyebrow">Pós-venda</span><p>Organize as instalações, a equipe e os retornos dos clientes.</p></> : <><span className="services-preview"><Icon name="info" size={15} />Prévia local</span><p>Agenda em avaliação. Registros salvos somente neste navegador.</p></>}</div>
      <button className="button primary" onClick={openNew}><Icon name="plus" size={18} />Novo serviço</button>
    </div>
    <div className="metrics services-metrics">
      <Metric label="Aguardando agenda" value={services.filter((item) => item.status === "waiting").length} detail="Serviços ainda sem data" icon="calendar" />
      <Metric label="Agendados" value={services.filter((item) => item.status === "scheduled").length} detail="Equipe e período definidos" icon="users" />
      <Metric label="Em execução" value={services.filter((item) => item.status === "in_progress").length} detail="Trabalhos em andamento" icon="building" />
      <Metric label="Retornos necessários" value={services.filter((item) => item.status === "return_required").length} detail="Pendências para acompanhar" icon="clock" accent />
    </div>
    <section className="panel services-workspace">
      <div className="services-tabs" role="group" aria-label="Visualização dos serviços">
        {[["agenda", "calendar", "Agenda"], ["list", "box", "Todos os serviços"], ["sales", "trend", "Vendas para instalação"], ["team", "users", "Equipe de execução"], ["history", "clock", "Histórico importado"]].map(([id, icon, label]) => <button key={id} aria-label={label} className={`button ${view === id ? "primary" : "secondary"}`} aria-pressed={view === id} onClick={() => setView(id)}><Icon name={icon} size={17} />{label}{id === "sales" && pendingSales.length > 0 && <span className="services-count">{pendingSales.length}</span>}</button>)}
      </div>
      {!["team", "history"].includes(view) && <div className="services-filters">
        <Field label="Buscar serviços ou vendas" placeholder="Cliente, obra, bairro, produto ou SV…" value={query} onChange={(event) => setQuery(event.target.value)} />
        {view === "sales" ? <Select label="Vendas exibidas" value={salesFilter} onChange={setSalesFilter}><option value="pending">Aguardando avaliação</option><option value="all">Todas as vendas</option></Select> : <>
          <Select label="Profissional" value={installer} onChange={setInstaller}><option value="">Toda a equipe</option>{(data.installers || []).map((row) => <option key={row.id} value={row.id}>{row.name}{row.deleted ? " (excluído)" : row.inactive ? " (inativo)" : ""}</option>)}</Select>
          <Select label="Situação do serviço" value={status} onChange={setStatus}><option value="">Todas as situações</option>{Object.entries(SERVICE_STATUSES).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</Select>
        </>}
      </div>}
      {error && <p className="error" role="alert">{error}</p>}
      {view === "agenda" && <>
        <div className="services-calendar-controls">
          <div className="tabs" role="group" aria-label="Período da agenda de serviços">{[["day", "Dia"], ["week", "Semana"]].map(([id, label]) => <button key={id} className={period === id ? "active" : ""} onClick={() => setPeriod(id)}>{label}</button>)}</div>
          <div className="button-row"><button className="icon-button" aria-label="Período anterior da agenda" onClick={() => setDate(shiftServiceDate(date, period === "week" ? -7 : -1))}>‹</button><ServiceDateField label="Data da agenda" value={date} onChange={(next) => setDate(next || today())} /><button className="icon-button" aria-label="Próximo período da agenda" onClick={() => setDate(shiftServiceDate(date, period === "week" ? 7 : 1))}>›</button><button className="button secondary" onClick={() => setDate(today())}>Hoje</button></div>
        </div>
        <div className="services-calendar-scroll"><div className={`services-calendar ${period === "day" ? "single-day" : ""}`}>
          {days.map((day) => {
            const events = filtered.flatMap((service) => service.appointments.filter((appt) => appt.state !== "cancelled" && appt.date <= day && (appt.endDate || appt.date) >= day && (!installer || appt.installerIds.includes(installer))).map((appointment) => ({ service, appointment })));
            return <section className={`services-day ${day === today() ? "is-today" : ""}`} key={day} aria-label={`Serviços em ${dateLabel(day)}`}>
              <header><span>{new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short" })}</span><strong>{dateLabel(day).slice(0, 5)}</strong><small>{events.length} agendamentos</small></header>
              <div className="services-day-items">{events.map(({ service, appointment }) => <button className={`service-calendar-card service-state-${service.status}`} key={`${service.id}-${appointment.id}`} onClick={() => setDetailId(service.id)}>
                <span className="service-event-time"><Icon name="clock" size={13} />{periodLabel(appointment)}</span><small>{serviceCode(service.number)} · {service.type}</small><strong>{service.name}</strong><span>{service.description}</span><span className="service-event-crew"><Icon name="users" size={14} />{crew(appointment, data)}</span><Badge tone={statusTone(service.status)}>{appointment.state === "completed" ? "Etapa realizada" : SERVICE_STATUSES[service.status]}</Badge>
              </button>)}{!events.length && <p className="services-day-empty">Sem agendamentos</p>}</div>
            </section>;
          })}
        </div></div>
        <section className="services-pending"><div className="panel-heading"><div><h2>Próximos serviços a organizar</h2><p>Serviços e retornos que ainda precisam de uma data.</p></div><Badge>{pending.length}</Badge></div>
          {pending.length ? <div className="services-pending-grid">{pending.slice(0, 6).map((item) => <button className="service-pending-card" key={item.id} onClick={() => setDetailId(item.id)}><small>{serviceCode(item.number)}</small><strong>{item.name}</strong><span>{item.description}</span><Badge tone={statusTone(item.status)}>{SERVICE_STATUSES[item.status]}</Badge></button>)}</div> : <p className="muted">Nenhum serviço sem data nos filtros atuais.</p>}
          {pending.length > 6 && <button className="button secondary" onClick={() => setView("list")}>Ver todos os serviços</button>}
        </section>
      </>}
      {view === "list" && (list.length ? <><div className="table-scroll"><table><thead><tr><th>Serviço / cliente</th><th>Produtos / local</th><th>Próximo agendamento</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{list.slice((currentPage - 1) * 12, currentPage * 12).map((item) => {
        const next = item.appointments.filter((appt) => appt.state === "planned").sort((a, b) => a.date.localeCompare(b.date))[0];
        return <tr key={item.id}><td><button className="table-link" onClick={() => setDetailId(item.id)}>{item.name}</button><small>{serviceCode(item.number)} · {item.type}</small></td><td>{item.products.join(", ") || "Serviço sem produto vinculado"}<small>{item.neighborhood} · {item.city}</small></td><td>{next ? <>{dateRange(next)}<small>{periodLabel(next)} · {crew(next, data)}</small></> : "Sem agendamento pendente"}</td><td><Badge tone={statusTone(item.status)}>{SERVICE_STATUSES[item.status]}</Badge></td><td><button className="button secondary" onClick={() => setDetailId(item.id)}>Ver serviço</button></td></tr>;
      })}</tbody></table></div><Pagination page={currentPage} totalItems={list.length} pageSize={12} onChange={setPage} itemLabel="serviços" /></> : <Empty title="Sua agenda começa com um serviço" description="Crie um serviço diretamente ou aproveite um fechamento do CRM." icon="calendar" action={<button className="button secondary" onClick={openNew}>Novo serviço</button>} />)}
      {view === "sales" && <div className="services-sales"><div className="panel-heading"><div><h2>Da venda à instalação</h2><p>Avalie cada fechamento. Uma venda pode ter vários serviços, sem duplicar seu valor no financeiro.</p></div></div>
        {visibleSales.length ? <><div className="table-scroll"><table><thead><tr><th>Venda / obra</th><th>Produtos / vendedor</th><th>Instalação</th><th>Ações</th></tr></thead><tbody>{visibleSales.slice((currentPage - 1) * 12, currentPage * 12).map((sale) => {
          const linked = services.filter((item) => item.saleId === sale.id);
          return <tr key={sale.id}><td><strong>{sale.work.name}</strong><small>{dateLabel(sale.date)} · {sale.work.neighborhood}</small></td><td>{sale.products.join(", ")}<small>{person(sale.sellerTeamId)}</small></td><td>{linked.length ? `${linked.length} serviço(s) vinculado(s)` : data.serviceDecisions?.[sale.id] === "not_required" ? "Sem instalação" : "Aguardando avaliação"}</td><td><div className="button-row"><button className="button secondary" onClick={() => { setDetailId(null); setEditor(saleServiceDraft(sale)); }}>{linked.length ? "Novo serviço da venda" : "Gerar serviço"}</button>{!linked.some(active) && <button className="button text-button" onClick={() => decision(sale.id, data.serviceDecisions?.[sale.id] === "not_required" ? "pending" : "not_required")}>{data.serviceDecisions?.[sale.id] === "not_required" ? "Reavaliar" : "Sem instalação"}</button>}</div></td></tr>;
        })}</tbody></table></div><Pagination page={currentPage} totalItems={visibleSales.length} pageSize={12} onChange={setPage} itemLabel="vendas para instalação" /></> : <Empty title={salesFilter === "pending" ? "Nenhuma venda aguardando avaliação" : "Nenhuma venda encontrada"} description="Os fechamentos registrados no CRM e nas visitas aparecerão aqui para avaliar a instalação." icon="trend" />}
      </div>}
      {view === "team" && <InstallerManager data={data} save={save} />}
      {view === "history" && <ServiceHistory data={data} />}
    </section>
    {editor && <ServiceForm key={editor.id || editor.saleId || "new"} initial={editor} data={data} save={save} actor={actor} onClose={() => setEditor(null)} onSaved={(record) => { setEditor(null); setDetailId(record.id); }} />}
    {selected && !editor && !action && <ServiceDetail item={selected} data={data} onClose={() => setDetailId(null)} onEdit={() => setEditor(structuredClone(selected))} onAction={(status) => setAction({ id: selected.id, status })} />}
    {action && <ServiceAction item={services.find((item) => item.id === action.id)} status={action.status} actor={actor} save={save} onClose={() => setAction(null)} />}
  </div>;
}

function InstallerManager({ data, save }) {
  const [draft, setDraft] = useState({ name: "" }), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await save((current) => saveInstaller(current, draft), "Profissional salvo.", { type: "installer", draft }); setDraft({ name: "" }); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  };
  const remove = async (row) => {
    if (!window.confirm(`Excluir ${row.name} da equipe de execução? Os serviços anteriores serão preservados.`)) return;
    setError(""); setBusy(true);
    try {
      await save((current) => deleteInstaller(current, row.id), "Profissional excluído.", { type: "deleteInstaller", id: row.id });
      if (draft.id === row.id) setDraft({ name: "" });
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  };
  return <section className="services-team"><div className="panel-heading"><div><h2>Equipe de execução</h2><p>Cadastre os profissionais que fazem os serviços. Esse cadastro não cria acesso ao sistema.</p></div><Icon name="users" /></div>
    <form className="service-installer-form" onSubmit={submit}><Field label="Nome do profissional" value={draft.name} maxLength={180} required onChange={(event) => setDraft({ ...draft, name: event.target.value })} /><button className="button primary" disabled={busy}>{draft.id ? "Salvar profissional" : "Cadastrar profissional"}</button>{draft.id && <button type="button" className="button secondary" onClick={() => setDraft({ name: "" })}>Cancelar edição</button>}</form>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="services-team-list">{(data.installers || []).filter((row) => !row.deleted).map((row) => <article key={row.id}><span className="avatar">{row.name.slice(0, 2).toUpperCase()}</span><strong>{row.name}<small>{row.inactive ? "Inativo" : "Disponível para agendamento"}</small></strong><button className="button secondary" disabled={busy} onClick={() => setDraft({ ...row })}>Editar</button><button className="button text-button" disabled={busy} onClick={() => remove(row)}>Excluir</button></article>)}</div>
    {!data.installers?.some((row) => !row.deleted) && <Empty title="Quem vai executar os serviços?" description="Cadastre a equipe para começar a distribuir os agendamentos." icon="users" />}
  </section>;
}

function ServiceForm({ initial, data, save, actor, onClose, onSaved }) {
  const cameraRef = useRef(null);
  const [form, setForm] = useState(() => serviceFormDraft(initial));
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [photoBusy, setPhotoBusy] = useState(false);
  const [installerName, setInstallerName] = useState("");
  const sales = serviceSales(data), selectedSale = sales.find((row) => row.id === form.saleId);
  const planned = form.appointments.filter((item) => item.state === "planned");
  const historical = form.appointments.filter((item) => item.state !== "planned");
  const update = (patch) => setForm((current) => ({ ...current, ...patch }));
  const change = (key) => (event) => update({ [key]: event.target.value });
  const close = () => { if (!busy && !photoBusy && (JSON.stringify(form) === JSON.stringify(serviceFormDraft(initial)) || window.confirm("Descartar as alterações deste serviço ainda não salvas?"))) onClose(); };
  const appointment = (id, patch) => update({ appointments: form.appointments.map((row) => row.id === id ? { ...row, ...patch } : row) });
  const upload = async (event) => {
    const files = [...event.target.files]; event.target.value = ""; setError("");
    if (form.photos.length + files.length > 6) return setError("Adicione no máximo seis fotos por serviço.");
    setPhotoBusy(true);
    try { const photos = await Promise.all(files.map(preparePhoto)); setForm((current) => ({ ...current, photos: [...current.photos, ...photos] })); }
    catch (cause) { setError(cause.message); } finally { setPhotoBusy(false); }
  };
  const addInstaller = async () => {
    setError("");
    try { await save((current) => saveInstaller(current, { name: installerName }), "Profissional cadastrado.", { type: "installer", draft: { name: installerName } }); setInstallerName(""); }
    catch (cause) { setError(cause.message); }
  };
  const submit = async (event) => {
    event.preventDefault(); setError(""); setBusy(true);
    try { const next = await save((current) => saveService(current, form, actor), "Serviço salvo na agenda.", { type: "save", draft: form }); onSaved(next.services.find((row) => row.id === form.id) || next.services.at(-1)); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  };
  const productOptions = [...new Set([...(selectedSale?.products || catalogProducts(data).map((row) => row.name)), ...form.products])];
  return <Modal title={form.id ? `Editar ${serviceCode(form.number)}` : "Novo serviço"} onClose={close} wide><form className="service-form" onSubmit={submit}>
    <section><h3>Cliente e serviço</h3>
      <Select label="Venda de origem (opcional)" value={form.saleId} disabled={!!form.id} onChange={(id) => { if (form.name && !window.confirm("Trocar a origem e preencher os dados da venda selecionada?")) return; const sale = sales.find((row) => row.id === id); setForm(serviceFormDraft(sale ? saleServiceDraft(sale) : newService())); }}><option value="">Serviço direto / venda anterior</option>{sales.map((sale) => <option key={sale.id} value={sale.id}>{sale.work.name} · {dateLabel(sale.date)} · {sale.products.join(", ")}</option>)}</Select>
      {selectedSale && <p className="service-linked-sale"><Icon name="check" size={16} />Vinculado à venda de {dateLabel(selectedSale.date)} · {person(selectedSale.sellerTeamId)}. Este serviço não cria uma nova venda.</p>}
      {!form.saleId && !form.id && data.works.length > 0 && <Select label="Preencher com uma obra cadastrada" value={form.workId || ""} onChange={(id) => { const work = data.works.find((row) => row.id === id); if (work) update({ workId: id, name: work.name, address: addressLabel(work), ...Object.fromEntries(["cep", "street", "complement", "state"].map((key) => [key, work[key] || ""])), addressNumber: work.number || "", neighborhood: work.neighborhood, city: work.city, contact: work.responsible || "", phone: work.phone || "" }); }}><option value="">Escolha uma obra ou preencha abaixo</option>{data.works.filter((row) => !row.deleted).map((row) => <option value={row.id} key={row.id}>{row.name} · {row.neighborhood}</option>)}</Select>}
      <div className="fields two"><Field label="Cliente / obra" value={form.name} onChange={change("name")} maxLength={400} required /><Select label="Tipo do serviço" value={form.type} onChange={(type) => update({ type })}>{SERVICE_TYPES.map((type) => <option key={type}>{type}</option>)}</Select></div>
      <Field label="Serviço a executar" value={form.description} onChange={change("description")} maxLength={4000} placeholder="Ex.: instalar forro na sala e no corredor" required />
      <AddressFields value={{ ...form, number: form.addressNumber || "" }} requireState={false} onChange={({ number: addressNumber, ...next }) => update({ ...next, addressNumber, address: [next.street, addressNumber, next.complement].filter(Boolean).join(", ") })} />
      <div className="fields two"><Field label="Contato na obra" value={form.contact} onChange={change("contact")} maxLength={400} /><Field label="Telefone do contato" value={form.phone} onChange={change("phone")} type="tel" maxLength={25} /></div>
      <fieldset className="service-product-options"><legend>Produtos envolvidos</legend>{productOptions.map((name) => <label key={name}><input type="checkbox" checked={form.products.includes(name)} onChange={(event) => update({ products: event.target.checked ? [...form.products, name] : form.products.filter((row) => row !== name) })} />{name}</label>)}</fieldset>
    </section>
    <section><div className="service-form-heading"><div><h3>Agenda e equipe</h3><p>O serviço pode ter vários dias e mais de um profissional.</p></div><button type="button" className="button secondary" onClick={() => update({ appointments: [...form.appointments, newAppointment(today())] })}><Icon name="plus" size={16} />Adicionar agendamento</button></div>
      {!planned.length && <p className="inline-note">Sem data definida, o serviço ficará aguardando agendamento.</p>}
      {planned.map((item, index) => <fieldset className="service-appointment-form" key={item.id}><legend>Agendamento {index + 1}</legend>
        <div className="fields two"><ServiceDateField label="Data inicial" value={item.date} required onChange={(next) => appointment(item.id, { date: next, endDate: item.endDate < next ? next : item.endDate })} /><ServiceDateField label="Data final" value={item.endDate} min={item.date} required onChange={(next) => appointment(item.id, { endDate: next })} /></div>
        <Select label="Período do serviço" value={item.period} onChange={(period) => appointment(item.id, { period })}>{Object.entries(SERVICE_PERIODS).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</Select>
        {item.period === "custom" && <div className="fields two"><Field label="Horário inicial" type="time" required value={item.startTime} onChange={(event) => appointment(item.id, { startTime: event.target.value })} /><Field label="Horário final" type="time" required value={item.endTime} onChange={(event) => appointment(item.id, { endTime: event.target.value })} /></div>}
        <span className="service-crew-label">Profissionais deste agendamento</span><div className="service-crew-options">{(data.installers || []).filter((row) => !row.deleted && (!row.inactive || item.installerIds.includes(row.id))).map((row) => <label key={row.id}><input type="checkbox" checked={item.installerIds.includes(row.id)} onChange={(event) => appointment(item.id, { installerIds: event.target.checked ? [...item.installerIds, row.id] : item.installerIds.filter((id) => id !== row.id) })} />{row.name}</label>)}{!data.installers?.some((row) => !row.inactive && !row.deleted) && <p className="muted">Cadastre um profissional abaixo para montar a equipe.</p>}</div>
        <button type="button" className="button text-button" onClick={() => update({ appointments: form.appointments.filter((row) => row.id !== item.id) })}><Icon name="trash" size={15} />Remover agendamento</button>
      </fieldset>)}
      <div className="service-inline-installer"><Field label="Novo profissional da equipe" value={installerName} onChange={(event) => setInstallerName(event.target.value)} placeholder="Nome do instalador" maxLength={180} /><button type="button" className="button secondary" onClick={addInstaller} disabled={!installerName.trim()}>Cadastrar profissional</button></div>
      {!!historical.length && <details><summary>Agendamentos anteriores ({historical.length})</summary>{historical.map((item) => <p key={item.id}>{dateRange(item)} · {periodLabel(item)} · {crew(item, data)} · {item.state === "completed" ? "Realizado" : "Cancelado"}</p>)}</details>}
    </section>
    <section><h3>Orientações e fotos</h3><Field label="Observações para a execução"><textarea value={form.notes} onChange={change("notes")} maxLength={4000} rows={3} placeholder="Acesso à obra, cuidados, materiais e pendências…" /></Field>
      <button type="button" className="button secondary" disabled={photoBusy} onClick={() => cameraRef.current.click()}><Icon name="camera" size={17} />Tirar foto</button><input hidden ref={cameraRef} aria-label="Fotografar serviço" type="file" accept="image/*" capture="environment" onChange={upload} />
      <label className="service-upload-label"><Icon name="camera" size={18} />{photoBusy ? "Preparando fotos…" : "Adicionar fotos da galeria"}<input aria-label="Fotos do serviço" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={upload} disabled={photoBusy} /></label><small className="muted">Até 6 fotos · JPG, PNG ou WebP · 12 MB por arquivo.</small>
      <div className="service-photo-grid">{form.photos.map((photo) => <figure key={photo.id}>{photo.key ? <VisitPhoto photo={photo} alt={photo.name} /> : <img src={photo.url} alt={photo.name} />}<button type="button" className="icon-button" aria-label={`Remover foto ${photo.name}`} onClick={() => update({ photos: form.photos.filter((row) => row.id !== photo.id) })}><Icon name="close" size={17} /></button></figure>)}</div>
    </section>
    {error && <p className="error" role="alert">{error}</p>}
    <footer className="modal-actions"><button type="button" className="button secondary" disabled={busy || photoBusy} onClick={close}>Cancelar</button><button className="button primary" disabled={busy || photoBusy}>{busy ? "Salvando…" : "Salvar serviço"}</button></footer>
  </form></Modal>;
}

function ServiceDetail({ item, data, onClose, onEdit, onAction }) {
  const sale = serviceSales(data).find((row) => row.id === item.saleId);
  return <Modal title={`${serviceCode(item.number)} · ${item.name}`} onClose={onClose} wide>
    <div className="service-detail-heading"><Badge tone={statusTone(item.status)}>{SERVICE_STATUSES[item.status]}</Badge><span>{item.type}</span></div>
    <h3>{item.description}</h3><p>{item.address}</p><p>{item.neighborhood} · {item.city}</p>
    {item.cep && <p>CEP: {item.cep}{item.state ? ` · ${item.state}` : ""}</p>}
    {item.contact && <p>Contato: <strong>{item.contact}</strong>{item.phone && <> · <a href={`tel:${item.phone.replace(/\D/g, "")}`}>{item.phone}</a></>}</p>}
    {item.saleId && <p className="service-linked-sale"><Icon name="check" size={16} />Venda vinculada de {sale ? dateLabel(sale.date) : "histórico preservado"}{sale ? ` · ${person(sale.sellerTeamId)}` : ""}</p>}
    <div className="tag-list">{item.products.map((name) => <Badge key={name}>{name}</Badge>)}</div>
    <div className="service-detail-actions">{active(item) && <button className="button secondary" onClick={onEdit}><Icon name="edit" size={16} />Editar / agendar</button>}{item.status === "scheduled" && <button className="button primary" onClick={() => onAction("in_progress")}>Iniciar execução</button>}{["scheduled", "in_progress", "return_required"].includes(item.status) && <button className="button secondary" onClick={() => onAction("completed")}>Concluir serviço</button>}{["scheduled", "in_progress", "completed"].includes(item.status) && <button className="button secondary" onClick={() => onAction("return_required")}>Registrar retorno</button>}{active(item) && <button className="button secondary" onClick={() => onAction("cancelled")}>Cancelar serviço</button>}{item.status === "cancelled" && <button className="button secondary" onClick={() => onAction("waiting")}>Reabrir serviço</button>}</div>
    <section className="service-detail-section"><h3>Agendamentos</h3>{item.appointments.length ? item.appointments.map((appt) => <article className="service-detail-appointment" key={appt.id}><Icon name="calendar" size={19} /><div><strong>{dateRange(appt)}</strong><p>{periodLabel(appt)}</p><small>{crew(appt, data)}</small></div><Badge tone={appt.state === "completed" ? "success" : appt.state === "cancelled" ? "red" : "blue"}>{appt.state === "completed" ? "Realizado" : appt.state === "cancelled" ? "Cancelado" : "Previsto"}</Badge></article>) : <p className="muted">Data e equipe ainda não definidas.</p>}</section>
    {item.notes && <section className="service-detail-section"><h3>Orientações e observações</h3><p className="pre-line">{item.notes}</p></section>}
    {!!item.photos.length && <section className="service-detail-section"><h3>Fotos do serviço</h3><div className="detail-photos">{item.photos.map((photo) => <VisitPhoto key={photo.id} photo={photo} alt={photo.name} />)}</div></section>}
    <section className="service-detail-section"><h3>Histórico do serviço</h3><ol className="service-history">{[...item.history].reverse().map((entry) => <li key={entry.id}><strong>{entry.note}</strong><small>{entry.actor} · {new Date(entry.at).toLocaleString("pt-BR")}</small></li>)}</ol></section>
  </Modal>;
}
function ServiceAction({ item, status, actor, save, onClose }) {
  const [reason, setReason] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const reasonRequired = ["return_required", "cancelled"].includes(status);
  const title = { completed: "Concluir serviço", in_progress: "Iniciar execução", return_required: "Registrar retorno", cancelled: "Cancelar serviço", waiting: "Reabrir serviço" }[status];
  const submit = async (event) => {
    event.preventDefault(); setError(""); setBusy(true);
    try { await save((current) => changeServiceStatus(current, item.id, status, reason, actor), "Situação do serviço atualizada.", { type: "status", id: item.id, status, reason }); onClose(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  };
  return <Modal title={title} onClose={() => !busy && onClose()}><form onSubmit={submit}><p>{serviceCode(item.number)} · <strong>{item.name}</strong></p>{status === "return_required" && <p>O retorno fica pendente de novo agendamento. As etapas anteriores permanecem no histórico.</p>}
    <Field label={reasonRequired ? "Motivo / pendência" : "Observação da execução"}><textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} required={reasonRequired} maxLength={2000} /></Field>{error && <p className="error" role="alert">{error}</p>}
    <footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Voltar</button><button className="button primary" disabled={busy}>{busy ? "Salvando…" : title}</button></footer>
  </form></Modal>;
}

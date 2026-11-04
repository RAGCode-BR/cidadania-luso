import React, { useEffect, useState } from "react";
import { dateLabel, normalize } from "../lib/domain.mjs";
import { HISTORY_STATUSES, parseHistoricalEntry } from "../lib/service-history.mjs";
import { Badge, Empty, Field, Icon, Modal, Select } from "./ui.jsx";
import Pagination from "./Pagination.jsx";
import ServiceDateField from "./ServiceDateField.jsx";

export default function ServiceHistory({ data }) {
  // Campos de apresentação são derivados do texto original, que permanece intacto.
  const records = (data.serviceHistory || []).map((row) => ({ ...row, ...parseHistoricalEntry(row) }));
  const imports = data.serviceHistoryImports || [];
  const [query, setQuery] = useState(""), [sheet, setSheet] = useState(""), [kind, setKind] = useState("");
  const [status, setStatus] = useState(""), [professional, setProfessional] = useState("");
  const [start, setStart] = useState(""), [end, setEnd] = useState("");
  const [page, setPage] = useState(1), [selected, setSelected] = useState(null);
  useEffect(() => setPage(1), [query, sheet, kind, status, professional, start, end]);
  const filtered = records.filter((row) => (!sheet || row.sheet === sheet) && (!kind || row.kind === kind) &&
    (!status || row.status === status) && (!professional || row.professionals.includes(professional)) &&
    (!start || row.date >= start) && (!end || row.date <= end) &&
    normalize(`${row.name} ${row.description} ${row.crewText} ${row.raw} ${row.sheet} ${row.cell}`).includes(normalize(query)))
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 12)));
  const professionals = [...new Set(records.flatMap((row) => row.professionals))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const sheets = [...new Set(records.map((row) => row.sheet))];
  const reset = () => { setQuery(""); setSheet(""); setKind(""); setStatus(""); setProfessional(""); setStart(""); setEnd(""); };
  return <section className="service-history-page">
    <div className="panel-heading"><div><h2>Histórico da agenda de serviços</h2><p>Lançamentos históricos, preservados por data. Repetições em dias diferentes continuam como lançamentos distintos.</p></div><Icon name="calendar" /></div>
    {!!imports.length && <div className="service-history-summary">
      <strong>{records.length.toLocaleString("pt-BR")} lançamentos importados</strong>
      <div className="tag-list"><Badge>{records.filter((row) => row.kind === "service").length.toLocaleString("pt-BR")} lançamentos de serviço</Badge><Badge>{records.filter((row) => row.kind === "note").length.toLocaleString("pt-BR")} observações</Badge><Badge tone="blue">Julho fora da importação</Badge></div>
      <p>As situações correspondem aos registros históricos e podem não refletir o andamento atual. Este histórico não cria vendas nem ocupa a agenda da equipe.</p>
      {imports.some((item) => item.removedTestCount === 1) && <small><Icon name="check" size={14} />O teste SV-0001 foi excluído desta prévia antes da importação.</small>}
    </div>}
    <div className="service-history-filters">
      <Field label="Buscar no histórico" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cliente, serviço, profissional ou texto original…" />
      <Select label="Aba de origem" value={sheet} onChange={setSheet}><option value="">Todas as abas importadas</option>{sheets.map((name) => <option key={name}>{name}</option>)}</Select>
      <Select label="Tipo de lançamento" value={kind} onChange={setKind}><option value="">Serviços e observações</option><option value="service">Serviços</option><option value="note">Observações da agenda</option></Select>
      <Select label="Situação" value={status} onChange={setStatus}><option value="">Todas as situações</option>{Object.entries(HISTORY_STATUSES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select>
      <Select label="Profissional no histórico" value={professional} onChange={setProfessional}><option value="">Todos os profissionais</option>{professionals.map((name) => <option key={name}>{name}</option>)}</Select>
      <ServiceDateField label="Histórico de" value={start} onChange={setStart} />
      <ServiceDateField label="Histórico até" value={end} onChange={setEnd} min={start} />
    </div>
    <div className="service-history-toolbar"><button className="button text-button" onClick={reset}>Limpar filtros</button></div>
    <p className="service-history-total">{filtered.length.toLocaleString("pt-BR")} lançamentos encontrados</p>
    {filtered.length ? <><div className="table-scroll"><table className="service-history-table"><thead><tr><th>Data / origem</th><th>Cliente / lançamento</th><th>Serviço / equipe</th><th>Situação</th><th>Ações</th></tr></thead><tbody>
      {filtered.slice((currentPage - 1) * 12, currentPage * 12).map((row) => <tr key={row.id}>
        <td>{dateLabel(row.date)}<small>{row.sheet} · {row.cell}</small></td>
        <td><button className="table-link" onClick={() => setSelected(row)}>{row.name}</button><small>{row.kind === "note" ? "Observação da agenda" : "Serviço histórico"}</small></td>
        <td><span className="service-history-description" title={row.description}>{row.description}</span><small>{row.crewText || "Equipe não identificada no lançamento"}</small></td>
        <td>{row.kind === "service" ? <Badge tone={row.status === "completed" ? "success" : row.status === "unknown" ? "" : "blue"}>{HISTORY_STATUSES[row.status]}</Badge> : "Observação"}{row.needsReview && <small>Conferir dados incompletos</small>}</td>
        <td><button className="button secondary" onClick={() => setSelected(row)} aria-label={`Ver lançamento ${row.sheet} ${row.cell}`}>Ver original</button></td>
      </tr>)}
    </tbody></table></div><Pagination page={currentPage} totalItems={filtered.length} pageSize={12} onChange={setPage} itemLabel="lançamentos históricos" /></> : <Empty title={records.length ? "Nenhum lançamento corresponde aos filtros" : "Nenhum histórico importado"} description={records.length ? "Experimente outra data, profissional ou palavra." : "Nenhum histórico foi incluído neste projeto."} icon="calendar" />}
    {selected && <Modal title={selected.name} onClose={() => setSelected(null)} wide>
      <div className="service-detail-heading"><Badge>{selected.kind === "service" ? "Serviço histórico" : "Observação da agenda"}</Badge><span>{dateLabel(selected.date)}</span></div>
      <dl className="detail-grid"><div><dt>Origem</dt><dd>{imports.find((item) => item.id.includes("services-history"))?.sourceFile || "Agenda de serviços 2026"}<small>{selected.sheet} · célula {selected.cell}</small></dd></div><div><dt>Situação</dt><dd>{HISTORY_STATUSES[selected.status]}</dd></div><div><dt>Equipe no lançamento</dt><dd>{selected.crewText || "Não identificada"}</dd></div><div><dt>Data</dt><dd>{dateLabel(selected.date)}</dd></div></dl>
      <h3 className="detail-heading">Texto original preservado</h3><p className="service-history-original">{selected.raw}</p>
      {selected.needsReview && <p className="inline-note">Este lançamento tem equipe incompleta ou situação não definida. O texto original foi mantido para conferência.</p>}
      <p className="muted">Este registro histórico não contém endereço, CEP, valores ou vínculo com vendas.</p>
      <footer className="modal-actions"><button className="button secondary" onClick={() => setSelected(null)}>Fechar original</button></footer>
    </Modal>}
  </section>;
}

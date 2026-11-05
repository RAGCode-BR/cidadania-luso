import React, { useMemo, useState } from "react";
import { TEAM, dateLabel } from "../lib/domain.mjs";
import { PERIODS, buildReport } from "../lib/reports.mjs";
import { Icon, PageHeader } from "./ui.jsx";
import "../reports.css";

// Cores validadas com o validador da skill de dataviz (fundo branco):
// barra única #00804a; funil = escala ordinal de um só verde, do claro ao escuro.
const FUNNEL_RAMP = ["#79c09a", "#52a87e", "#2c8f63", "#13764c", "#0a5e3b", "#064730"];
const funnelColor = (index, total) =>
  total > FUNNEL_RAMP.length ? "#00804a" : FUNNEL_RAMP[Math.round((index * (FUNNEL_RAMP.length - 1)) / Math.max(1, total - 1))];

const currency = (value, cents = false) => new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL", maximumFractionDigits: cents ? 2 : 0, minimumFractionDigits: cents ? 2 : 0,
}).format(value || 0);
const percent = (value) => value == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 }).format(value);
const count = (value) => new Intl.NumberFormat("pt-BR").format(value || 0);

export default function Reports({ data, actorId }) {
  const [period, setPeriod] = useState("month");
  const [owner, setOwner] = useState("");
  const report = useMemo(() => buildReport(data, { period, owner }), [data, period, owner]);
  const { kpis, range } = report;
  const rangeText = period === "all" ? "Todo o histórico registrado no sistema."
    : `De ${dateLabel(range.start)} a ${dateLabel(range.end)}, comparado com ${report.comparison}.`;
  return <div className="reports-page">
    <PageHeader title="Relatórios" note="Vendas, funil e desempenho da equipe. Os números consideram só cartões que não foram excluídos." />
    <div className="report-filters">
      <div className="report-periods" role="radiogroup" aria-label="Período">
        {Object.entries(PERIODS).map(([id, label]) => <button key={id} type="button" role="radio" aria-checked={period === id} onClick={() => setPeriod(id)}>{label}</button>)}
      </div>
      {TEAM.length > 1 && <label className="report-owner">
        <span>Usuário</span>
        <select value={owner} onChange={(event) => setOwner(event.target.value)}>
          <option value="">Toda a equipe</option>
          {TEAM.map((item) => <option key={item.id} value={item.id}>{item.id === actorId ? `${item.name} (você)` : item.name}</option>)}
        </select>
      </label>}
    </div>
    <p className="report-range">{rangeText}</p>

    <section className="report-kpis" aria-label="Indicadores principais">
      <article className="report-tile hero">
        <h2>Total vendido</h2>
        <p className="report-value">{currency(kpis.total.value)}</p>
        <Delta value={kpis.total.delta} period={report.comparison} />
      </article>
      <article className="report-tile">
        <h2>Vendas</h2>
        <p className="report-value">{count(kpis.count.value)}</p>
        <Delta value={kpis.count.delta} period={report.comparison} />
      </article>
      <article className="report-tile">
        <h2>Ticket médio</h2>
        <p className="report-value">{kpis.ticket.value == null ? "—" : currency(kpis.ticket.value)}</p>
        <Delta value={kpis.ticket.delta} period={report.comparison} />
      </article>
      <article className="report-tile">
        <h2>Taxa de conversão</h2>
        <p className="report-value">{percent(kpis.conversion.value)}</p>
        <p className="report-note">{kpis.conversion.won + kpis.conversion.lost === 0 ? "Nenhuma negociação encerrada" : `${kpis.conversion.won} com venda de ${kpis.conversion.won + kpis.conversion.lost} encerradas`}</p>
        <Delta value={kpis.conversion.delta} period={report.comparison} points />
      </article>
      <article className="report-tile">
        <h2>Novas oportunidades</h2>
        <p className="report-value">{count(kpis.created.value)}</p>
        <Delta value={kpis.created.delta} period={report.comparison} />
      </article>
    </section>

    <div className="report-grid">
      <section className="report-card" aria-labelledby="report-products">
        <header><h2 id="report-products">Vendas por produto</h2><p>Quantas vendas do período incluíram cada produto.</p></header>
        {report.products.length
          ? <BarList label="Vendas por produto" rows={report.products.map((row) => ({ key: row.name, label: row.name, value: row.count, color: "#00804a" }))}
              total={kpis.count.value} unit={(n) => (n === 1 ? "1 venda" : `${count(n)} vendas`)} shareLabel="das vendas" />
          : <p className="report-empty">Nenhuma venda no período.</p>}
      </section>
      <section className="report-card" aria-labelledby="report-funnel">
        <header><h2 id="report-funnel">Funil agora</h2><p>Cartões em andamento em cada etapa, hoje.</p></header>
        {report.funnel.some((row) => row.count)
          ? <BarList label="Cartões por etapa" rows={report.funnel.map((row, index) => ({ key: row.id, label: row.label, value: row.count, color: funnelColor(index, report.funnel.length) }))}
              total={report.funnel.reduce((sum, row) => sum + row.count, 0)} unit={(n) => (n === 1 ? "1 cartão" : `${count(n)} cartões`)} shareLabel="dos cartões em andamento" keepOrder />
          : <p className="report-empty">Nenhum cartão em andamento.</p>}
      </section>
    </div>

    <section className="report-card" aria-labelledby="report-lost">
      <header><h2 id="report-lost">Motivos de “Sem negócio”</h2><p>Negociações encerradas sem venda no período, da mais recente para a mais antiga.</p></header>
      {report.lostReasons.length ? <ul className="report-reasons">
        {report.lostReasons.slice(0, 8).map((row) => <li key={row.id}>
          <p>{row.note || "Motivo não informado."}</p>
          <small>{row.client}, por {row.by} em {dateLabel(row.day)}</small>
        </li>)}
      </ul> : <p className="report-empty">Nenhuma negociação encerrada sem venda no período.</p>}
      {report.lostReasons.length > 8 && <p className="report-more">Mostrando 8 de {report.lostReasons.length}. Veja todas na aba Encerradas do CRM.</p>}
    </section>

    <section className="report-card" aria-labelledby="report-team">
      <header><h2 id="report-team">Desempenho por usuário</h2><p>Vendas, conversão e atendimentos no período; cartões em andamento e retornos em atraso, hoje.</p></header>
      <div className="report-table-scroll">
        <table className="report-table">
          <thead><tr>
            <th scope="col">Usuário</th><th scope="col">Vendido</th><th scope="col">Vendas</th><th scope="col">Ticket médio</th>
            <th scope="col">Conversão</th><th scope="col">Em andamento</th><th scope="col">Atendimentos</th><th scope="col">Retornos em atraso</th>
          </tr></thead>
          <tbody>
            {report.team.map((row) => <tr key={row.id} className={owner && row.id === owner ? "is-selected" : ""}>
              <th scope="row">{row.id === actorId ? `${row.name} (você)` : row.name}</th>
              <td>{currency(row.total, true)}</td>
              <td>{count(row.count)}</td>
              <td>{row.ticket == null ? "—" : currency(row.ticket, true)}</td>
              <td>{percent(row.conversion)}{row.closed ? <small> de {row.closed}</small> : null}</td>
              <td>{count(row.active)}</td>
              <td>{count(row.attendances)}</td>
              <td className={row.overdue ? "is-late" : ""}>{count(row.overdue)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}

// Variação contra o período anterior: seta + texto, nunca só a cor.
function Delta({ value, period, points = false }) {
  if (value == null) return <p className="report-delta neutral">{period ? "Sem dados para comparar" : "Sem comparação"}</p>;
  const shown = Math.round(value * 100);
  if (shown === 0) return <p className="report-delta neutral">Sem variação vs {period}</p>;
  const up = shown > 0;
  return <p className={`report-delta ${up ? "up" : "down"}`}>
    <Icon name={up ? "move-up" : "move-down"} size={15} />
    <span>{up ? "+" : "−"}{Math.abs(shown)}{points ? " p.p." : "%"} <span className="report-delta-context">vs {period}</span></span>
  </p>;
}

// Barras horizontais: uma série, base comum, valor na ponta. Cada linha recebe
// foco e mostra o detalhe ao passar o mouse; o texto da linha já traz o valor.
function BarList({ label, rows, total, unit, shareLabel, keepOrder = false }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  const list = keepOrder ? rows : [...rows].sort((a, b) => b.value - a.value);
  return <ul className="report-bars" aria-label={label}>
    {list.map((row) => {
      const share = total ? row.value / total : 0;
      return <li key={row.key} tabIndex={0} aria-label={`${row.label}: ${unit(row.value)}, ${percent(share)} ${shareLabel}`}>
        <span className="report-bar-label">{row.label}</span>
        <span className="report-bar-track">
          <span className="report-bar-area"><span className="report-bar" style={{ width: `${Math.max(2, (row.value / max) * 100)}%`, background: row.value ? row.color : "transparent" }} /></span>
          <span className="report-bar-value">{count(row.value)}</span>
        </span>
        <span className="report-tooltip" role="presentation"><strong>{unit(row.value)}</strong> {percent(share)} {shareLabel}</span>
      </li>;
    })}
  </ul>;
}

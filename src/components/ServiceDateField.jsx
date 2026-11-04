import React, { useEffect, useId, useRef, useState } from "react";
import { today } from "../lib/domain.mjs";
import { formatServiceDate, parseServiceDate } from "../lib/services.mjs";
import { Icon } from "./ui.jsx";

// A apresentação é sempre brasileira; o estado do serviço continua usando ISO.
export default function ServiceDateField({ label, value, onChange, required = false, min = "" }) {
  const id = useId(), popupId = useId();
  const inputRef = useRef(null), popupRef = useRef(null);
  const [text, setText] = useState(() => formatServiceDate(value));
  const [month, setMonth] = useState((value || today()).slice(0, 7));
  const [open, setOpen] = useState(false);
  useEffect(() => { setText(formatServiceDate(value)); }, [value]);
  useEffect(() => {
    inputRef.current?.setCustomValidity(text && (!parseServiceDate(text) || (min && parseServiceDate(text) < min))
      ? min && parseServiceDate(text) && parseServiceDate(text) < min ? `Escolha uma data a partir de ${formatServiceDate(min)}.` : "Informe uma data válida no formato dia/mês/ano." : "");
  }, [text, min]);
  useEffect(() => {
    if (!open) return;
    const closeOnScroll = (event) => { if (!popupRef.current?.contains(event.target)) popupRef.current?.hidePopover(); };
    window.addEventListener("resize", closeOnScroll);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => { window.removeEventListener("resize", closeOnScroll); window.removeEventListener("scroll", closeOnScroll, true); };
  }, [open]);
  const show = () => {
    const popup = popupRef.current;
    if (open) return popup.hidePopover();
    setMonth((value || today()).slice(0, 7));
    const box = inputRef.current.getBoundingClientRect(), width = Math.min(292, window.innerWidth - 24), height = 350;
    popup.style.left = `${Math.max(12, Math.min(box.left, window.innerWidth - width - 12))}px`;
    popup.style.width = `${width}px`;
    popup.style.top = `${box.bottom + height < window.innerHeight ? box.bottom + 7 : Math.max(12, box.top - height - 7)}px`;
    popup.showPopover();
  };
  const pick = (iso) => {
    onChange(iso); setText(formatServiceDate(iso)); inputRef.current.setCustomValidity("");
    popupRef.current.hidePopover(); inputRef.current.focus();
  };
  const change = (event) => {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 8);
    const formatted = digits.length > 4 ? `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}` : digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
    setText(formatted);
    const iso = parseServiceDate(formatted);
    if (iso || !formatted) onChange(iso);
  };
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1));
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const offset = (firstDay.getUTCDay() + 6) % 7;
  const changeMonth = (delta) => setMonth(new Date(Date.UTC(year, monthNumber - 1 + delta, 1)).toISOString().slice(0, 7));
  return <div className="field service-date-field">
    <label htmlFor={id}>{label}{required && <span className="required"> *</span>}</label>
    <div className="service-date-input"><input id={id} ref={inputRef} type="text" inputMode="numeric" placeholder="dd/mm/aaaa" value={text} onChange={change} required={required} maxLength={10}
      onBlur={() => { if (!text && !required) setText(formatServiceDate(value)); }}
      onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); show(); } }} />
      <button type="button" className="icon-button" aria-label={`Abrir calendário: ${label}`} aria-expanded={open} aria-controls={popupId} onClick={show}><Icon name="calendar" size={18} /></button>
    </div>
    <div id={popupId} ref={popupRef} popover="auto" className="service-date-popover" role="group" aria-label={`Calendário: ${label}`} lang="pt-BR" onToggle={(event) => setOpen(event.newState === "open")}>
      <header><button type="button" className="icon-button" aria-label="Mês anterior" onClick={() => changeMonth(-1)}>‹</button><strong aria-live="polite">{firstDay.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })}</strong><button type="button" className="icon-button" aria-label="Próximo mês" onClick={() => changeMonth(1)}>›</button></header>
      <div className="service-date-weekdays">{["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="service-date-days">{Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} />)}{Array.from({ length: count }, (_, index) => {
        const iso = `${month}-${String(index + 1).padStart(2, "0")}`;
        return <button type="button" key={iso} aria-label={`Escolher ${formatServiceDate(iso)}`} aria-pressed={iso === value} aria-current={iso === today() ? "date" : undefined} disabled={!!min && iso < min} onClick={() => pick(iso)}>{index + 1}</button>;
      })}</div>
      <footer><span>dia / mês / ano</span><button type="button" className="button text-button" disabled={!!min && today() < min} onClick={() => pick(today())}>Hoje</button></footer>
    </div>
  </div>;
}

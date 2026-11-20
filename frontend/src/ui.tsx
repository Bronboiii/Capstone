import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ESTADOS } from "./api";

/* ---------- Avisos ---------- */
const ToastCtx = createContext<(m: string, tipo?: "ok" | "error") => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; m: string; tipo: string }[]>([]);
  const push = useCallback((m: string, tipo: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random(); setItems((x) => [...x, { id, m, tipo }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4200);
  }, []);
  return <ToastCtx.Provider value={push}>{children}<div className="toasts" role="status">{items.map((i) => <div key={i.id} className={`toast toast-${i.tipo}`}>{i.m}</div>)}</div></ToastCtx.Provider>;
}

/* ---------- Carga de datos ---------- */
export function useData<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let vivo = true; setLoading(true);
    fn().then((d) => { if (vivo) { setData(d); setError(""); } }).catch((e) => vivo && setError(e.message)).finally(() => vivo && setLoading(false));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1), setData };
}

/* ---------- Componentes base ---------- */
export function Modal({ titulo, onClose, children, ancho = 560 }: { titulo: string; onClose(): void; children: ReactNode; ancho?: number }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: ancho }} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-cab"><h3>{titulo}</h3><button className="btn-icono" onClick={onClose} aria-label="Cerrar">×</button></div>
        <div className="modal-cuerpo">{children}</div>
      </div>
    </div>
  );
}
export const Campo = ({ label, children, ancho }: { label: string; children: ReactNode; ancho?: boolean }) => <label className={`campo${ancho ? " ancho" : ""}`}><span>{label}</span>{children}</label>;
export const Alerta = ({ children, tipo = "error" }: { children?: ReactNode; tipo?: "error" | "ok" | "info" }) => (children ? <div className={`alerta alerta-${tipo}`} role="alert">{children}</div> : null);
export const Insignia = ({ estado }: { estado: string }) => <span className={`insignia est-${estado}`}>{ESTADOS[estado] ?? estado}</span>;
export const Cargando = () => <div className="cargando">Cargando…</div>;
export const Vacio = ({ children }: { children: ReactNode }) => <p className="vacio">{children}</p>;
// Primera opción de un <select>: evita que una lista vacía parezca un error.
export const opcionInicial = (lista: unknown[] | null, vacio: string) => (lista === null ? "Cargando…" : lista.length ? "Seleccione…" : vacio);
export const SinOpciones = ({ children }: { children: ReactNode }) => <small className="sin-opciones">{children}</small>;

/* ---------- Clave con botón para mostrarla u ocultarla ---------- */
export function ClaveInput({ value, onChange, autoComplete, required, minLength, autoFocus }: { value: string; onChange(v: string): void; autoComplete?: string; required?: boolean; minLength?: number; autoFocus?: boolean }) {
  const [ver, setVer] = useState(false);
  return (
    <div className="clave">
      <input type={ver ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required={required} minLength={minLength} autoFocus={autoFocus} />
      {/* onMouseDown evita que el clic le quite el foco a la clave: así Enter sigue enviando el formulario */}
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setVer(!ver)} aria-label={ver ? "Ocultar clave" : "Mostrar clave"} title={ver ? "Ocultar clave" : "Mostrar clave"}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />{ver && <path d="M3 3l18 18" />}
        </svg>
      </button>
    </div>
  );
}

/* ---------- Monto en pesos: "$" fijo y puntos de miles; el valor guardado son solo dígitos ---------- */
export function MontoCLP({ value, onChange, required, etiqueta, ancho }: { value: string; onChange(v: string): void; required?: boolean; etiqueta?: string; ancho?: number }) {
  const d = String(value ?? "").replace(/\D/g, "");
  return (
    <div className="prefijo" style={ancho ? { width: ancho } : undefined}>
      <span aria-hidden="true">$</span>
      <input type="text" inputMode="numeric" aria-label={etiqueta} required={required} value={d ? Number(d).toLocaleString("es-CL") : ""}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 9))} />
    </div>
  );
}

/* ---------- Celular chileno: +56 fijo, se escriben solo los 9 dígitos ---------- */
const digitosCelular = (s: string) => { let d = s.replace(/\D/g, ""); if (d.length > 9 && d.startsWith("56")) d = d.slice(2); return d.slice(0, 9); };
const agrupar = (d: string) => [d.slice(0, 1), d.slice(1, 5), d.slice(5, 9)].filter(Boolean).join(" ");
export const celularValido = (v: string) => !v || /^\+56 9 \d{4} \d{4}$/.test(v);
export function CelularCL({ value, onChange }: { value: string; onChange(v: string): void }) {
  const d = digitosCelular(value);
  return (
    <div className="prefijo">
      <span aria-hidden="true">+56</span>
      <input type="tel" inputMode="numeric" autoComplete="tel-national" aria-label="Celular (9 dígitos, empieza con 9)" placeholder="9 1234 5678" value={agrupar(d)}
        onChange={(e) => { const n = digitosCelular(e.target.value); onChange(n ? `+56 ${agrupar(n)}` : ""); }} />
    </div>
  );
}
export function Pestanas({ items, activa, onChange }: { items: [string, string][]; activa: string; onChange(k: string): void }) {
  return <div className="pestanas" role="tablist">{items.map(([k, t]) => <button key={k} role="tab" aria-selected={activa === k} className={activa === k ? "activa" : ""} onClick={() => onChange(k)}>{t}</button>)}</div>;
}
export function Metrica({ titulo, valor, nota, tono }: { titulo: string; valor: ReactNode; nota?: string; tono?: "alerta" }) {
  return <div className={`metrica${tono ? " " + tono : ""}`}><h4>{titulo}</h4><p>{valor}</p>{nota && <small>{nota}</small>}</div>;
}

/* ---------- Firma digital (canvas táctil) ---------- */
export function Firma({ onChange }: { onChange(dataUrl: string | null): void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const estado = useRef({ dibujando: false, trazos: 0 });
  const pos = (e: React.PointerEvent) => { const c = ref.current!, r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }; };
  const ctx = () => { const c = ref.current!.getContext("2d")!; c.lineWidth = 2.4; c.lineCap = "round"; c.lineJoin = "round"; c.strokeStyle = "#2B2233"; return c; };
  const limpiar = () => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); estado.current.trazos = 0; onChange(null); };
  return (
    <div>
      <canvas ref={ref} width={640} height={200} className="firma" aria-label="Recuadro de firma"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); estado.current.dibujando = true; const p = pos(e), c = ctx(); c.beginPath(); c.moveTo(p.x, p.y); }}
        onPointerMove={(e) => { if (!estado.current.dibujando) return; const p = pos(e), c = ctx(); c.lineTo(p.x, p.y); c.stroke(); estado.current.trazos++; }}
        onPointerUp={() => { estado.current.dibujando = false; onChange(estado.current.trazos > 5 ? ref.current!.toDataURL("image/png") : null); }} />
      <button type="button" className="btn-sec chico" onClick={limpiar}>Limpiar firma</button>
    </div>
  );
}

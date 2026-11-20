import type { Request } from "express";
import { z, type ZodType } from "zod";
import type { Queryable } from "./db.js";
import { config } from "./config.js";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".") || "dato"}: ${i.message}`).join("; ");
    throw new HttpError(400, msg);
  }
  return r.data;
}

/* ---------- RUT chileno ---------- */
export const limpiarRut = (r: string) => r.replace(/[^0-9kK]/g, "").toUpperCase();
export function dvRut(cuerpo: string): string {
  let suma = 0, mult = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) { suma += Number(cuerpo[i]) * mult; mult = mult === 7 ? 2 : mult + 1; }
  const r = 11 - (suma % 11);
  return r === 11 ? "0" : r === 10 ? "K" : String(r);
}
export function validarRut(r: string): boolean {
  const c = limpiarRut(r);
  if (c.length < 8 || c.length > 9) return false;
  return dvRut(c.slice(0, -1)) === c.slice(-1);
}
export function formatearRut(r: string): string {
  const c = limpiarRut(r);
  return `${c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${c.slice(-1)}`;
}
export const rutSchema = z.string().refine(validarRut, "RUT inválido (revise el dígito verificador)").transform(formatearRut);

/* ---------- Fechas (zona horaria del centro) ---------- */
export const hoy = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone }).format(new Date());
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(fecha + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
export const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha debe ser AAAA-MM-DD");
export const horaSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "hora debe ser HH:MM");
export const mesSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "mes debe ser AAAA-MM");
export const minutos = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/* ---------- Horario de atención (configurable en Administración) ---------- */
// L-V: inicio a fin; sábado: inicio a fin_sabado ("cerrado" = no atiende); domingo cerrado salvo que se habilite.
export function horarioDelDia(aj: Record<string, string>, fecha: string): { desde: number; hasta: number } | null {
  const dow = new Date(fecha + "T12:00:00Z").getUTCDay();   // 0 = domingo, 6 = sábado
  const desde = minutos(aj.horario_inicio || "09:00");
  if (dow === 0 && aj.atiende_domingo !== "true") return null;
  if (dow === 6) { const f = aj.horario_fin_sabado || "14:00"; return f === "cerrado" ? null : { desde, hasta: minutos(f) }; }
  return { desde, hasta: minutos(aj.horario_fin || "20:00") };
}
export function validarHorario(aj: Record<string, string>, fecha: string, ini: number, fin: number) {
  const h = horarioDelDia(aj, fecha);
  if (!h) throw new HttpError(400, "El centro no atiende ese día", "DIA_CERRADO");
  if (ini < h.desde || fin > h.hasta) throw new HttpError(400, `La cita queda fuera del horario de atención (${hhmm(h.desde)} a ${hhmm(h.hasta)})`, "FUERA_DE_HORARIO");
}

/* ---------- Mensajería ---------- */
export function normalizarCelular(c?: string | null): string {
  const d = (c || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 9 && d.startsWith("9")) return "56" + d;
  return d;
}
// Celular chileno: acepta "912345678", "+56 9 1234 5678", "56912345678"…; se guarda como "+56 9 1234 5678".
export function formatearCelular(c: string): string | null {
  let d = c.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("56")) d = d.slice(2);
  if (d.length !== 9 || !d.startsWith("9")) return null;
  return `+56 ${d[0]} ${d.slice(1, 5)} ${d.slice(5)}`;
}
export const celularSchema = z.string().max(30).nullish().transform((c, ctx) => {
  if (!c || !c.trim()) return null;
  const f = formatearCelular(c);
  if (!f) { ctx.addIssue({ code: "custom", message: "celular chileno inválido (debe ser +56 9 y 8 dígitos)" }); return z.NEVER; }
  return f;
});
export function waLink(celular: string | null | undefined, mensaje: string): string {
  const n = normalizarCelular(celular);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(mensaje)}` : "";
}

/* ---------- Auditoría ---------- */
export async function audit(q: Queryable, req: Request | null, accion: string, entidad: string, entidadId?: number | null, pacienteId?: number | null, detalle?: string) {
  const u = req?.user;
  await q.query(
    "INSERT INTO auditoria(usuario_id, usuario_nombre, accion, entidad, entidad_id, paciente_id, detalle) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [u?.id ?? null, u?.nombre ?? null, accion, entidad, entidadId ?? null, pacienteId ?? null, detalle ?? null],
  );
}

export function esViolacionUnica(e: any): boolean { return e?.code === "23505"; }

export function idParam(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, "Identificador inválido");
  return n;
}

/** % de comisión vigente para un profesional y tratamiento (null si su contrato no es por porcentaje). */
export async function porcentajeAplicable(q: Queryable, profesionalId: number, servicioId: number): Promise<number | null> {
  const [p] = await q.query("SELECT contrato, porcentaje FROM profesionales WHERE id=$1", [profesionalId]);
  if (!p || p.contrato !== "PORCENTAJE") return null;
  const [o] = await q.query("SELECT porcentaje FROM comision_servicio WHERE profesional_id=$1 AND servicio_id=$2", [profesionalId, servicioId]);
  return o ? o.porcentaje : p.porcentaje;
}

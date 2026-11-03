/**
 * Deal base helpers (Fase 2, 2026-10-31). A published Weekly carries its
 * structured JSON in publications.body_data; these helpers turn its
 * `operaciones` into rows of public.deals through the SQL functions
 * deals_sync_publication / deals_unsync_publication
 * (migration 20261031120000_deals.sql).
 *
 * Used by admin-publications on publish, unpublish and delete.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/** Closed labels, same lists as the Weekly and Monthly prompts. A label
 * outside the list is stored as null rather than polluting the groupings. */
const SECTORES = [
  "Sanidad", "Tecnología", "Industrial", "Servicios", "Consumo",
  "Agroalimentario", "Energía", "Infraestructura", "Financiero", "Deuda privada",
];
const TIPOS = ["Buyout", "Growth", "M&A", "Deuda", "Salida", "Fundraising", "OPA"];
const ESTADOS = ["anunciada", "en_proceso", "cerrada", "cancelada"];

/** Legal-form and filler words dropped from the dedupe key. */
const KEY_STOPWORDS = new Set([
  "sa", "sau", "sl", "slu", "sll", "sociedad", "gmbh", "ag", "ltd", "limited",
  "inc", "llc", "bv", "nv", "spa", "srl", "sas", "plc", "grupo", "group", "holding",
  "the", "el", "la", "los", "las", "de", "del", "y",
]);

/** "Señalizaciones Ortega, S.L." -> "senalizacionesortega".
 * Text in brackets is dropped: the model sometimes annotates the name
 * ("Seaya Nova (fondo growth)"), and the note must not split one deal in two. */
export function normalizeKey(s: string): string {
  return s
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\./g, "") // "S.L." -> "sl", so the stopword list catches it
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !KEY_STOPWORDS.has(t))
    .join("");
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function validDate(v: unknown): string | null {
  const s = str(v);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

/** ECB reference rate (units of `currency` per euro) on or before `date`.
 * Null when the currency is unknown to the ECB or the API is unreachable. */
async function ecbRate(currency: string, date: string): Promise<number | null> {
  const url =
    `https://data-api.ecb.europa.eu/service/data/EXR/D.${currency}.EUR.SP00.A` +
    `?endPeriod=${date}&lastNObservations=1&format=jsondata`;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const json = await res.json();
    const series = json?.dataSets?.[0]?.series ?? {};
    const first = Object.values(series)[0] as { observations?: Record<string, unknown[]> } | undefined;
    const obs = first?.observations ? Object.values(first.observations)[0] : null;
    const rate = Array.isArray(obs) ? Number(obs[0]) : NaN;
    return isFinite(rate) && rate > 0 ? rate : null;
  } catch (err) {
    console.error(`ECB rate ${currency} ${date} failed:`, err);
    return null;
  }
}

export interface DealRow {
  deal_key: string;
  nombre: string;
  comprador: string | null;
  objetivo: string | null;
  tipo: string | null;
  sector: string | null;
  importe: string | null;
  n_importe: number | null;
  moneda: string | null;
  importe_eur: number | null;
  fecha: string | null;
  fecha_publicacion: string | null;
  estado: string | null;
  ambito: "espana" | "exterior";
  tesis: string | null;
  fuente_medio: string | null;
  fuente_url: string | null;
}

/** Weekly `operaciones` -> clean rows, amounts converted to euros.
 * `fallbackDate` (the publication's period_end) dates deals without one,
 * for the conversion only; the stored `fecha` stays null in that case. */
export async function dealsFromWeekly(body: unknown, fallbackDate: string | null): Promise<DealRow[]> {
  const ops = (body as { operaciones?: unknown })?.operaciones;
  if (!Array.isArray(ops)) return [];
  const rates = new Map<string, number | null>();
  const rows: DealRow[] = [];
  const seen = new Set<string>();

  for (const raw of ops) {
    if (!raw || typeof raw !== "object") continue;
    const op = raw as Record<string, unknown>;
    const nombre = str(op.nombre);
    if (!nombre) continue;
    const objetivo = str(op.objetivo);
    const ambito = op.ambito === "exterior" ? "exterior" : "espana";
    const base = normalizeKey(objetivo ?? nombre);
    if (!base) continue;
    const deal_key = `${base}|${ambito}`;
    if (seen.has(deal_key)) continue; // the same deal twice in one Weekly
    seen.add(deal_key);

    const tipo = str(op.tipo);
    const sector = str(op.sector);
    const fecha = validDate(op.fecha);
    const estado = str(op.estado)?.toLowerCase().replace(/\s+/g, "_") ?? null;
    const n = typeof op.n_importe === "number" && isFinite(op.n_importe) && op.n_importe > 0
      ? op.n_importe : null;
    const moneda = n !== null ? (str(op.moneda)?.toUpperCase() ?? "EUR") : null;

    let importe_eur: number | null = null;
    if (n !== null && moneda === "EUR") {
      importe_eur = n;
    } else if (n !== null && moneda && /^[A-Z]{3}$/.test(moneda)) {
      const day = fecha ?? fallbackDate;
      if (day) {
        const k = `${moneda}|${day}`;
        if (!rates.has(k)) rates.set(k, await ecbRate(moneda, day));
        const rate = rates.get(k);
        if (rate) importe_eur = Math.round((n / rate) * 10) / 10;
      }
    }

    const fuente = (op.fuente && typeof op.fuente === "object")
      ? op.fuente as Record<string, unknown> : {};
    const url = str(fuente.url);

    rows.push({
      deal_key,
      nombre,
      comprador: str(op.comprador),
      objetivo,
      tipo: tipo && TIPOS.includes(tipo) ? tipo : null,
      sector: sector && SECTORES.includes(sector) ? sector : null,
      importe: str(op.importe),
      n_importe: n,
      moneda,
      importe_eur,
      fecha,
      fecha_publicacion: validDate(op.fecha_publicacion),
      estado: estado && ESTADOS.includes(estado) ? estado : null,
      ambito,
      tesis: str(op.tesis),
      fuente_medio: str(fuente.medio),
      fuente_url: url && /^https?:\/\//i.test(url) ? url : null,
    });
  }
  return rows;
}

/** Feed the base from one publication, if it is a Weekly with body_data.
 * Returns how many deals were inserted or merged. Never throws: a failure
 * here must not undo a publish that already succeeded. */
export async function syncDeals(supabase: SupabaseClient, publicationId: string): Promise<number> {
  try {
    const { data: pub, error } = await supabase
      .from("publications")
      .select("id, type, status, body_data, period_end, is_test")
      .eq("id", publicationId)
      .single();
    if (error || !pub) return 0;
    if (pub.type !== "weekly" || pub.status !== "published" || !pub.body_data) return 0;
    const rows = await dealsFromWeekly(pub.body_data, pub.period_end ?? null);
    if (!rows.length) return 0;
    const { data: n, error: rpcErr } = await supabase.rpc("deals_sync_publication", {
      p_publication_id: publicationId,
      p_deals: rows,
      p_is_test: pub.is_test !== false,
    });
    if (rpcErr) {
      console.error("deals_sync_publication failed:", rpcErr);
      return 0;
    }
    return Number(n) || 0;
  } catch (err) {
    console.error("syncDeals error:", err);
    return 0;
  }
}

/** Take a publication out of the base. Returns how many deals were deleted. */
export async function unsyncDeals(supabase: SupabaseClient, publicationId: string): Promise<number> {
  try {
    const { data: n, error } = await supabase.rpc("deals_unsync_publication", {
      p_publication_id: publicationId,
    });
    if (error) {
      console.error("deals_unsync_publication failed:", error);
      return 0;
    }
    return Number(n) || 0;
  } catch (err) {
    console.error("unsyncDeals error:", err);
    return 0;
  }
}

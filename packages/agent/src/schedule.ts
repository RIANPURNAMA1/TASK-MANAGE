import { CronExpressionParser } from 'cron-parser';

export const DEFAULT_TIMEZONE = 'Asia/Jakarta';
/** Playbook H9: no job may run more often than once an hour. */
export const MIN_INTERVAL_MS = 60 * 60 * 1000;

export interface ScheduleCheck {
  ok: boolean;
  reason?: string;
  /** Next run times (UTC), for the confirmation screen. */
  next: Date[];
}

/** Validates a cron expression (5 fields) and the minimum frequency. */
export function checkCron(expr: string, timezone = DEFAULT_TIMEZONE, from = new Date(), count = 3): ScheduleCheck {
  if (expr.trim().split(/\s+/).length !== 5) return { ok: false, reason: 'Gunakan cron 5 kolom (menit jam tanggal bulan hari).', next: [] };
  try {
    const it = CronExpressionParser.parse(expr, { tz: timezone, currentDate: from });
    // Sample a window of runs: the tightest gap in it is the effective frequency.
    const samples: Date[] = [];
    for (let i = 0; i < Math.max(count, 12); i++) samples.push(it.next().toDate());
    for (let i = 1; i < samples.length; i++) {
      if (samples[i]!.getTime() - samples[i - 1]!.getTime() < MIN_INTERVAL_MS) {
        return { ok: false, reason: 'Jadwal terlalu sering: minimal 1 jam antar eksekusi.', next: samples.slice(0, count) };
      }
    }
    return { ok: true, next: samples.slice(0, count) };
  } catch {
    return { ok: false, reason: 'Ekspresi cron tidak valid.', next: [] };
  }
}

export function nextRun(expr: string, timezone = DEFAULT_TIMEZONE, from = new Date()): Date | null {
  try {
    return CronExpressionParser.parse(expr, { tz: timezone, currentDate: from }).next().toDate();
  } catch {
    return null;
  }
}

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const pad = (n: string) => n.padStart(2, '0');

/** Human-readable Indonesian description of common cron shapes; falls back to the raw expression. */
export function describeCron(expr: string): string {
  const [min, hour, dom, mon, dow] = expr.trim().split(/\s+/);
  if (!min || !hour || !dom || !mon || !dow) return expr;
  const time = /^\d+$/.test(min) && /^\d+$/.test(hour) ? `${pad(hour)}.${pad(min)}` : null;
  if (time && dom === '*' && mon === '*' && dow === '*') return `Setiap hari pukul ${time}`;
  if (time && dom === '*' && mon === '*' && /^[0-7]$/.test(dow)) return `Setiap ${DAYS[Number(dow) % 7]} pukul ${time}`;
  if (time && dom === '*' && mon === '*' && dow === '1-5') return `Setiap hari kerja (Senin–Jumat) pukul ${time}`;
  if (time && /^\d+$/.test(dom) && mon === '*' && dow === '*') return `Setiap tanggal ${dom} pukul ${time}`;
  if (min === '0' && /^\*\/\d+$/.test(hour) && dom === '*' && mon === '*' && dow === '*') return `Setiap ${hour.slice(2)} jam`;
  return `Cron: ${expr}`;
}

/**
 * Prompt asking a model to turn a sentence into a schedule. The reply is validated by the caller
 * (zod + {@link checkCron}) and shown to the user for confirmation — never executed blindly.
 */
export function scheduleParsePrompt(now: Date, timezone = DEFAULT_TIMEZONE): { system: string } {
  return {
    system: [
      'Anda mengubah permintaan penjadwalan berbahasa Indonesia/Inggris menjadi JSON. Balas HANYA dengan satu objek JSON, tanpa teks lain.',
      'Skema: {"cronExpr": string (cron 5 kolom: menit jam tanggal bulan hari-dalam-minggu), "timezone": string (IANA, default "' + timezone + '"), "instruction": string (tugas yang harus dikerjakan agent, tanpa kata waktu), "summary": string (ringkas, bahasa manusia)}.',
      'Hari: 0=Minggu, 1=Senin … 6=Sabtu. Contoh: "setiap Senin jam 8 pagi" → "0 8 * * 1".',
      `Sekarang: ${now.toISOString()} (zona ${timezone}). Frekuensi minimum 1 jam; jika diminta lebih sering, tetap tulis apa adanya (akan ditolak oleh validator).`,
    ].join('\n'),
  };
}

/** Extracts the first JSON object from a model reply (tolerates ```json fences). */
export function extractJsonObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('Balasan model tidak berisi JSON.');
  return JSON.parse(candidate.slice(start, end + 1));
}

export type SafetyVerdict = { ok: true } | { ok: false; reason: string };

/** Credential-shaped strings. Deliberately broad: a false alarm costs a rewrite, a leak costs more. */
const SECRET_PATTERNS: [RegExp, string][] = [
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'kunci API (sk-…)'],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/, 'kunci API Anthropic'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'kunci akses AWS'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'token GitHub'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'token Slack'],
  [/\bAIza[0-9A-Za-z_-]{30,}/, 'kunci API Google'],
  [/\bgsk_[A-Za-z0-9]{20,}/, 'kunci API Groq'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'token JWT'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/\b(?:password|passwd|pwd|kata ?sandi|secret|token|api[_ -]?key)\s*[:=]\s*\S{6,}/i, 'kredensial (password/token)'],
  [/\b[A-Fa-f0-9]{40,}\b/, 'string hex panjang (kemungkinan token)'],
];

/** Luhn check for payment card numbers. */
function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function containsCardNumber(text: string): boolean {
  for (const m of text.matchAll(/\b(?:\d[ -]?){13,19}\b/g)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return true;
  }
  return false;
}

/** Indonesian NIK: 16 digits, province 11–94, plausible day/month. */
function containsNik(text: string): boolean {
  for (const m of text.matchAll(/\b\d{16}\b/g)) {
    const v = m[0];
    const province = Number(v.slice(0, 2));
    const day = Number(v.slice(6, 8));
    const month = Number(v.slice(8, 10));
    if (province >= 11 && province <= 94 && month >= 1 && month <= 12 && ((day >= 1 && day <= 31) || (day >= 41 && day <= 71))) return true;
  }
  return false;
}

/** Instructions smuggled into "facts" would be replayed into every later prompt (memory poisoning). */
const INSTRUCTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget)\b.{0,30}\b(previous|prior|above|all)\b.{0,20}\b(instruction|prompt|rule)s?\b/i,
  /\b(abaikan|lupakan|kesampingkan)\b.{0,30}\b(instruksi|perintah|aturan)\b/i,
  /\b(selalu|always|setiap kali|every time)\b.{0,60}\b(kirim|send|forward|email|upload|post|bocorkan|leak|salin)\b/i,
  /\b(system prompt|prompt sistem)\b/i,
  /\byou (must|should) (always|never)\b/i,
];

/**
 * Screens text before it is stored as a memory (playbook H6): rejects secrets, card/ID numbers
 * and instruction-like content. Run it on the server — never rely on the LLM to self-censor.
 */
export function checkMemoryContent(text: string): SafetyVerdict {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: 'Isi memori kosong.' };
  if (trimmed.length > 500) return { ok: false, reason: 'Memori maksimal 500 karakter.' };
  for (const [pattern, label] of SECRET_PATTERNS) if (pattern.test(trimmed)) return { ok: false, reason: `Terdeteksi ${label}; rahasia tidak boleh disimpan sebagai memori.` };
  if (containsCardNumber(trimmed)) return { ok: false, reason: 'Terdeteksi nomor kartu pembayaran.' };
  if (containsNik(trimmed)) return { ok: false, reason: 'Terdeteksi nomor identitas (NIK).' };
  for (const pattern of INSTRUCTION_PATTERNS) if (pattern.test(trimmed)) return { ok: false, reason: 'Memori tidak boleh berisi instruksi untuk agent. Simpan fakta, bukan perintah.' };
  return { ok: true };
}

/** Wraps untrusted content (web pages, documents, task text) so the model treats it as data. */
export function wrapUntrusted(source: string, content: string): string {
  const safe = content.replace(/<\/?tool_output[^>]*>/gi, '');
  return `<tool_output source="${source.replace(/"/g, '')}">\n${safe}\n</tool_output>`;
}

/**
 * Magic-link session helpers.
 * Token format (signed): base64url(payload).base64url(hmac)
 * Payload: { customerNo, phone, name, exp }
 */

const SESSION_DAYS = 30;

function getSecret(): string {
  const s = process.env['SESSION_SECRET'] || process.env['API_TOKEN'] || '';
  if (!s) throw new Error('SESSION_SECRET / API_TOKEN חסר – לא ניתן לחתום סשן');
  return s;
}

function b64url(input: string | ArrayBuffer): string {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return b64url(sig);
}

export type MagicSession = {
  customerNo: string;
  phone: string;
  name: string;
  exp: number;
};

export async function signMagicSession(
  data: Omit<MagicSession, 'exp'>,
  days = SESSION_DAYS,
): Promise<string> {
  const payload: MagicSession = {
    ...data,
    exp: Math.floor(Date.now() / 1000) + days * 86400,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = await hmac(getSecret(), body);
  return `${body}.${sig}`;
}

export async function verifyMagicSession(token: string): Promise<MagicSession | null> {
  try {
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = await hmac(getSecret(), body);
    if (sig !== expected) return null;
    const payload = JSON.parse(fromB64url(body)) as MagicSession;
    if (!payload.customerNo || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Random opaque token stored in the customer sheet (not the session JWT). */
export function generateOpaqueToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const MAGIC_SESSION_STORAGE_KEY = 'saban-magic-session';

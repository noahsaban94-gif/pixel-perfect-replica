import type { Customer, Product, Order, Document } from './portal-domain';
import { isCustomerProduct, matchesCustomer, normalizePhone, safeDocumentUrl, NEW_CUSTOMER_ID } from './portal-domain';
export const SHEET_ID = '1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw';
type Values = { valueRanges?: { values?: string[][] }[] };
export async function sheetsRequest(path: string, init: RequestInit = {}) {
  const api = process.env['GOOGLE_SHEETS_API_KEY'], key = process.env['LOVABLE_API_KEY'];
  if (!api || !key) throw new Error('חיבור Google Sheets אינו מוגדר');
  const response = await fetch(`https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/${SHEET_ID}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, 'X-Connection-Api-Key': api, 'Content-Type': 'application/json', ...init.headers } });
  if (!response.ok) { const body = await response.text(); console.error('Sheets request failed', response.status, body); throw new Error(`Google Sheets לא זמין (${response.status})`); }
  return response.json();
}
export async function readRanges(ranges: string[]): Promise<string[][][]> {
  const query = new URLSearchParams(); ranges.forEach(r => query.append('ranges', r));
  const response: Values = await sheetsRequest(`/values:batchGet?${query}`);
  return response.valueRanges?.map(v => v.values ?? []) ?? [];
}
let publicCatalogCache: { expires: number; products: Product[] } | null = null;
export async function readCatalog(): Promise<Product[]> {
  if (publicCatalogCache && publicCatalogCache.expires > Date.now()) return publicCatalogCache.products;
  // Never request internal price, warehouse or driver columns.
  const [rows = [], images = []] = await readRanges(['מילון_לוגיסט!A1:G5000', 'מילון_לוגיסט!P1:P5000']);
  const products = rows.slice(1).flatMap((r, i) => {
    const [sku = '', name = '', category = '', unit = '', info = '', deposit = '', weight = '0'] = r;
    if (!sku || !name || !isCustomerProduct(name) || !/^[\w-]{1,40}$/.test(sku)) return [];
    const [keywords = '', technical = ''] = info.split(/מידע טכני:/);
    const capacity = deposit.match(/(\d+)\s*(?:בלוקים|יחידות|יח׳|יח')/);
    return [{ sku, name, category, unit, keywords, technical, deposit, weight: Number(weight.replace(/,/g,'')) || 0, image: images[i+1]?.[0] ?? '', palletCapacity: capacity?.[1] ? Number(capacity[1]) : null }];
  });
  publicCatalogCache = { expires: Date.now() + 300000, products };
  return products;
}
export async function readCustomer(phone: string): Promise<Customer> {
  const [rows = []] = await readRanges(['מאגר_לקוחות_מאוחד!A1:T10000']);
  const normalized = normalizePhone(phone);
  const matches = rows.slice(1).filter(r => (r[5] ?? '').split(/[,;|\n]/).some(p => normalizePhone(p.trim()) === normalized));
  // Ambiguous phone ownership must not unlock more than one customer.
  if (matches.length > 1) throw new Error('המספר משויך למספר כרטיסים. יש לפנות לסבן לאימות השיוך.');
  const r = matches[0];
  if (!r) return { id: NEW_CUSTOMER_ID, name: '', phone: normalized, sites: [], preferredSite: '', exempt: false, linkedIds: [] };
  return { id: r[1] ?? NEW_CUSTOMER_ID, linkedIds: (r[2] ?? '').split(/[,;|\n]/).map(v => v.trim()).filter(Boolean), name: r[3] ?? '', phone: normalized, sites: (r[6] ?? '').split(/[;|\n]/).map(v => v.trim()).filter(Boolean), preferredSite: r[19] ?? '', exempt: /^(כן|true|1)$/i.test(r[17] ?? '') };
}
export async function readCustomerRecords(customer: Customer): Promise<{ orders: Order[]; documents: Document[] }> {
  if (customer.id === NEW_CUSTOMER_ID) return { orders: [], documents: [] };
  const [orders = [], notes = [], docs = []] = await readRanges(['הזמנות!A1:R10000', 'ארכיון_תעודות_גליה!A1:T10000', 'ארכיון_מסמכי_לקוחות!A1:K10000']);
  return {
    orders: orders.slice(1).filter(r => matchesCustomer(r[4] ?? '', customer)).map(r => ({ id: r[3] ?? '', date: r[1] ?? r[0] ?? '', address: r[7] ?? '', status: r[15] ?? 'ממתינה לאישור', project: '', products: r[10] ?? '', weight: r[11] ?? '', lines: [] })),
    documents: [
      ...notes.slice(1).filter(r => matchesCustomer(r[5] ?? '', customer)).map(r => ({ id: r[3] ?? '', date: r[1] ?? '', address: r[7] ?? '', status: r[19] ? 'חתומה' : 'הופקה', url: safeDocumentUrl(r[19] || r[10] || ''), name: `תעודת משלוח ${r[3] ?? ''}` })),
      ...docs.slice(1).filter(r => matchesCustomer(r[1] ?? '', customer)).map(r => ({ id: r[8] ?? '', date: r[0] ?? '', address: '', status: r[10] ?? '', url: safeDocumentUrl(r[7] ?? ''), name: r[4] ?? 'מסמך' })),
    ],
  };
}
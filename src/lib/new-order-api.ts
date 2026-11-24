/**
 * Server-only client for the NewOrder Apps Script Web App.
 * Never import this file from client components.
 */

import type { Customer, Product } from './portal-domain';
import { isCustomerProduct, NEW_CUSTOMER_ID, normalizePhone } from './portal-domain';
import { generateOpaqueToken } from './magic-session';

const DEFAULT_WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbz3H6sNSxcBfuIhervXRM0V6mkjrp1VoJQ1azdrPL-JUffEf3_2uCudybRDHblFxDZo4w/exec';

const WEBAPP_URL =
  process.env['APPS_SCRIPT_URL'] ??
  process.env['NEW_ORDER_WEBAPP_URL'] ??
  DEFAULT_WEBAPP_URL;

const API_TOKEN = process.env['API_TOKEN'] ?? '';

if (!API_TOKEN && process.env.NODE_ENV === 'production') {
  console.error('[new-order-api] API_TOKEN is not set – protected actions will fail');
}

export type AppsScriptProduct = {
  sku: string;
  officialName?: string;
  name?: string;
  unit?: string;
  category?: string;
  slangKeywords?: string | string[];
  keywords?: string;
  deposit?: string;
  weightKgPerUnit?: number;
  weight?: number;
  imageUrl?: string;
  image?: string;
  technical?: string;
  palletCapacity?: number | null;
};

export type AppsScriptSite = { address?: string; city?: string };

export type AppsScriptCustomer = {
  customerNo?: string;
  id?: string;
  name?: string;
  aliases?: string[];
  phones?: string[];
  phone?: string;
  defaultSiteAddress?: string;
  comaxPrimaryNo?: string;
  comaxLinkedIds?: string[];
  linkedIds?: string[];
  sites?: (string | AppsScriptSite)[];
  preferredSite?: string;
  isPendingComax?: boolean;
  exempt?: boolean;
  magicToken?: string;
};

export type BootstrapData = { customers: Customer[]; products: Product[] };

export type InjectOrderPayload = {
  orderId?: string;
  customerNo: string;
  customerName: string;
  contactName: string;
  contactPhone: string;
  deliveryAddress: string;
  deliveryDate: string;
  project?: string;
  notes?: string;
  warehouse?: string;
  driver?: string;
  lines: { sku: string; name: string; quantity: number; unit?: string }[];
  totalWeightKg?: number;
  deposits?: { sku: string; name: string; quantity: number }[];
  whatsappMessage?: string;
};

export type InjectOrderResult = {
  orderId: string;
  customerNo?: string;
  whatsappMessage?: string;
  driveFolderUrl?: string;
  fileUrl?: string;
  wazeUrl?: string;
  rowNumber?: number;
};

export type MagicLinkResult = {
  customerNo: string;
  name: string;
  phone: string;
  magicToken: string;
  magicUrl: string;
  rowNumber?: number;
};

type AppsScriptResponse<T = unknown> =
  | { success: true; ok?: true; data?: T; [key: string]: unknown }
  | { success: false; ok?: false; error?: string; message?: string };

/** Digits-only phone for comparison (handles 050-xxx, +972, spaces). */
function digitsPhone(v: string): string {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('972')) d = '0' + d.slice(3);
  return d;
}

async function callAppsScript<T>(
  action: string,
  params: Record<string, unknown> = {},
  method: 'GET' | 'POST' = 'GET',
): Promise<T> {
  if (!WEBAPP_URL) throw new Error('שרת ההזמנות אינו מוגדר (APPS_SCRIPT_URL חסר)');

  // Always put action+token on the URL. Apps Script POST often 302-redirects and
  // browsers/runtimes may drop the JSON body on the follow-up request.
  const url = new URL(WEBAPP_URL);
  url.searchParams.set('action', action);
  if (API_TOKEN) url.searchParams.set('token', API_TOKEN);

  let response: Response;

  if (method === 'GET') {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'follow',
    });
  } else {
    response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ action, token: API_TOKEN || undefined, ...params }),
      redirect: 'follow',
    });
  }

  const text = await response.text();
  let json: AppsScriptResponse<T>;
  try {
    json = JSON.parse(text) as AppsScriptResponse<T>;
  } catch {
    console.error('[new-order-api]', action, response.status, text.slice(0, 300));
    throw new Error(
      `שרת ההזמנות החזיר תשובה לא תקינה (${response.status}). בדוק Deploy של Apps Script.`,
    );
  }

  if (json.success === false || json.ok === false) {
    throw new Error(json.error || json.message || 'הפעולה נכשלה בשרת ההזמנות');
  }
  if ('data' in json && json.data !== undefined) return json.data as T;
  const { success: _s, ok: _o, error: _e, message: _m, ...rest } = json as Record<string, unknown>;
  return rest as T;
}

function mapProduct(raw: AppsScriptProduct): Product | null {
  const sku = String(raw.sku ?? '').trim();
  const name = String(raw.officialName ?? raw.name ?? '').trim();
  if (!sku || !name || !isCustomerProduct(name)) return null;
  if (!/^[\w-]{1,40}$/.test(sku)) return null;

  const deposit = String(raw.deposit ?? '').trim();
  const weight = Number(raw.weightKgPerUnit ?? raw.weight ?? 0) || 0;
  const image = String(raw.imageUrl ?? raw.image ?? '').trim();
  const keywords = Array.isArray(raw.slangKeywords)
    ? raw.slangKeywords.join(', ')
    : String(raw.slangKeywords ?? raw.keywords ?? '').trim();

  return {
    sku,
    name,
    category: String(raw.category ?? 'כללי').trim(),
    unit: String(raw.unit ?? "יח'").trim(),
    keywords,
    technical: String(raw.technical ?? '').trim(),
    deposit,
    weight,
    image,
    palletCapacity: raw.palletCapacity ?? null,
  };
}

function mapCustomer(raw: AppsScriptCustomer): Customer {
  const id =
    String(raw.comaxPrimaryNo ?? raw.customerNo ?? raw.id ?? NEW_CUSTOMER_ID).trim() ||
    NEW_CUSTOMER_ID;
  const linkedIds = [...(raw.comaxLinkedIds ?? []), ...(raw.linkedIds ?? [])]
    .map((v) => String(v).trim())
    .filter(Boolean);
  const phones = (raw.phones ?? (raw.phone ? [raw.phone] : []))
    .map((p) => normalizePhone(String(p)))
    .filter(Boolean);
  const sites = (raw.sites ?? [])
    .map((s) =>
      typeof s === 'string' ? s.trim() : s?.address ? String(s.address).trim() : '',
    )
    .filter(Boolean);
  const preferred =
    String(raw.preferredSite ?? raw.defaultSiteAddress ?? '').trim() || sites[0] || '';

  return {
    id,
    name: String(raw.name ?? '').trim(),
    phone: phones[0] ?? '',
    sites,
    preferredSite: preferred,
    exempt: Boolean(raw.exempt),
    linkedIds,
  };
}

let catalogCache: { expires: number; products: Product[] } | null = null;
const CATALOG_TTL_MS = 5 * 60 * 1000;

export async function ping(): Promise<{ version?: string }> {
  return callAppsScript('ping');
}

export async function getCatalog(): Promise<Product[]> {
  if (catalogCache && catalogCache.expires > Date.now()) return catalogCache.products;
  const raw = await callAppsScript<{ products?: AppsScriptProduct[] }>('getOrderBootstrapData');
  const products = (raw.products ?? []).map(mapProduct).filter((p): p is Product => p !== null);
  catalogCache = { expires: Date.now() + CATALOG_TTL_MS, products };
  return products;
}

export async function getBootstrap(): Promise<BootstrapData> {
  const raw = await callAppsScript<{
    customers?: AppsScriptCustomer[];
    products?: AppsScriptProduct[];
  }>('getOrderBootstrapData');
  const products = (raw.products ?? []).map(mapProduct).filter((p): p is Product => p !== null);
  const customers = (raw.customers ?? []).map(mapCustomer);
  catalogCache = { expires: Date.now() + CATALOG_TTL_MS, products };
  return { customers, products };
}

export async function getCustomerByPhone(phone: string): Promise<Customer> {
  const normalized = normalizePhone(phone);
  const dig = digitsPhone(phone);
  if (!dig) {
    return {
      id: NEW_CUSTOMER_ID,
      name: '',
      phone: '',
      sites: [],
      preferredSite: '',
      exempt: false,
      linkedIds: [],
    };
  }

  try {
    const raw = await callAppsScript<{ customers?: AppsScriptCustomer[] }>('getOrderBootstrapData');
    const hit = (raw.customers ?? []).filter((c) => {
      const list = c.phones ?? (c.phone ? [c.phone] : []);
      return list.some((p) => digitsPhone(String(p)) === dig);
    });

    if (hit.length > 0) {
      const primary: AppsScriptCustomer = { ...hit[0], sites: [...(hit[0].sites ?? [])] };
      const primaryNo = String(primary.customerNo ?? primary.comaxPrimaryNo ?? primary.id ?? '').trim();
      const linkedSet = new Set<string>([
        ...(primary.comaxLinkedIds ?? []).map(String),
        ...(primary.linkedIds ?? []).map(String),
      ]);
      const getAddr = (s: string | AppsScriptSite) =>
        typeof s === 'string' ? s.trim() : String(s?.address ?? '').trim();
      const seenSites = new Set((primary.sites ?? []).map(getAddr).filter(Boolean));

      for (let i = 1; i < hit.length; i++) {
        const extra = hit[i];
        const extraNo = String(extra.customerNo ?? extra.comaxPrimaryNo ?? extra.id ?? '').trim();
        if (extraNo && extraNo !== primaryNo) linkedSet.add(extraNo);
        for (const l of [...(extra.comaxLinkedIds ?? []), ...(extra.linkedIds ?? [])]) {
          if (l) linkedSet.add(String(l));
        }
        for (const s of extra.sites ?? []) {
          const addr = getAddr(s);
          if (addr && !seenSites.has(addr)) {
            primary.sites!.push(s);
            seenSites.add(addr);
          }
        }
      }

      primary.comaxLinkedIds = Array.from(linkedSet);
      return mapCustomer({ ...primary, phone: normalized || dig });
    }
  } catch {
    // fallback to new customer if lookup fails
  }

  return {
    id: NEW_CUSTOMER_ID,
    name: '',
    phone: normalized || dig,
    sites: [],
    preferredSite: '',
    exempt: false,
    linkedIds: [],
  };
}

export async function getCustomerByNo(customerNo: string): Promise<Customer | null> {
  const needle = String(customerNo || '').trim();
  if (!needle) return null;
  const raw = await callAppsScript<{ customers?: AppsScriptCustomer[] }>('getOrderBootstrapData');
  const hit = (raw.customers ?? []).find((c) => {
    const no = String(c.customerNo ?? c.comaxPrimaryNo ?? c.id ?? '').trim();
    if (no === needle) return true;
    const linked = [...(c.comaxLinkedIds ?? []), ...(c.linkedIds ?? [])].map(String);
    return linked.includes(needle);
  });
  return hit ? mapCustomer(hit) : null;
}

/** Resolve by phone OR customer number (Comax). */
export async function resolveCustomer(query: string): Promise<Customer> {
  const q = String(query || '').trim();
  if (!q) {
    return {
      id: NEW_CUSTOMER_ID,
      name: '',
      phone: '',
      sites: [],
      preferredSite: '',
      exempt: false,
      linkedIds: [],
    };
  }

  // Customer numbers are typically 5–7 digits and do not start with 05
  const dig = digitsPhone(q);
  if (dig && !dig.startsWith('05') && dig.length >= 4 && dig.length <= 8) {
    const byNo = await getCustomerByNo(dig);
    if (byNo) return byNo;
  }

  if (dig.startsWith('05') || q.includes('-') || q.startsWith('+972')) {
    return getCustomerByPhone(q);
  }

  // Try number first then phone
  const byNo = await getCustomerByNo(q);
  if (byNo) return byNo;
  return getCustomerByPhone(q);
}

export async function injectOrder(payload: InjectOrderPayload): Promise<InjectOrderResult> {
  const itemsJson = JSON.stringify(
    payload.lines.map((l) => ({
      sku: l.sku,
      name: l.name,
      qty: l.quantity,
      unit: l.unit || "יח'",
    })),
  );
  let mergedItems = itemsJson;
  if (payload.deposits?.length) {
    try {
      const a = JSON.parse(itemsJson);
      const b = payload.deposits.map((d) => ({
        sku: d.sku,
        name: d.name,
        qty: d.quantity,
        unit: "יח'",
      }));
      mergedItems = JSON.stringify([...a, ...b]);
    } catch {
      /* keep */
    }
  }
  const body = {
    customerNo: payload.customerNo,
    customerName: payload.customerName,
    address: payload.deliveryAddress,
    contactPhone: payload.contactPhone,
    contactName: payload.contactName,
    phone: payload.contactPhone,
    deliveryDate: payload.deliveryDate,
    notes: [payload.project ? `פרויקט: ${payload.project}` : '', payload.notes || '']
      .filter(Boolean)
      .join('\n'),
    warehouse: payload.warehouse || '',
    driver: payload.driver || '',
    itemsJson: mergedItems,
    wazeUrl: '',
  };
  // Prefer GET-style query fallback if POST body is stripped by redirect
  try {
    const result = await callAppsScript<InjectOrderResult>('injectNewOrder', body, 'POST');
    return {
      orderId: result.orderId ?? payload.orderId ?? '',
      customerNo: result.customerNo,
      whatsappMessage: result.whatsappMessage,
      driveFolderUrl: result.driveFolderUrl,
      fileUrl: result.fileUrl,
      wazeUrl: result.wazeUrl,
      rowNumber: result.rowNumber,
    };
  } catch {
    const result = await callAppsScript<InjectOrderResult>('injectNewOrder', body, 'GET');
    return {
      orderId: result.orderId ?? payload.orderId ?? '',
      customerNo: result.customerNo,
      whatsappMessage: result.whatsappMessage,
      driveFolderUrl: result.driveFolderUrl,
      fileUrl: result.fileUrl,
      wazeUrl: result.wazeUrl,
      rowNumber: result.rowNumber,
    };
  }
}

export async function updateOrderCustomerNumber(
  orderId: string,
  newCustomerNo: string,
  oldCustomerNo?: string,
): Promise<void> {
  await callAppsScript(
    'updateOrderCustomerNumber',
    { orderId, newCustomerNo, oldCustomerNo: oldCustomerNo || '' },
    'POST',
  );
}

export async function issueCustomerMagicLink(opts: {
  customerNo?: string;
  phone?: string;
  baseUrl: string;
  rotate?: boolean;
}): Promise<MagicLinkResult> {
  const opaque = generateOpaqueToken();
  const base = opts.baseUrl.replace(/\/$/, '');

  // Resolve customer first so error messages are clear even if GAS is missing
  let customer: Customer | null = null;
  if (opts.customerNo) customer = await getCustomerByNo(opts.customerNo);
  if (!customer && opts.phone) customer = await getCustomerByPhone(opts.phone);
  if (!customer || customer.id === NEW_CUSTOMER_ID) {
    throw new Error(
      'לא נמצא לקוח רשום. הזן נייד מהכרטיס (למשל 050-5669924) או מספר לקוח (למשל 612108).',
    );
  }

  try {
    const result = await callAppsScript<MagicLinkResult & { magicToken?: string }>(
      'issueCustomerMagicLink',
      {
        customerNo: customer.id,
        phone: opts.phone || customer.phone || '',
        magicToken: opaque,
        rotate: opts.rotate !== false,
        baseUrl: base,
      },
      'POST',
    );
    const token = result.magicToken || opaque;
    return {
      customerNo: result.customerNo || customer.id,
      name: result.name || customer.name,
      phone: result.phone || customer.phone,
      magicToken: token,
      magicUrl: result.magicUrl || `${base}/auth/magic?t=${encodeURIComponent(token)}`,
      rowNumber: result.rowNumber,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('unknown_action') || msg.includes('not defined')) {
      throw new Error(
        'ב-Apps Script חסרים הפעולות issueCustomerMagicLink / validateCustomerMagicToken. הוסף אותן ל-Code.gs + NewOrder.gs ופרסם New version.',
      );
    }
    // Retry via GET (some deployments strip POST body)
    try {
      const result = await callAppsScript<MagicLinkResult & { magicToken?: string }>(
        'issueCustomerMagicLink',
        {
          customerNo: customer.id,
          phone: opts.phone || customer.phone || '',
          magicToken: opaque,
          rotate: String(opts.rotate !== false),
          baseUrl: base,
        },
        'GET',
      );
      const token = result.magicToken || opaque;
      return {
        customerNo: result.customerNo || customer.id,
        name: result.name || customer.name,
        phone: result.phone || customer.phone,
        magicToken: token,
        magicUrl: result.magicUrl || `${base}/auth/magic?t=${encodeURIComponent(token)}`,
        rowNumber: result.rowNumber,
      };
    } catch (e2) {
      const msg2 = e2 instanceof Error ? e2.message : msg;
      throw new Error(msg2);
    }
  }
}

export async function validateCustomerMagicToken(magicToken: string): Promise<{
  customerNo: string;
  name: string;
  phone: string;
}> {
  try {
    const result = await callAppsScript<{
      customerNo: string;
      name: string;
      phone: string;
    }>('validateCustomerMagicToken', { magicToken }, 'POST');
    if (!result.customerNo) throw new Error('קישור לא תקין או שפג תוקפו');
    return result;
  } catch {
    const result = await callAppsScript<{
      customerNo: string;
      name: string;
      phone: string;
    }>('validateCustomerMagicToken', { magicToken }, 'GET');
    if (!result.customerNo) throw new Error('קישור לא תקין או שפג תוקפו');
    return result;
  }
}

export async function getCustomerOrders(_customerNo: string) {
  return [] as {
    id: string;
    date: string;
    address: string;
    status: string;
    project: string;
    products: string;
    weight: string;
    lines: { sku: string; quantity: number }[];
  }[];
}

export async function getCustomerDocuments(_customerNo: string) {
  return [] as {
    id: string;
    date: string;
    address: string;
    status: string;
    url: string;
    name: string;
  }[];
}

export function toThumbnailUrl(imageUrl: string): string {
  if (!imageUrl) return '';
  try {
    const u = new URL(imageUrl);
    if (u.hostname === 'drive.google.com' || u.hostname === 'docs.google.com') {
      const fileId =
        u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] ?? u.searchParams.get('id');
      if (fileId) return `https://drive.google.com/thumbnail?id=${fileId}&sz=w600`;
    }
    return imageUrl;
  } catch {
    return '';
  }
}

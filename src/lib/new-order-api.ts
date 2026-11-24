/**
 * Server-only client for the NewOrder Apps Script Web App.
 * All calls to Google Sheets / Drive go through this module.
 * Never import this file from client components.
 */

import type { Customer, Product } from './portal-domain';
import { isCustomerProduct, NEW_CUSTOMER_ID, normalizePhone } from './portal-domain';

const WEBAPP_URL =
  process.env['APPS_SCRIPT_URL'] ??
  process.env['NEW_ORDER_WEBAPP_URL'] ??
  '';
const API_TOKEN = process.env['API_TOKEN'] ?? '';

if (!WEBAPP_URL && process.env.NODE_ENV === 'production') {
  console.error('[new-order-api] APPS_SCRIPT_URL / NEW_ORDER_WEBAPP_URL is not set');
}

// ---------------------------------------------------------------------------
// Types returned by the Apps Script (subset we actually consume)
// ---------------------------------------------------------------------------

export type AppsScriptProduct = {
  sku: string;
  officialName?: string;
  name?: string;
  unit?: string;
  category?: string;
  slangKeywords?: string;
  keywords?: string;
  deposit?: string; // "60002" | "60060" | "60006" | ""
  weightKgPerUnit?: number;
  weight?: number;
  imageUrl?: string;
  image?: string;
  technical?: string;
  palletCapacity?: number | null;
};

export type AppsScriptCustomer = {
  customerNo?: string;
  id?: string;
  name?: string;
  phones?: string[];
  phone?: string;
  sites?: string[];
  preferredSite?: string;
  comaxPrimaryNo?: string;
  comaxLinkedIds?: string[];
  linkedIds?: string[];
  isPendingComax?: boolean;
  exempt?: boolean;
};

export type BootstrapData = {
  customers: Customer[];
  products: Product[];
};

export type InjectOrderPayload = {
  orderId: string;
  customerNo: string;
  customerName: string;
  contactName: string;
  contactPhone: string;
  deliveryAddress: string;
  deliveryDate: string;
  project?: string;
  notes?: string;
  lines: { sku: string; name: string; quantity: number }[];
  totalWeightKg: number;
  deposits: { sku: string; name: string; quantity: number }[];
  whatsappMessage: string;
};

export type InjectOrderResult = {
  orderId: string;
  whatsappMessage?: string;
  driveFolderUrl?: string;
  wazeUrl?: string;
};

type AppsScriptResponse<T = unknown> =
  | { success: true; ok?: true; data?: T; [key: string]: unknown }
  | { success: false; ok?: false; error?: string; message?: string };

// ---------------------------------------------------------------------------
// Low-level transport
// ---------------------------------------------------------------------------

async function callAppsScript<T>(
  action: string,
  params: Record<string, unknown> = {},
  method: 'GET' | 'POST' = 'GET',
): Promise<T> {
  if (!WEBAPP_URL) {
    throw new Error('שרת ההזמנות אינו מוגדר (APPS_SCRIPT_URL חסר)');
  }

  const url = new URL(WEBAPP_URL);

  let response: Response;

  if (method === 'GET') {
    url.searchParams.set('action', action);
    if (API_TOKEN) url.searchParams.set('token', API_TOKEN);
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
      body: JSON.stringify({
        action,
        token: API_TOKEN || undefined,
        ...params,
      }),
      redirect: 'follow',
    });
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('[new-order-api]', action, response.status, body.slice(0, 400));
    throw new Error(`שרת ההזמנות החזיר שגיאה (${response.status})`);
  }

  const json = (await response.json()) as AppsScriptResponse<T>;

  // Support both { success: true, data } and { ok: true, ...fields }
  if (json.success === false || json.ok === false) {
    throw new Error(json.error || json.message || 'הפעולה נכשלה בשרת ההזמנות');
  }

  // Prefer explicit data field; otherwise return the whole payload (minus meta)
  if ('data' in json && json.data !== undefined) return json.data as T;
  const { success: _s, ok: _o, error: _e, message: _m, ...rest } = json as Record<string, unknown>;
  return rest as T;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Health check */
export async function ping(): Promise<{ version?: string }> {
  return callAppsScript('ping');
}

/** Map raw Apps Script product → safe Product DTO */
function mapProduct(raw: AppsScriptProduct): Product | null {
  const sku = String(raw.sku ?? '').trim();
  const name = String(raw.officialName ?? raw.name ?? '').trim();
  if (!sku || !name || !isCustomerProduct(name)) return null;
  if (!/^[\w-]{1,40}$/.test(sku)) return null;

  const deposit = String(raw.deposit ?? '').trim();
  const weight = Number(raw.weightKgPerUnit ?? raw.weight ?? 0) || 0;
  const image = String(raw.imageUrl ?? raw.image ?? '').trim();
  const keywords = String(raw.slangKeywords ?? raw.keywords ?? '').trim();
  const technical = String(raw.technical ?? '').trim();
  const unit = String(raw.unit ?? 'יח\'').trim();
  const category = String(raw.category ?? 'כללי').trim();

  let palletCapacity: number | null = raw.palletCapacity ?? null;
  if (palletCapacity == null) {
    const m = deposit.match(/(\d+)\s*(?:בלוקים|יחידות|יח׳|יח')/);
    if (m) palletCapacity = Number(m[1]);
  }

  return {
    sku,
    name,
    category,
    unit,
    keywords,
    technical,
    deposit,
    weight,
    image,
    palletCapacity,
  };
}

/** Map raw Apps Script customer → safe Customer DTO */
function mapCustomer(raw: AppsScriptCustomer): Customer {
  const id =
    String(raw.comaxPrimaryNo ?? raw.customerNo ?? raw.id ?? NEW_CUSTOMER_ID).trim() ||
    NEW_CUSTOMER_ID;
  const linkedIds = [
    ...(raw.comaxLinkedIds ?? []),
    ...(raw.linkedIds ?? []),
  ]
    .map((v) => String(v).trim())
    .filter(Boolean);

  const phones = (raw.phones ?? (raw.phone ? [raw.phone] : []))
    .map((p) => normalizePhone(String(p)))
    .filter(Boolean);

  return {
    id,
    name: String(raw.name ?? '').trim(),
    phone: phones[0] ?? '',
    sites: (raw.sites ?? []).map((s) => String(s).trim()).filter(Boolean),
    preferredSite: String(raw.preferredSite ?? '').trim(),
    exempt: Boolean(raw.exempt),
    linkedIds,
  };
}

// Short in-memory cache for catalog (Stale-While-Revalidate style)
let catalogCache: { expires: number; products: Product[] } | null = null;
const CATALOG_TTL_MS = 5 * 60 * 1000; // 5 minutes (matches Apps Script cache)

/** Fetch + filter catalog. Safe for public use. */
export async function getCatalog(): Promise<Product[]> {
  if (catalogCache && catalogCache.expires > Date.now()) {
    return catalogCache.products;
  }

  // Prefer dedicated getCatalog; fall back to bootstrap if needed
  let rawProducts: AppsScriptProduct[] = [];
  try {
    const result = await callAppsScript<{ products?: AppsScriptProduct[] } | AppsScriptProduct[]>(
      'getCatalog',
    );
    rawProducts = Array.isArray(result) ? result : (result.products ?? []);
  } catch {
    const bootstrap = await callAppsScript<{
      products?: AppsScriptProduct[];
    }>('getOrderBootstrapData');
    rawProducts = bootstrap.products ?? [];
  }

  const products = rawProducts.map(mapProduct).filter((p): p is Product => p !== null);
  catalogCache = { expires: Date.now() + CATALOG_TTL_MS, products };
  return products;
}

/** Full bootstrap (customers + products). Used for order wizard. */
export async function getBootstrap(): Promise<BootstrapData> {
  const raw = await callAppsScript<{
    customers?: AppsScriptCustomer[];
    products?: AppsScriptProduct[];
  }>('getOrderBootstrapData');

  const products = (raw.products ?? []).map(mapProduct).filter((p): p is Product => p !== null);
  const customers = (raw.customers ?? []).map(mapCustomer);

  // Keep catalog cache warm
  catalogCache = { expires: Date.now() + CATALOG_TTL_MS, products };

  return { customers, products };
}

/** Find customer by normalized phone. Returns new-customer stub if not found. */
export async function getCustomerByPhone(phone: string): Promise<Customer> {
  const normalized = normalizePhone(phone);
  if (!normalized) {
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
    // Prefer dedicated endpoint if available
    const result = await callAppsScript<
      AppsScriptCustomer | { customer?: AppsScriptCustomer }
    >('getCustomer', { phone: normalized });
    const raw = 'customer' in result && result.customer ? result.customer : (result as AppsScriptCustomer);
    if (raw && (raw.customerNo || raw.comaxPrimaryNo || raw.id || raw.name)) {
      return mapCustomer({ ...raw, phone: normalized });
    }
  } catch {
    // fall through to search / bootstrap
  }

  // Fallback: searchCustomers or bootstrap scan
  try {
    const search = await callAppsScript<
      AppsScriptCustomer[] | { customers?: AppsScriptCustomer[] }
    >('searchCustomers', { q: normalized });
    const list = Array.isArray(search) ? search : (search.customers ?? []);
    const matches = list.filter((c) =>
      (c.phones ?? (c.phone ? [c.phone] : []))
        .map((p) => normalizePhone(String(p)))
        .includes(normalized),
    );
    if (matches.length > 1) {
      throw new Error('המספר משויך למספר כרטיסים. יש לפנות לסבן לאימות השיוך.');
    }
    if (matches[0]) return mapCustomer({ ...matches[0], phone: normalized });
  } catch (e) {
    if (e instanceof Error && e.message.includes('מספר כרטיסים')) throw e;
  }

  return {
    id: NEW_CUSTOMER_ID,
    name: '',
    phone: normalized,
    sites: [],
    preferredSite: '',
    exempt: false,
    linkedIds: [],
  };
}

/** Inject a new order via Apps Script (creates Drive folder + returns WhatsApp text). */
export async function injectOrder(payload: InjectOrderPayload): Promise<InjectOrderResult> {
  const result = await callAppsScript<InjectOrderResult>('injectNewOrder', payload as unknown as Record<string, unknown>, 'POST');
  return {
    orderId: result.orderId ?? payload.orderId,
    whatsappMessage: result.whatsappMessage,
    driveFolderUrl: result.driveFolderUrl,
    wazeUrl: result.wazeUrl,
  };
}

/** Update customer number on an existing order (e.g. 500500 → real Comax). */
export async function updateOrderCustomerNumber(
  orderId: string,
  customerNo: string,
): Promise<void> {
  await callAppsScript('updateOrderCustomerNumber', { orderId, customerNo }, 'POST');
}

/** Customer orders (server-side filtered by customer number). */
export async function getCustomerOrders(customerNo: string): Promise<
  { id: string; date: string; address: string; status: string; project: string; products: string; weight: string; lines: { sku: string; quantity: number }[] }[]
> {
  if (!customerNo || customerNo === NEW_CUSTOMER_ID) return [];
  try {
    const result = await callAppsScript<
      | { orders?: unknown[] }
      | unknown[]
    >('getCustomerHistory', { customerNo });
    const list = Array.isArray(result) ? result : (result.orders ?? []);
    return list.map((raw: any) => ({
      id: String(raw.id ?? raw.orderId ?? ''),
      date: String(raw.date ?? raw.deliveryDate ?? ''),
      address: String(raw.address ?? raw.deliveryAddress ?? ''),
      status: String(raw.status ?? 'ממתינה לאישור'),
      project: String(raw.project ?? ''),
      products: String(raw.products ?? ''),
      weight: String(raw.weight ?? raw.totalWeightKg ?? ''),
      lines: Array.isArray(raw.lines) ? raw.lines : [],
    }));
  } catch {
    return [];
  }
}

/** Customer delivery notes / documents. */
export async function getCustomerDocuments(customerNo: string): Promise<
  { id: string; date: string; address: string; status: string; url: string; name: string }[]
> {
  if (!customerNo || customerNo === NEW_CUSTOMER_ID) return [];
  try {
    const result = await callAppsScript<
      | { documents?: unknown[]; notes?: unknown[] }
      | unknown[]
    >('getCustomerDocuments', { customerNo });
    const list = Array.isArray(result)
      ? result
      : [...(result.documents ?? []), ...(result.notes ?? [])];
    return list.map((raw: any) => ({
      id: String(raw.id ?? ''),
      date: String(raw.date ?? ''),
      address: String(raw.address ?? ''),
      status: String(raw.status ?? ''),
      url: String(raw.url ?? raw.fileUrl ?? ''),
      name: String(raw.name ?? raw.title ?? 'מסמך'),
    }));
  } catch {
    return [];
  }
}

/** Convert Drive file URL to a safe thumbnail URL (or leave as-is for proxy). */
export function toThumbnailUrl(imageUrl: string): string {
  if (!imageUrl) return '';
  try {
    const u = new URL(imageUrl);
    if (u.hostname === 'drive.google.com' || u.hostname === 'docs.google.com') {
      const fileId = u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] ?? u.searchParams.get('id');
      if (fileId) return `https://drive.google.com/thumbnail?id=${fileId}&sz=w600`;
    }
    return imageUrl;
  } catch {
    return '';
  }
}

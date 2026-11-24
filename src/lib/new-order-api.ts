/**
 * Server-only client for the NewOrder Apps Script Web App.
 * Aligned with NewOrder.gs handlers:
 *   handleGetOrderBootstrapData_
 *   handleInjectNewOrder_
 *   handleUpdateOrderCustomerNumber_
 * Never import this file from client components.
 */

import type { Customer, Product } from './portal-domain';
import { isCustomerProduct, NEW_CUSTOMER_ID, normalizePhone } from './portal-domain';

/** Latest verified deployment (2026-11-24) */
const DEFAULT_WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbzR9gPq73D75pVxAkqEwM0Kx-eYlxIGBk39LhwtAXilY89lPfyQO0izd2aL7PtbkCSfdQ/exec';

const WEBAPP_URL =
  process.env['APPS_SCRIPT_URL'] ??
  process.env['NEW_ORDER_WEBAPP_URL'] ??
  DEFAULT_WEBAPP_URL;

const API_TOKEN = process.env['API_TOKEN'] ?? '';

if (!API_TOKEN && process.env.NODE_ENV === 'production') {
  console.error('[new-order-api] API_TOKEN is not set – protected actions will fail');
}

// ---------------------------------------------------------------------------
// Types returned by NewOrder.gs (subset we consume)
// ---------------------------------------------------------------------------

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
  defaultWarehouse?: string;
  recommendedDriver?: string;
  mediaCode?: string;
};

export type AppsScriptSite = {
  address?: string;
  city?: string;
  p80StayMin?: number | null;
  roadKmFromHarash?: number | null;
  roadKmFromTalmid?: number | null;
  defaultUnloadType?: string;
};

export type AppsScriptCustomer = {
  customerNo?: string;
  id?: string;
  name?: string;
  aliases?: string[];
  phones?: string[];
  phone?: string;
  contactName?: string;
  defaultSiteAddress?: string;
  typicalUnloadType?: string;
  recommendedTruck?: string;
  masterId?: string;
  comaxPrimaryNo?: string;
  comaxLinkedIds?: string[];
  linkedIds?: string[];
  driveFolderUrl?: string;
  sites?: (string | AppsScriptSite)[];
  preferredSite?: string;
  isPendingComax?: boolean;
  exempt?: boolean;
};

export type BootstrapData = {
  customers: Customer[];
  products: Product[];
};

/** Portal-side payload (mapped to Apps Script shape in injectOrder) */
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

  if (json.success === false || json.ok === false) {
    throw new Error(json.error || json.message || 'הפעולה נכשלה בשרת ההזמנות');
  }

  if ('data' in json && json.data !== undefined) return json.data as T;
  const { success: _s, ok: _o, error: _e, message: _m, ...rest } = json as Record<string, unknown>;
  return rest as T;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapProduct(raw: AppsScriptProduct): Product | null {
  const sku = String(raw.sku ?? '').trim();
  const name = String(raw.officialName ?? raw.name ?? '').trim();
  if (!sku || !name || !isCustomerProduct(name)) return null;
  if (!/^[\w-]{1,40}$/.test(sku)) return null;

  const deposit = String(raw.deposit ?? '').trim();
  const weight = Number(raw.weightKgPerUnit ?? raw.weight ?? 0) || 0;
  const image = String(raw.imageUrl ?? raw.image ?? '').trim();

  let keywords = '';
  if (Array.isArray(raw.slangKeywords)) {
    keywords = raw.slangKeywords.join(', ');
  } else {
    keywords = String(raw.slangKeywords ?? raw.keywords ?? '').trim();
  }

  const technical = String(raw.technical ?? '').trim();
  const unit = String(raw.unit ?? "יח'").trim();
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

  // sites can be string[] or object[] with .address
  const sites = (raw.sites ?? [])
    .map((s) => {
      if (typeof s === 'string') return s.trim();
      if (s && typeof s === 'object' && s.address) return String(s.address).trim();
      return '';
    })
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let catalogCache: { expires: number; products: Product[] } | null = null;
const CATALOG_TTL_MS = 5 * 60 * 1000;

export async function ping(): Promise<{ version?: string }> {
  return callAppsScript('ping');
}

/**
 * Catalog = products from handleGetOrderBootstrapData_.
 * There is no separate getCatalog_ in NewOrder.gs.
 */
export async function getCatalog(): Promise<Product[]> {
  if (catalogCache && catalogCache.expires > Date.now()) {
    return catalogCache.products;
  }

  const raw = await callAppsScript<{ products?: AppsScriptProduct[] }>('getOrderBootstrapData');
  const products = (raw.products ?? []).map(mapProduct).filter((p): p is Product => p !== null);
  catalogCache = { expires: Date.now() + CATALOG_TTL_MS, products };
  return products;
}

/** Full bootstrap (customers + products) via handleGetOrderBootstrapData_ */
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

/** Resolve customer by phone using bootstrap data (no separate getCustomer_ yet). */
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
    const { customers } = await getBootstrap();
    const matches = customers.filter((c) => {
      // bootstrap already normalized one primary phone; also check linked via raw if needed
      return c.phone === normalized;
    });

    // Also scan all phones from a fresh bootstrap if primary didn't match
    if (!matches.length) {
      const raw = await callAppsScript<{ customers?: AppsScriptCustomer[] }>('getOrderBootstrapData');
      const hit = (raw.customers ?? []).filter((c) =>
        (c.phones ?? []).map((p) => normalizePhone(String(p))).includes(normalized),
      );
      if (hit.length > 1) {
        throw new Error('המספר משויך למספר כרטיסים. יש לפנות לסבן לאימות השיוך.');
      }
      if (hit[0]) return mapCustomer({ ...hit[0], phone: normalized });
    } else if (matches.length > 1) {
      throw new Error('המספר משויך למספר כרטיסים. יש לפנות לסבן לאימות השיוך.');
    } else if (matches[0]) {
      return { ...matches[0], phone: normalized };
    }
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

/**
 * Inject order → handleInjectNewOrder_
 * Body shape expected by NewOrder.gs:
 *   customerNo, customerName, address, itemsJson (string),
 *   contactPhone, contactName, deliveryDate, notes, warehouse, driver, wazeUrl
 */
export async function injectOrder(payload: InjectOrderPayload): Promise<InjectOrderResult> {
  const itemsJson = JSON.stringify(
    payload.lines.map((l) => ({
      sku: l.sku,
      name: l.name,
      qty: l.quantity,
      unit: l.unit || "יח'",
    })),
  );

  // Include deposit lines in items if present
  const depositsJson =
    payload.deposits && payload.deposits.length
      ? JSON.stringify(
          payload.deposits.map((d) => ({
            sku: d.sku,
            name: d.name,
            qty: d.quantity,
            unit: "יח'",
          })),
        )
      : null;

  let mergedItems = itemsJson;
  if (depositsJson) {
    try {
      const a = JSON.parse(itemsJson);
      const b = JSON.parse(depositsJson);
      mergedItems = JSON.stringify([...a, ...b]);
    } catch {
      /* keep items only */
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
    deliveryWindow: '',
    notes: [payload.project ? `פרויקט: ${payload.project}` : '', payload.notes || '']
      .filter(Boolean)
      .join('\n'),
    warehouse: payload.warehouse || '',
    driver: payload.driver || '',
    itemsJson: mergedItems,
    wazeUrl: '',
  };

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
}

/** Update customer number → handleUpdateOrderCustomerNumber_ */
export async function updateOrderCustomerNumber(
  orderId: string,
  newCustomerNo: string,
  oldCustomerNo?: string,
): Promise<void> {
  await callAppsScript(
    'updateOrderCustomerNumber',
    {
      orderId,
      newCustomerNo,
      oldCustomerNo: oldCustomerNo || '',
    },
    'POST',
  );
}

/** Orders history – not yet in NewOrder.gs; returns empty until wired */
export async function getCustomerOrders(_customerNo: string): Promise<
  {
    id: string;
    date: string;
    address: string;
    status: string;
    project: string;
    products: string;
    weight: string;
    lines: { sku: string; quantity: number }[];
  }[]
> {
  return [];
}

/** Documents – not yet in NewOrder.gs; returns empty until wired */
export async function getCustomerDocuments(_customerNo: string): Promise<
  { id: string; date: string; address: string; status: string; url: string; name: string }[]
> {
  return [];
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

import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import {
  getCatalog as fetchCatalog,
  getCustomerByPhone,
  getCustomerByNo,
  getCustomerOrders,
  getCustomerDocuments,
  injectOrder,
  issueCustomerMagicLink,
  validateCustomerMagicToken,
} from './new-order-api';
import { orderSchema, orderMessage, calculateOrder, phoneSchema, NEW_CUSTOMER_ID } from './portal-domain';
import { signMagicSession, verifyMagicSession } from './magic-session';
import { setResponseHeader } from '@tanstack/react-start/server';
import { z } from 'zod';

export const getCatalog = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const products = await fetchCatalog();
    return {
      products: products.map((p) => ({
        ...p,
        image: p.image ? `/api/public/product-image/${p.sku}` : '',
      })),
      error: '',
    };
  } catch (error) {
    return {
      products: [],
      error: error instanceof Error ? error.message : 'הקטלוג לא זמין',
    };
  }
});

/** Request a personal magic link for an existing customer (by phone). */
export const requestMagicLink = createServerFn({ method: 'POST' })
  .inputValidator((input) =>
    z
      .object({
        phone: phoneSchema,
        baseUrl: z.string().url(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const customer = await getCustomerByPhone(data.phone);
    if (customer.id === NEW_CUSTOMER_ID) {
      throw new Error('לא נמצא לקוח רשום עם מספר זה. פנה לסבן לפתיחת כרטיס.');
    }
    const link = await issueCustomerMagicLink({
      customerNo: customer.id,
      phone: data.phone,
      baseUrl: data.baseUrl,
      rotate: true,
    });
    // Do not expose full token to unauthenticated browser in production logs;
    // return the URL so staff/WhatsApp can share it, or customer sees "נשלח".
    return {
      ok: true as const,
      customerNo: link.customerNo,
      name: link.name,
      magicUrl: link.magicUrl,
      // masked hint only
      phoneHint: data.phone.replace(/(\d{3})\d{4}(\d{3})/, '$1****$2'),
    };
  });

/** Redeem opaque sheet token → signed session string for localStorage. */
export const redeemMagicLink = createServerFn({ method: 'POST' })
  .inputValidator((input) => z.object({ token: z.string().min(16).max(128) }).parse(input))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const validated = await validateCustomerMagicToken(data.token);
    const session = await signMagicSession({
      customerNo: validated.customerNo,
      phone: normalizePhoneSafe(validated.phone),
      name: validated.name,
    });
    return {
      session,
      customerNo: validated.customerNo,
      name: validated.name,
      phone: normalizePhoneSafe(validated.phone),
    };
  });

function normalizePhoneSafe(v: string) {
  return String(v || '')
    .replace(/\D/g, '')
    .replace(/^972/, '0');
}

/** Load portal data using magic session token (no Supabase SMS). */
export const getMyPortalMagic = createServerFn({ method: 'POST' })
  .inputValidator((input) => z.object({ session: z.string().min(20) }).parse(input))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const payload = await verifyMagicSession(data.session);
    if (!payload) throw new Error('הסשן פג או אינו תקין. יש להיכנס מחדש דרך הקישור.');

    const customer =
      (await getCustomerByNo(payload.customerNo)) ||
      (await getCustomerByPhone(payload.phone));

    if (!customer || customer.id === NEW_CUSTOMER_ID) {
      throw new Error('לקוח לא נמצא');
    }

    const [orders, documents] = await Promise.all([
      getCustomerOrders(customer.id),
      getCustomerDocuments(customer.id),
    ]);

    return { customer, orders, documents };
  });

/** Legacy Supabase path (kept for compatibility). */
export const getMyPortal = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const phone = context.claims['phone'];
    if (typeof phone !== 'string' || !phone) throw new Error('נדרש אימות מספר טלפון');

    const customer = await getCustomerByPhone(phone);
    const [orders, documents] = await Promise.all([
      getCustomerOrders(customer.id),
      getCustomerDocuments(customer.id),
    ]);

    return { customer, orders, documents };
  });

export const submitOrder = createServerFn({ method: 'POST' })
  .inputValidator((input) =>
    z
      .object({
        order: orderSchema,
        /** Magic session OR rely on Supabase via separate path */
        session: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');

    let customerNo = '';
    let customerPhone = '';
    let customerName = '';

    if (data.session) {
      const payload = await verifyMagicSession(data.session);
      if (!payload) throw new Error('הסשן פג. יש להיכנס מחדש.');
      customerNo = payload.customerNo;
      customerPhone = payload.phone;
      customerName = payload.name;
    } else {
      throw new Error('נדרשת כניסה עם קישור אישי');
    }

    const customer =
      (await getCustomerByNo(customerNo)) || (await getCustomerByPhone(customerPhone));
    if (!customer) throw new Error('לקוח לא נמצא');

    const catalog = await fetchCatalog();
    const order = data.order;

    if (new Set(order.lines.map((l) => l.sku)).size !== order.lines.length) {
      throw new Error('נמצאו פריטים כפולים');
    }
    if (order.lines.some((l) => !catalog.some((p) => p.sku === l.sku))) {
      throw new Error('יש פריטים שאינם זמינים בקטלוג');
    }

    const totals = calculateOrder(order.lines, catalog, customer.exempt);
    if (totals.issues.length) throw new Error(totals.issues.join('\n'));

    const delivery = {
      ...order.delivery,
      customerName: customer.name || customerName || order.delivery.customerName,
    };

    const message = orderMessage(
      delivery,
      order.lines,
      catalog,
      customer.id,
      customer.exempt,
    );

    const lines = order.lines.map((l) => ({
      sku: l.sku,
      name: catalog.find((p) => p.sku === l.sku)?.name ?? l.sku,
      quantity: l.quantity,
    }));

    const result = await injectOrder({
      orderId: order.id,
      customerNo: customer.id,
      customerName: delivery.customerName,
      contactName: delivery.contact,
      contactPhone: delivery.phone,
      deliveryAddress: delivery.address,
      deliveryDate: delivery.date,
      project: delivery.project || undefined,
      notes: delivery.notes || undefined,
      lines,
      totalWeightKg: totals.weight,
      deposits: totals.deposits,
      whatsappMessage: message,
    });

    return {
      id: result.orderId,
      message: result.whatsappMessage ?? message,
      driveFolderUrl: result.driveFolderUrl,
      wazeUrl: result.wazeUrl,
    };
  });

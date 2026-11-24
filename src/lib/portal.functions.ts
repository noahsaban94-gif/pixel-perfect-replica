import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import {
  getCatalog as fetchCatalog,
  getCustomerByPhone,
  getCustomerByNo,
  resolveCustomer,
  getCustomerOrders,
  getCustomerDocuments,
  injectOrder,
  issueCustomerMagicLink,
  validateCustomerMagicToken,
} from './new-order-api';
import { orderSchema, orderMessage, calculateOrder, NEW_CUSTOMER_ID } from './portal-domain';
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

/** Request a personal magic link – phone OR customer number. */
export const requestMagicLink = createServerFn({ method: 'POST' })
  .inputValidator((input) =>
    z
      .object({
        /** Israeli mobile or Comax customer number */
        query: z.string().trim().min(4).max(20),
        baseUrl: z.string().url(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const customer = await resolveCustomer(data.query);
    if (customer.id === NEW_CUSTOMER_ID) {
      throw new Error(
        'לא נמצא לקוח רשום. נסה נייד כמו 050-5669924 או מספר לקוח כמו 612108.',
      );
    }
    const link = await issueCustomerMagicLink({
      customerNo: customer.id,
      phone: customer.phone,
      baseUrl: data.baseUrl,
      rotate: true,
    });
    return {
      ok: true as const,
      customerNo: link.customerNo,
      name: link.name,
      magicUrl: link.magicUrl,
      phoneHint: (customer.phone || data.query).replace(/(\d{3})\d{4}(\d{3})/, '$1****$2'),
    };
  });

export const redeemMagicLink = createServerFn({ method: 'POST' })
  .inputValidator((input) => z.object({ token: z.string().min(16).max(128) }).parse(input))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const validated = await validateCustomerMagicToken(data.token);
    const session = await signMagicSession({
      customerNo: validated.customerNo,
      phone: String(validated.phone || '').replace(/\D/g, '').replace(/^972/, '0'),
      name: validated.name,
    });
    return {
      session,
      customerNo: validated.customerNo,
      name: validated.name,
      phone: validated.phone,
    };
  });

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
        session: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');

    if (!data.session) throw new Error('נדרשת כניסה עם קישור אישי');
    const payload = await verifyMagicSession(data.session);
    if (!payload) throw new Error('הסשן פג. יש להיכנס מחדש.');

    const customer =
      (await getCustomerByNo(payload.customerNo)) ||
      (await getCustomerByPhone(payload.phone));
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
      customerName: customer.name || payload.name || order.delivery.customerName,
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

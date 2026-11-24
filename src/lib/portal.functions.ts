import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import {
  getCatalog as fetchCatalog,
  getCustomerByPhone,
  getCustomerOrders,
  getCustomerDocuments,
  injectOrder,
} from './new-order-api';
import { orderSchema, orderMessage, calculateOrder } from './portal-domain';
import { setResponseHeader } from '@tanstack/react-start/server';

export const getCatalog = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const products = await fetchCatalog();
    return {
      products: products.map((p) => ({
        ...p,
        // Proxy images through our own endpoint so Drive links never hit the browser directly
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
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => orderSchema.parse(input))
  .handler(async ({ data, context }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const phone = context.claims['phone'];
    if (typeof phone !== 'string' || !phone) throw new Error('נדרש אימות מספר טלפון');

    const customer = await getCustomerByPhone(phone);
    const catalog = await fetchCatalog();

    if (new Set(data.lines.map((l) => l.sku)).size !== data.lines.length) {
      throw new Error('נמצאו פריטים כפולים');
    }
    if (data.lines.some((l) => !catalog.some((p) => p.sku === l.sku))) {
      throw new Error('יש פריטים שאינם זמינים בקטלוג');
    }

    const totals = calculateOrder(data.lines, catalog, customer.exempt);
    if (totals.issues.length) throw new Error(totals.issues.join('\n'));

    const delivery = {
      ...data.delivery,
      customerName: customer.name || data.delivery.customerName,
    };

    const message = orderMessage(
      delivery,
      data.lines,
      catalog,
      customer.id,
      customer.exempt,
    );

    const lines = data.lines.map((l) => ({
      sku: l.sku,
      name: catalog.find((p) => p.sku === l.sku)?.name ?? l.sku,
      quantity: l.quantity,
    }));

    const result = await injectOrder({
      orderId: data.id,
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

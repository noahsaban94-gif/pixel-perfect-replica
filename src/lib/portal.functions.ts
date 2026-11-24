import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { readCatalog, readCustomer, readCustomerRecords, sheetsRequest } from './sheets.server';
import { orderSchema, orderMessage, calculateOrder } from './portal-domain';
import { setResponseHeader } from '@tanstack/react-start/server';

export const getCatalog = createServerFn({ method: 'GET' }).handler(async () => {
  try { return { products: (await readCatalog()).map(p => ({ ...p, image: `/api/public/product-image/${p.sku}` })), error: '' }; }
  catch (error) { return { products: [], error: error instanceof Error ? error.message : 'הקטלוג לא זמין' }; }
});
export const getMyPortal = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  setResponseHeader('Cache-Control', 'no-store');
  const phone = context.claims['phone'];
  if (typeof phone !== 'string' || !phone) throw new Error('נדרש אימות מספר טלפון');
  const customer = await readCustomer(phone);
  return { customer, ...await readCustomerRecords(customer) };
});
export const submitOrder = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(input => orderSchema.parse(input)).handler(async ({ data, context }) => {
  setResponseHeader('Cache-Control', 'no-store');
  const phone = context.claims['phone'];
  if (typeof phone !== 'string' || !phone) throw new Error('נדרש אימות מספר טלפון');
  const customer = await readCustomer(phone), catalog = await readCatalog();
  if (new Set(data.lines.map(l => l.sku)).size !== data.lines.length) throw new Error('נמצאו פריטים כפולים');
  if (data.lines.some(l => !catalog.some(p => p.sku === l.sku))) throw new Error('יש פריטים שאינם זמינים בקטלוג');
  const totals = calculateOrder(data.lines, catalog, customer.exempt);
  if (totals.issues.length) throw new Error(totals.issues.join('\n'));
  const delivery = { ...data.delivery, customerName: customer.name || data.delivery.customerName };
  const message = orderMessage(delivery, data.lines, catalog, customer.id, customer.exempt);
  await sheetsRequest('/values/הזמנות!A:R:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { method: 'POST', body: JSON.stringify({ values: [[new Date().toISOString(), delivery.date, '', data.id, customer.id, delivery.customerName, `${delivery.contact} | ${delivery.phone}`, delivery.address, '', '', data.lines.map(l => `${l.sku} | ${catalog.find(p => p.sku === l.sku)?.name} | ${l.quantity}`).join('\n'), totals.tons, totals.deposits.find(p => p.sku === '60002')?.quantity ?? 0, totals.deposits.filter(p => p.sku !== '60002').reduce((s,p) => s+p.quantity,0), '', 'ממתינה לאישור', '', [delivery.project ? `פרויקט: ${delivery.project}` : '', delivery.notes].filter(Boolean).join('\n')]] }) });
  return { id: data.id, message };
});
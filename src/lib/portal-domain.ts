import { z } from 'zod';

export const NEW_CUSTOMER_ID = '500500';
export const phoneSchema = z.string().trim().transform(v => v.replace(/[\s()-]/g, '').replace(/^\+972/, '0')).pipe(z.string().regex(/^05\d{8}$/, 'יש להזין מספר נייד ישראלי תקין'));
export const deliverySchema = z.object({
  customerName: z.string().trim().min(2, 'יש להזין שם לקוח או חברה').max(100),
  project: z.string().trim().max(100),
  address: z.string().trim().min(5, 'יש להזין כתובת אספקה מלאה').max(200),
  contact: z.string().trim().min(2, 'יש להזין איש קשר').max(100),
  phone: phoneSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'יש לבחור תאריך אספקה'),
  notes: z.string().trim().max(1000),
});
export type Delivery = z.infer<typeof deliverySchema>;
export type Product = { sku: string; name: string; category: string; unit: string; keywords: string; technical: string; deposit: string; weight: number; image: string; palletCapacity: number | null };
export type CartLine = { sku: string; quantity: number };
export type Customer = { id: string; name: string; phone: string; sites: string[]; preferredSite: string; exempt: boolean; linkedIds: string[] };
export type Order = { id: string; date: string; address: string; status: string; project: string; products: string; weight: string; lines: CartLine[] };
export type Document = { id: string; date: string; address: string; status: string; url: string; name: string };
export const cartSchema = z.array(z.object({ sku: z.string().regex(/^[\w-]{1,40}$/), quantity: z.number().int().min(1).max(100000) })).min(1, 'הסל ריק').max(200);
export const orderSchema = z.object({ id: z.string().uuid(), delivery: deliverySchema, lines: cartSchema });
export function normalizePhone(v: string) { return v.replace(/\D/g, '').replace(/^972/, '0'); }
export function matchesCustomer(id: string, customer: Customer) { return customer.id !== NEW_CUSTOMER_ID && [customer.id, ...customer.linkedIds].includes(id.trim()); }
export function safeDocumentUrl(v: string) { try { const u = new URL(v); return u.protocol === 'https:' && ['drive.google.com', 'docs.google.com'].includes(u.hostname) ? u.href : ''; } catch { return ''; } }
export function isCustomerProduct(name: string) { return !/הובלות?\s*(מנוף|משאית)|תוספת משטח מחולק|גלופה|מגורי עובדים|פריט ניסיון|פקדון|פיקדון/.test(name); }
export function calculateOrder(lines: CartLine[], products: Product[], exempt = false) {
  let weight = 0, sacks = 0, bigBags = 0, blocks = 0;
  const issues: string[] = [];
  for (const line of lines) {
    const p = products.find(p => p.sku === line.sku);
    if (!p) { issues.push('פריט לא זמין בקטלוג'); continue; }
    weight += p.weight * line.quantity;
    if (exempt) continue;
    if (/60002|שק גדול|בלה/.test(p.deposit)) bigBags += line.quantity;
    else if (/60006/.test(p.deposit)) {
      if (p.palletCapacity) blocks += Math.ceil(line.quantity / p.palletCapacity);
      else issues.push(`נדרשת בדיקת כמות בלוקים למשטח: ${p.name}`);
    } else if (/60060|40 שקים/.test(p.deposit) || (p.unit === 'שק' && /מלט|טיט|דבק|טיח/.test(p.name))) sacks += line.quantity;
  }
  const deposits = [
    { sku: '60060', name: 'משטח סבן פקדון', quantity: Math.ceil(sacks / 40) },
    { sku: '60002', name: 'שק גדול פקדון', quantity: bigBags },
    { sku: '60006', name: 'משטח בלוקים פקדון', quantity: blocks },
  ].filter(p => p.quantity > 0);
  return { weight, tons: weight / 1000, truck: weight <= 1500 ? 'טנדר' : weight <= 8000 ? 'מנוף בינוני' : 'מנוף כבד', deposits, issues };
}
export function orderMessage(delivery: Delivery, lines: CartLine[], products: Product[], customerId: string, exempt = false) {
  const totals = calculateOrder(lines, products, exempt);
  return [`*הזמנה חדשה | ח. סבן חומרי בניין*`, `לקוח: ${delivery.customerName} | ${customerId}`, delivery.project ? `פרויקט: ${delivery.project}` : '', `כתובת אספקה: ${delivery.address}`, `תאריך אספקה מבוקש: ${delivery.date}`, `איש קשר: ${delivery.contact} | ${delivery.phone}`, '', '*פריטים*', ...lines.map((l,i) => `${i+1}. ${l.sku} | ${products.find(p => p.sku === l.sku)?.name ?? 'פריט'} | ${l.quantity}`), ...totals.deposits.map(p => `${p.sku} | ${p.name} | ${p.quantity}`), '', `משקל מוצרים כולל: ${totals.weight.toLocaleString('he-IL')} ק״ג (${totals.tons.toFixed(2)} טון)`, delivery.notes ? `הערות: ${delivery.notes}` : ''].filter(Boolean).join('\n');
}
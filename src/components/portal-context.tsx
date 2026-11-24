import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { supabase } from '@/integrations/supabase/client';
import { getMyPortal } from '@/lib/portal.functions';
import { type Customer, type CartLine, type Delivery, type Order, type Document } from '@/lib/portal-domain';
import { toast } from 'sonner';
type PortalState = { cart: CartLine[]; setCart: (v: CartLine[]) => void; delivery: Delivery; setDelivery: (v: Delivery) => void; customer: Customer | null; orders: Order[]; documents: Document[]; authOpen: boolean; setAuthOpen: (v: boolean) => void; refresh: () => Promise<void>; signedIn: boolean; clear: () => void };
const PortalContext = createContext<PortalState | null>(null);
const initialDelivery: Delivery = { customerName:'',project:'',address:'',contact:'',phone:'',date:'',notes:'' };
export function PortalProvider({ children }: { children: ReactNode }) {
  const [cart,setCart] = useState<CartLine[]>([]), [delivery,setDelivery] = useState(initialDelivery), [customer,setCustomer] = useState<Customer|null>(null), [orders,setOrders] = useState<Order[]>([]), [documents,setDocuments] = useState<Document[]>([]), [authOpen,setAuthOpen] = useState(false), [ready,setReady] = useState(false), [signedIn,setSignedIn] = useState(false);
  const fetchPortal = useServerFn(getMyPortal);
  async function refresh() {
    const {data} = await supabase.auth.getSession();
    setSignedIn(Boolean(data.session));
    if (!data.session) { setCustomer(null);setOrders([]);setDocuments([]);return; }
    try { const p = await fetchPortal();setCustomer(p.customer);setOrders(p.orders);setDocuments(p.documents);setDelivery(d => ({...d,customerName:p.customer.name || d.customerName,phone:p.customer.phone,address:p.customer.preferredSite || d.address})); }
    catch(e) { toast.error(e instanceof Error ? e.message : 'לא ניתן לטעון את פרטי הלקוח'); }
  }
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem('saban-order-draft') ?? 'null'); if(saved && Array.isArray(saved.cart)) { setCart(saved.cart.filter((l:CartLine) => typeof l.sku==='string' && Number.isInteger(l.quantity) && l.quantity>0)); } } catch { /* Ignore damaged drafts. */ }
    setReady(true); void refresh();
    const { data } = supabase.auth.onAuthStateChange(() => { setTimeout(() => void refresh(),0); });
    return () => data.subscription.unsubscribe();
  },[]);
  useEffect(() => { if(ready) try { localStorage.setItem('saban-order-draft',JSON.stringify({cart})); } catch { /* Storage may be unavailable. */ } },[cart,ready]);
  function clear() { setCart([]);setDelivery(initialDelivery);localStorage.removeItem('saban-order-draft'); }
  return <PortalContext.Provider value={{cart,setCart,delivery,setDelivery,customer,orders,documents,authOpen,setAuthOpen,refresh,signedIn,clear}}>{children}</PortalContext.Provider>;
}
export function usePortal() { const context=useContext(PortalContext);if(!context)throw new Error('Portal context missing');return context; }
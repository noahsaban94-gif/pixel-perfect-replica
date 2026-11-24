import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { getMyPortalMagic } from '@/lib/portal.functions';
import { MAGIC_SESSION_STORAGE_KEY } from '@/lib/magic-session';
import { type Customer, type CartLine, type Delivery, type Order, type Document } from '@/lib/portal-domain';
import { toast } from 'sonner';

type PortalState = {
  cart: CartLine[];
  setCart: (v: CartLine[]) => void;
  delivery: Delivery;
  setDelivery: (v: Delivery) => void;
  customer: Customer | null;
  orders: Order[];
  documents: Document[];
  authOpen: boolean;
  setAuthOpen: (v: boolean) => void;
  refresh: () => Promise<void>;
  signedIn: boolean;
  clear: () => void;
  /** Signed magic session string (localStorage) */
  session: string | null;
  setSession: (s: string | null) => void;
};

const PortalContext = createContext<PortalState | null>(null);
const initialDelivery: Delivery = {
  customerName: '',
  project: '',
  address: '',
  contact: '',
  phone: '',
  date: '',
  notes: '',
};

export function PortalProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [delivery, setDelivery] = useState(initialDelivery);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [session, setSessionState] = useState<string | null>(null);

  const fetchPortal = useServerFn(getMyPortalMagic);

  function setSession(s: string | null) {
    setSessionState(s);
    try {
      if (s) localStorage.setItem(MAGIC_SESSION_STORAGE_KEY, s);
      else localStorage.removeItem(MAGIC_SESSION_STORAGE_KEY);
    } catch {
      /* private mode */
    }
  }

  async function refresh() {
    let token: string | null = session;
    if (!token) {
      try {
        token = localStorage.getItem(MAGIC_SESSION_STORAGE_KEY);
      } catch {
        token = null;
      }
    }
    if (!token) {
      setSignedIn(false);
      setCustomer(null);
      setOrders([]);
      setDocuments([]);
      return;
    }
    try {
      const p = await fetchPortal({ data: { session: token } });
      setSessionState(token);
      setSignedIn(true);
      setCustomer(p.customer);
      setOrders(p.orders);
      setDocuments(p.documents);
      setDelivery((d) => ({
        ...d,
        customerName: p.customer.name || d.customerName,
        phone: p.customer.phone || d.phone,
        address: p.customer.preferredSite || d.address,
      }));
    } catch (e) {
      setSignedIn(false);
      setCustomer(null);
      setSession(null);
      toast.error(e instanceof Error ? e.message : 'לא ניתן לטעון את פרטי הלקוח');
    }
  }

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('saban-order-draft') ?? 'null');
      if (saved && Array.isArray(saved.cart)) {
        setCart(
          saved.cart.filter(
            (l: CartLine) =>
              typeof l.sku === 'string' && Number.isInteger(l.quantity) && l.quantity > 0,
          ),
        );
      }
      const tok = localStorage.getItem(MAGIC_SESSION_STORAGE_KEY);
      if (tok) setSessionState(tok);
    } catch {
      /* ignore */
    }
    setReady(true);
    void refresh();
  }, []);

  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem('saban-order-draft', JSON.stringify({ cart }));
      } catch {
        /* ignore */
      }
    }
  }, [cart, ready]);

  function clear() {
    setCart([]);
    setDelivery(initialDelivery);
    localStorage.removeItem('saban-order-draft');
  }

  return (
    <PortalContext.Provider
      value={{
        cart,
        setCart,
        delivery,
        setDelivery,
        customer,
        orders,
        documents,
        authOpen,
        setAuthOpen,
        refresh,
        signedIn,
        clear,
        session,
        setSession,
      }}
    >
      {children}
    </PortalContext.Provider>
  );
}

export function usePortal() {
  const context = useContext(PortalContext);
  if (!context) throw new Error('Portal context missing');
  return context;
}

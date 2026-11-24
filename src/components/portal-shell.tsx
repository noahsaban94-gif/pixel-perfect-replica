import { Link, useLocation } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ClipboardList,
  FileCheck2,
  UserRound,
  Plus,
  Bell,
  ShieldCheck,
  Phone,
  ChevronLeft,
  LogOut,
  HardHat,
  LoaderCircle,
  Link2,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { usePortal } from './portal-context';
import { phoneSchema } from '@/lib/portal-domain';
import { registerPortalWorker } from '@/lib/pwa';
import { requestMagicLink } from '@/lib/portal.functions';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import brand from '@/assets/saban-brand.jpg.asset.json';

const nav = [
  { to: '/', label: 'הזמנה חדשה', Icon: Plus },
  { to: '/orders', label: 'ההזמנות שלי', Icon: ClipboardList },
  { to: '/documents', label: 'תעודות משלוח', Icon: FileCheck2 },
  { to: '/profile', label: 'הפרופיל שלי', Icon: UserRound },
] as const;

export function PortalShell({ children }: { children: ReactNode }) {
  const p = usePortal();
  const location = useLocation();
  useEffect(() => {
    void registerPortalWorker();
  }, []);
  const links = nav.map((n) => (
    <Link
      key={n.to}
      to={n.to}
      className={`nav-link ${location.pathname === n.to ? 'active' : ''}`}
    >
      <n.Icon size={19} />
      <span>{n.label}</span>
    </Link>
  ));
  return (
    <div className="portal-layout" dir="rtl">
      <aside className="sidebar">
        <Link to="/" aria-label="ח. סבן חומרי בניין">
          <div className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="brand-name">ח. סבן</div>
          <div className="text-sm mt-2 font-medium">
            חומרי בניין <span className="text-primary">(1994)</span>
          </div>
        </Link>
        <div className="sidebar-rule" />
        <div className="sidebar-caption mb-4">האיזור האישי שלך</div>
        <nav>{links}</nav>
        <div className="sidebar-bottom">
          <div className="flex gap-3 items-center mb-5">
            <HardHat size={28} className="text-primary" />
            <div>
              <div className="text-sm font-semibold">בונים איתכם. מאז 1994.</div>
              <div className="sidebar-caption mt-1">חומרים טובים. אנשים טובים.</div>
            </div>
          </div>
          <div className="sidebar-rule" />
          <div className="flex items-center gap-2 sidebar-caption">
            <ShieldCheck size={15} />
            פורטל לקוחות מאובטח
          </div>
          <div className="sidebar-caption mt-4">ח. סבן חומרי בניין (1994) בע״מ</div>
        </div>
      </aside>
      <header className="topbar">
        <div>
          <div className="topbar-title">
            ח. סבן <span className="text-muted-foreground font-normal">/ פורטל לקוחות</span>
          </div>
          <div className="topbar-subtitle">כל מה שצריך לבנייה, במקום אחד.</div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="התראות" onClick={() => p.setAuthOpen(true)}>
            <Bell size={19} />
          </Button>
          <div className="h-7 border-r border-border" />
          <Button variant="ghost" onClick={() => p.setAuthOpen(true)}>
            <UserRound size={18} />
            <span>{p.customer?.name || 'כניסה לחשבון'}</span>
            <ChevronLeft size={14} />
          </Button>
        </div>
      </header>
      {children}
      <nav className="mobile-nav">{links}</nav>
      <AuthDialog />
    </div>
  );
}

function AuthDialog() {
  const p = usePortal();
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [magicUrl, setMagicUrl] = useState('');
  const [customerName, setCustomerName] = useState('');
  const requestLink = useServerFn(requestMagicLink);

  async function submit() {
    setError('');
    setMagicUrl('');
    const result = phoneSchema.safeParse(phone);
    if (!result.success) {
      setError('יש להזין מספר נייד תקין');
      return;
    }
    setBusy(true);
    try {
      const baseUrl = window.location.origin;
      const res = await requestLink({ data: { phone: result.data, baseUrl } });
      setMagicUrl(res.magicUrl);
      setCustomerName(res.name || '');
      toast.success('נוצר קישור אישי ללקוח');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'יצירת הקישור נכשלה');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!magicUrl) return;
    try {
      await navigator.clipboard.writeText(magicUrl);
      toast.success('הקישור הועתק – ניתן לשלוח בוואטסאפ');
    } catch {
      toast.error('לא ניתן להעתיק');
    }
  }

  return (
    <Dialog open={p.authOpen} onOpenChange={p.setAuthOpen}>
      <DialogContent dir="rtl">
        <img
          src={brand.url}
          alt="ח. סבן חומרי בניין (1994) בע״מ"
          className="brand-dialog"
        />
        <DialogTitle className="text-right">
          {p.signedIn ? 'החשבון שלך' : 'כניסה עם קישור אישי'}
        </DialogTitle>
        <DialogDescription className="text-right">
          {p.signedIn
            ? 'ניהול החשבון האישי שלך'
            : 'הזן נייד רשום – ייווצר קישור חד־פעמי שמתועד בתיק הלקוח'}
        </DialogDescription>

        {p.signedIn ? (
          <>
            <p className="text-sm">
              {p.customer?.name || 'לקוח מאומת'}
              {p.customer?.id ? (
                <span className="text-muted-foreground"> · {p.customer.id}</span>
              ) : null}
            </p>
            <Button
              variant="outline"
              onClick={() => {
                p.setSession(null);
                p.clear();
                void p.refresh();
                p.setAuthOpen(false);
              }}
            >
              <LogOut />
              התנתקות
            </Button>
          </>
        ) : (
          <>
            <label className="field-label" htmlFor="login-phone">
              מספר הטלפון בכרטיס הלקוח
            </label>
            <Input
              id="login-phone"
              type="tel"
              dir="ltr"
              maxLength={16}
              placeholder="050-000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Button onClick={submit} disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Link2 />}
              יצירת קישור כניסה אישי
            </Button>

            {magicUrl ? (
              <div className="notice success-notice space-y-2">
                <div className="font-medium">
                  {customerName ? `לקוח: ${customerName}` : 'הקישור מוכן'}
                </div>
                <p className="text-xs break-all dir-ltr text-left">{magicUrl}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={copyLink}>
                    <Copy size={14} />
                    העתק קישור
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent('קישור כניסה לפורטל סבן:\n' + magicUrl)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Phone size={14} />
                      שלח בוואטסאפ
                    </a>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  הטוקן נשמר בעמודת לינק/טוקן בגיליון תיקי הלקוחות. הלקוח לוחץ על הקישור
                  ונכנס ישירות.
                </p>
              </div>
            ) : null}

            {error ? (
              <p className="input-error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="notice">
              <ShieldCheck size={20} />
              <span>
                הפרטים והמסמכים מוצגים רק אחרי כניסה עם הקישור האישי. אין צורך ב-SMS.
              </span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

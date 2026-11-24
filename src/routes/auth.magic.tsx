import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { LoaderCircle, ShieldCheck } from 'lucide-react';
import { redeemMagicLink } from '@/lib/portal.functions';
import { usePortal } from '@/components/portal-context';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/auth/magic')({
  validateSearch: (s: Record<string, unknown>) => ({
    t: typeof s.t === 'string' ? s.t : '',
  }),
  component: MagicAuthPage,
});

function MagicAuthPage() {
  const { t: token } = Route.useSearch();
  const navigate = useNavigate();
  const portal = usePortal();
  const redeem = useServerFn(redeemMagicLink);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('חסר טוקן בקישור');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await redeem({ data: { token } });
        if (cancelled) return;
        portal.setSession(res.session);
        await portal.refresh();
        setDone(true);
        setTimeout(() => {
          void navigate({ to: '/' });
        }, 800);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'הקישור אינו תקין');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="portal-main flex min-h-[50vh] items-center justify-center">
      <div className="max-w-md text-center space-y-4 p-6">
        {!error && !done ? (
          <>
            <LoaderCircle className="mx-auto animate-spin text-primary" size={36} />
            <h1 className="text-xl font-bold">מתחברים לפורטל סבן…</h1>
            <p className="text-muted-foreground text-sm">מאמתים את הקישור האישי שלך</p>
          </>
        ) : null}
        {done ? (
          <>
            <ShieldCheck className="mx-auto text-primary" size={36} />
            <h1 className="text-xl font-bold">התחברת בהצלחה</h1>
            <p className="text-muted-foreground text-sm">מעבירים להזמנה…</p>
          </>
        ) : null}
        {error ? (
          <>
            <h1 className="text-xl font-bold">לא ניתן להתחבר</h1>
            <p className="input-error">{error}</p>
            <Button onClick={() => void navigate({ to: '/' })}>חזרה לפורטל</Button>
          </>
        ) : null}
      </div>
    </main>
  );
}

import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { FileCheck2, LockKeyhole, Eye } from 'lucide-react';
import { usePortal } from '@/components/portal-context';
import { Button } from '@/components/ui/button';
import {
  DocumentCanvasModal,
  type CustomerDocumentItem,
} from '@/components/DocumentCanvasModal';

export const Route = createFileRoute('/documents')({
  head: () => ({
    meta: [
      { title: 'תעודות משלוח | ח. סבן' },
      {
        name: 'description',
        content: 'צפייה מאובטחת בתעודות המשלוח ובמסמכים החתומים של החשבון שלך.',
      },
      { property: 'og:title', content: 'תעודות משלוח | ח. סבן' },
      { property: 'og:description', content: 'מסמכי האספקה האישיים שלך, זמינים לאחר אימות.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: Documents,
});

function Documents() {
  const p = usePortal();
  const [activeDoc, setActiveDoc] = useState<CustomerDocumentItem | null>(null);

  return (
    <main className="portal-main">
      <div className="page-heading">
        <div>
          <h1>תעודות משלוח</h1>
          <p>כל מסמכי האספקה שלך, מסודרים וזמינים.</p>
        </div>
      </div>

      {!p.customer ? (
        <div className="empty-page">
          <LockKeyhole />
          <h2 className="text-xl font-bold">המסמכים שלך מוגנים</h2>
          <p>יש לאמת את הנייד לפני צפייה בתעודות משלוח.</p>
          <Button onClick={() => p.setAuthOpen(true)}>כניסה לחשבון</Button>
        </div>
      ) : !p.documents.length ? (
        <div className="empty-page">
          <FileCheck2 />
          <h2 className="text-xl font-bold">אין תעודות משלוח להצגה</h2>
          <p>תעודות המשלוח יופיעו כאן לאחר האספקה.</p>
        </div>
      ) : (
        p.documents.map((d, i) => (
          <article key={`${d.id}-${i}`} className="record-row">
            <FileCheck2 className="text-success" />
            <div className="flex-1">
              <h3>{d.name}</h3>
              <p>
                {d.date} · {d.address}
              </p>
            </div>
            <span className="status-tag">{d.status}</span>
            <Button variant="outline" onClick={() => setActiveDoc(d)}>
              <Eye />
              צפייה במסמך
            </Button>
          </article>
        ))
      )}

      <DocumentCanvasModal doc={activeDoc} onClose={() => setActiveDoc(null)} />
    </main>
  );
}

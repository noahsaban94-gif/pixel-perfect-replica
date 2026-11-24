import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  FileCheck2,
  LockKeyhole,
  Eye,
  ChevronDown,
  ChevronUp,
  Truck,
  Clock,
  Package,
} from 'lucide-react';
import { usePortal } from '@/components/portal-context';
import { Button } from '@/components/ui/button';
import {
  DocumentCanvasModal,
  type CustomerDocumentItem,
} from '@/components/DocumentCanvasModal';

export type ExtendedDocumentItem = CustomerDocumentItem & {
  itemsText?: string;
  depositsText?: string;
  craneNotes?: string;
  driver?: string;
  truck?: string;
  stayMinutes?: string;
  ituranArrival?: string;
  ituranExit?: string;
  ptoStart?: string;
  ptoEnd?: string;
  ptoMinutes?: string;
};

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
  const [activeDoc, setActiveDoc] = useState<ExtendedDocumentItem | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const docs = (p.documents ?? []) as ExtendedDocumentItem[];

  return (
    <main className="portal-main">
      <div className="page-heading">
        <div>
          <h1>תעודות משלוח</h1>
          <p>כל מסמכי האספקה שלך, מסודרים וזמינים. לחץ על שורה להצגת פריטים וזמני מנוף.</p>
        </div>
      </div>

      {!p.customer ? (
        <div className="empty-page">
          <LockKeyhole />
          <h2 className="text-xl font-bold">המסמכים שלך מוגנים</h2>
          <p>יש לאמת את הנייד לפני צפייה בתעודות משלוח.</p>
          <Button onClick={() => p.setAuthOpen(true)}>כניסה לחשבון</Button>
        </div>
      ) : !docs.length ? (
        <div className="empty-page">
          <FileCheck2 />
          <h2 className="text-xl font-bold">אין תעודות משלוח להצגה</h2>
          <p>תעודות המשלוח יופיעו כאן לאחר האספקה.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map((d, i) => {
            const rowKey = `${d.id}-${i}`;
            const isExpanded = expandedKey === rowKey;
            const itemLines = (d.itemsText || '')
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter(Boolean);

            return (
              <div
                key={rowKey}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm transition"
              >
                {/* שורת תעודה ראשית — לחיצה להרחבה */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedKey(isExpanded ? null : rowKey)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setExpandedKey(isExpanded ? null : rowKey);
                    }
                  }}
                  className="record-row cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                >
                  <FileCheck2 className="text-success shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3>{d.name}</h3>
                    <p>
                      {d.date} · {d.address}
                    </p>
                  </div>
                  <span className="status-tag">{d.status}</span>

                  <div
                    className="flex items-center gap-2 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveDoc(d)}
                    >
                      <Eye className="w-4 h-4" />
                      צפייה במסמך
                    </Button>
                    <button
                      type="button"
                      onClick={() => setExpandedKey(isExpanded ? null : rowKey)}
                      className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                      aria-label={isExpanded ? 'כווץ פרטים' : 'הרחב פרטים'}
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* פאנל נתונים מורחב הנפתח כלפי מטה */}
                {isExpanded && (
                  <div
                    dir="rtl"
                    className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 p-4 space-y-4 text-sm"
                  >
                    {/* נתוני נהג וזמני מנוף / איתוראן */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-1">
                          <Truck className="w-3.5 h-3.5 text-amber-600" />
                          <span>נהג ומשאית</span>
                        </div>
                        <div className="font-bold text-slate-900 dark:text-white">
                          {d.driver || '—'} {d.truck ? `· ${d.truck}` : ''}
                        </div>
                      </div>

                      <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-1">
                          <Clock className="w-3.5 h-3.5 text-emerald-600" />
                          <span>סשן מנוף (PTO איתוראן)</span>
                        </div>
                        <div className="font-bold text-slate-900 dark:text-white">
                          {d.ptoStart || d.ptoEnd
                            ? `${d.ptoStart || '—'} עד ${d.ptoEnd || '—'}${d.ptoMinutes ? ` (${d.ptoMinutes} דק׳)` : ''}`
                            : d.craneNotes || 'ללא נתוני מנוף'}
                        </div>
                      </div>

                      <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-1">
                          <Clock className="w-3.5 h-3.5 text-blue-600" />
                          <span>זמן באתר (איתוראן)</span>
                        </div>
                        <div className="font-bold text-slate-900 dark:text-white">
                          {d.ituranArrival || d.ituranExit
                            ? `${d.ituranArrival || '—'} → ${d.ituranExit || '—'}${d.stayMinutes ? ` (${d.stayMinutes} דק׳)` : ''}`
                            : d.stayMinutes
                              ? `${d.stayMinutes} דקות באתר`
                              : '—'}
                        </div>
                      </div>
                    </div>

                    {/* פירוט פריטים */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl p-3.5 border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                        <Package className="w-4 h-4 text-amber-600" />
                        <span>פריטים שסופקו בתעודה</span>
                      </div>
                      {itemLines.length > 0 ? (
                        <ul className="space-y-1 text-xs sm:text-sm text-slate-800 dark:text-slate-200">
                          {itemLines.map((line, idx) => (
                            <li
                              key={idx}
                              className="py-1 border-b border-slate-100 dark:border-slate-800 last:border-0"
                            >
                              {idx + 1}. {line}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-slate-500">אין פירוט פריטים רשום לשורה זו.</p>
                      )}
                    </div>

                    {/* פקדונות והערות מנוף */}
                    {(d.depositsText || d.craneNotes) && (
                      <div className="flex flex-wrap gap-3 text-xs">
                        {d.depositsText && (
                          <div className="bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-1.5">
                            <span className="font-bold">פקדונות: </span>
                            {d.depositsText}
                          </div>
                        )}
                        {d.craneNotes && (
                          <div className="bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-1.5">
                            <span className="font-bold">הערות מנוף/המתנה: </span>
                            {d.craneNotes}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <DocumentCanvasModal doc={activeDoc} onClose={() => setActiveDoc(null)} />
    </main>
  );
}

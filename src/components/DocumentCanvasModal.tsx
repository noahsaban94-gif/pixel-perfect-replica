import React, { useEffect } from 'react';
import { X, ExternalLink, FileText, MapPin, Calendar } from 'lucide-react';

export type CustomerDocumentItem = {
  id: string;
  date: string;
  address: string;
  status: string;
  url: string;
  name: string;
};

/**
 * ממיר קישור Google Drive (file/d/.../view או ?id=...) לכתובת /preview להצגה בקנבס פנימי
 */
export function toDrivePreviewUrl(rawUrl: string): {
  previewUrl: string;
  isFolder: boolean;
} {
  if (!rawUrl) return { previewUrl: '', isFolder: false };
  try {
    const u = new URL(rawUrl);
    if (u.hostname.includes('drive.google.com')) {
      const folderMatch = u.pathname.match(/\/folders\/([\w-]+)/);
      if (folderMatch?.[1]) {
        return {
          previewUrl: `https://drive.google.com/embeddedfolderview?id=${folderMatch[1]}#list`,
          isFolder: true,
        };
      }
      const fileMatch = u.pathname.match(/\/file\/d\/([\w-]+)/);
      const id = fileMatch?.[1] ?? u.searchParams.get('id');
      if (id) {
        return {
          previewUrl: `https://drive.google.com/file/d/${id}/preview`,
          isFolder: false,
        };
      }
    }
    return { previewUrl: rawUrl, isFolder: false };
  } catch {
    return { previewUrl: rawUrl, isFolder: false };
  }
}

type Props = {
  doc: CustomerDocumentItem | null;
  onClose: () => void;
};

export function DocumentCanvasModal({ doc, onClose }: Props) {
  useEffect(() => {
    if (!doc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc, onClose]);

  if (!doc) return null;

  const { previewUrl } = toDrivePreviewUrl(doc.url);

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-2 sm:p-5"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[90vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* כותרת הקנבס */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                {doc.name || `תעודת משלוח ${doc.id}`}
              </h3>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                {doc.date && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {doc.date}
                  </span>
                )}
                {doc.address && (
                  <span className="inline-flex items-center gap-1 truncate max-w-xs">
                    <MapPin className="w-3.5 h-3.5" />
                    {doc.address}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {doc.url && (
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-200/80 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>פתח בחלון חדש</span>
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 dark:hover:text-white transition"
              aria-label="סגור תצוגה"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* גוף הקנבס — תצוגת PDF / Drive */}
        <div className="flex-1 bg-slate-100 dark:bg-slate-950 relative">
          {previewUrl ? (
            <iframe
              src={previewUrl}
              title={doc.name}
              className="w-full h-full border-0"
              allow="autoplay"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 p-6 text-center">
              <FileText className="w-12 h-12 mb-2 text-slate-400" />
              <p className="font-semibold text-sm">קובץ הסריקה עדיין לא קושר לתעודה זו</p>
              <p className="text-xs text-slate-400 mt-1">
                מספר תעודה: {doc.id} · כתובת: {doc.address || '—'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/*
 * חיבור מהיר בתוך מסך התעודות (documents.tsx):
 *
 * const [activeDoc, setActiveDoc] = useState<CustomerDocumentItem | null>(null);
 *
 * // בכפתור "צפייה במסמך":
 * <button type="button" onClick={() => setActiveDoc(doc)}>
 *   צפייה במסמך
 * </button>
 *
 * // בתחתית ה-JSX:
 * <DocumentCanvasModal doc={activeDoc} onClose={() => setActiveDoc(null)} />
 */

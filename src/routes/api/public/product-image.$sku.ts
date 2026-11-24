import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
export const Route = createFileRoute('/api/public/product-image/$sku')({ server: { handlers: {
  GET: async ({ params }) => {
    const parsed = z.string().regex(/^[\w-]{1,40}$/).safeParse(params.sku);
    if (!parsed.success) return new Response(null, {status:400});
    const { readCatalog } = await import('@/lib/sheets.server');
    const src = (await readCatalog()).find(p=>p.sku===parsed.data)?.image ?? '';
    if (!src) return new Response(null, { status: 404 });
    let url: URL;
    try { url = new URL(src); } catch { return new Response(null, { status: 404 }); }
    const hosts = ['i.ibb.co', 'www.builderdepot.co.uk', 'www.cubag.co.nz', 'drive.google.com', 'lh3.googleusercontent.com'];
    if (url.protocol !== 'https:' || !hosts.includes(url.hostname)) return new Response(null, { status: 404 });
    const fileId = url.pathname.match(/\/file\/d\/([\w-]+)/)?.[1];
    if (fileId) url = new URL(`https://drive.google.com/thumbnail?id=${fileId}&sz=w600`);
    const res = await fetch(url.href, { redirect: 'manual' });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) return new Response(null, { status: 404 });
    return new Response(res.body, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
  },
} } });
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { getCatalog, toThumbnailUrl } from '@/lib/new-order-api';

const PLACEHOLDER_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <rect width="600" height="400" fill="#f1f5f9"/>
  <rect x="220" y="140" width="160" height="100" rx="12" fill="#cbd5e1"/>
  <text x="300" y="280" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="#64748b">אין תמונה</text>
</svg>`;

function placeholder() {
  return new Response(PLACEHOLDER_SVG, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Hosts we trust for product photos (catalog is internal; still avoid open proxy). */
const ALLOWED_HOST_SUFFIXES = [
  'ibb.co',
  'google.com',
  'googleusercontent.com',
  'ggpht.com',
  'cloudfront.net',
  'b-cdn.net',
  'amazonaws.com',
  'probuilder.co.il',
  'gilar.co.il',
  'amrusi.co.il',
  'asbit.co.il',
  'brandtools.co.il',
  'cnaanc.co.il',
  'carmit-mrfix.com',
  'termokir.co.il',
  'rotenbergacoustics.co.il',
  'vecteezy.com',
  'builderdepot.co.uk',
  'cubag.co.nz',
  'wp.com',
  'wordpress.com',
];

function hostAllowed(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some(
    (s) => h === s || h.endsWith('.' + s),
  );
}

export const Route = createFileRoute('/api/public/product-image/$sku')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const parsed = z.string().regex(/^[\w-]{1,40}$/).safeParse(params.sku);
        if (!parsed.success) return placeholder();

        try {
          const products = await getCatalog();
          const src = products.find((p) => p.sku === parsed.data)?.image ?? '';
          if (!src) return placeholder();

          let url: URL;
          try {
            url = new URL(toThumbnailUrl(src) || src);
          } catch {
            return placeholder();
          }

          if (url.protocol !== 'https:' || !hostAllowed(url.hostname)) {
            return placeholder();
          }

          const res = await fetch(url.href, {
            redirect: 'follow',
            headers: {
              // Some CDNs block empty UA
              'User-Agent': 'SabanPortalImageProxy/1.0',
              Accept: 'image/*,*/*;q=0.8',
            },
          });
          const type = res.headers.get('content-type') ?? '';
          if (!res.ok || !type.startsWith('image/')) {
            return placeholder();
          }

          return new Response(res.body, {
            headers: {
              'Content-Type': type,
              'Cache-Control': 'public, max-age=86400',
              'X-Content-Type-Options': 'nosniff',
            },
          });
        } catch {
          return placeholder();
        }
      },
    },
  },
});

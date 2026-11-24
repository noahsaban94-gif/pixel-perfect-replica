export async function registerPortalWorker() {
  if (!('serviceWorker' in navigator)) return;
  const host = window.location.hostname.toLowerCase();
  const preview = /\.(lovable\.app|gpt-eng\.com|gptengineer\.run)$/.test(host) && (/^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/.test(host.split('.')[0] ?? '') || /^project--.+-dev\./.test(host));
  const excluded = !import.meta.env.PROD || window.self !== window.top || preview || /(^|\.)(lovableproject\.com|lovableproject-dev\.com|beta\.lovable\.dev)$/.test(host) || new URLSearchParams(window.location.search).get('sw') === 'off';
  if (excluded) { const registrations = await navigator.serviceWorker.getRegistrations(); await Promise.all(registrations.filter(r => [r.active?.scriptURL,r.waiting?.scriptURL,r.installing?.scriptURL].some(u => u && new URL(u).pathname === '/sw.js')).map(r => r.unregister())); return; }
  await navigator.serviceWorker.register('/sw.js');
}
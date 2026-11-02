import { resolveTenant, diag } from './tenant.js';
import { isLocal } from './env.js';
import { applyTheme } from './theme.js';
import { applyBrand } from './brand.js';
import { h } from './dom.js';
import { renderHeader, renderFooter } from './layout.js';

export function fatal(title, text) {
  document.title = title;
  document.getElementById('site-header').replaceChildren();
  document.getElementById('site-footer').replaceChildren();
  document.getElementById('main').replaceChildren(h('section', { class: 'section' },
    h('div', { class: 'container' }, h('h1', { class: 'section-title', text: title }), h('p', { class: 'empty', text }))));
}

// Menentukan tenant, menerapkan tema, menggambar header/footer. Mengembalikan tenant atau null.
export async function bootPage(pageTitle) {
  let tenant;
  try { tenant = await resolveTenant(); }
  catch (e) { console.error(e); fatal('Tidak dapat memuat situs', 'Data belum dapat dimuat. Periksa koneksi lalu muat ulang halaman.'); return null; }
  if (!tenant) {
    fatal('Situs tidak ditemukan', 'Alamat ini belum terhubung ke situs mana pun.' + (isLocal && diag.reason ? ` [dev: ${diag.reason}]` : ''));
    return null;
  }
  applyTheme(tenant.theme);
  applyBrand(tenant);
  document.title = `${pageTitle} — ${tenant.brandName}`;
  renderHeader(tenant);
  renderFooter(tenant);
  return tenant;
}

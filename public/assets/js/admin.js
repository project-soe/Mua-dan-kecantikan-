import {
  adminAuth, adminDb, doc, getDoc, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, sendEmailVerification,
} from './admin-firebase.js';
import { resolveTenant } from './tenant.js';
import { applyTheme } from './theme.js';
import { h } from './dom.js';
import { askDialog, toast } from './admin-ui.js';
import { mountBookings } from './admin-bookings.js';
import { mountOrders } from './admin-orders.js';
import { mountPayments } from './admin-payments.js';
import { mountCatalog } from './admin-catalog.js';
import { mountBrand } from './admin-brand.js';
import { mountHours } from './admin-hours.js';
import { mountPayMethods } from './admin-paymethods.js';
import { mountReviews } from './admin-reviews.js';
import { tabsFor, defaultTab, groupTabs } from './admin-nav.js';

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', content_manager: 'Content Manager', finance_manager: 'Finance Manager' };
const S = { tenant: null };
const root = () => document.getElementById('admin-root');

const MOUNTS = {
  booking: mountBookings,
  pesanan: mountOrders,
  pembayaran: mountPayments,
  produk: (el, c) => mountCatalog(el, c, 'produk'),
  layanan: (el, c) => mountCatalog(el, c, 'layanan'),
  portfolio: (el, c) => mountCatalog(el, c, 'portfolio'),
  testimoni: mountReviews,
  brand: mountBrand,
  jam: mountHours,
  metode: mountPayMethods,
};

// Layar tanpa kerangka (masuk, verifikasi email, tanpa akses): kartu di tengah.
function authScreen(...content) {
  root().replaceChildren(h('main', { id: 'admin-main', class: 'auth' }, h('div', { class: 'auth__card' },
    h('p', { class: 'auth__brand', text: S.tenant.brandName }),
    h('p', { class: 'auth__sub', text: 'Panel admin' }),
    content)));
}

async function logout() {
  await signOut(adminAuth);
  history.replaceState(null, '', location.pathname + location.search);
  showLogin();
}

function showLogin(msg = '') {
  const err = h('p', { class: 'alert', role: 'alert', hidden: !msg, text: msg });
  const show = (t) => { err.hidden = false; err.textContent = t; };
  const email = h('input', { class: 'input', id: 'email', type: 'email', autocomplete: 'username' });
  const pass = h('input', { class: 'input', id: 'password', type: 'password', autocomplete: 'current-password' });
  const btn = h('button', { class: 'btn', type: 'submit', text: 'Masuk' });
  const form = h('form', { class: 'form', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    if (!email.value.trim() || !pass.value) return show('Isi email dan kata sandi.');
    btn.disabled = true; btn.textContent = 'Memeriksa…';
    let cred;
    try { cred = await signInWithEmailAndPassword(adminAuth, email.value.trim(), pass.value); }
    catch (e2) {
      show(e2?.code === 'auth/too-many-requests' ? 'Terlalu banyak percobaan. Coba lagi beberapa saat.' : 'Email atau kata sandi salah.');
      btn.disabled = false; btn.textContent = 'Masuk';
      return;
    }
    await enter(cred.user);
  } },
  h('div', { class: 'field' }, h('label', { for: 'email', text: 'Email' }), email),
  h('div', { class: 'field' }, h('label', { for: 'password', text: 'Kata sandi' }), pass),
  err, btn,
  h('button', { class: 'btn btn--ghost btn--small', type: 'button', text: 'Lupa kata sandi?', onclick: async () => {
    const r = await askDialog({ title: 'Reset kata sandi', text: 'Masukkan email akun admin Anda.',
      fields: [{ name: 'email', label: 'Email', type: 'text', value: email.value.trim(), required: true }], confirmLabel: 'Kirim tautan' });
    if (!r) return;
    try { await sendPasswordResetEmail(adminAuth, r.email); } catch { /* jangan bocorkan apakah email terdaftar */ }
    toast('Jika email terdaftar, tautan reset telah dikirim.');
  } }));
  authScreen(h('h1', { text: 'Masuk' }), form);
}

function showVerify(user) {
  authScreen(
    h('h1', { text: 'Verifikasi email' }),
    h('p', { class: 'notice', text: `Email ${user.email} belum terverifikasi. Akses admin mensyaratkan email terverifikasi.` }),
    h('div', { class: 'hist__actions' },
      h('button', { class: 'btn', type: 'button', text: 'Kirim ulang email verifikasi', onclick: async () => {
        try { await sendEmailVerification(user); toast('Email verifikasi dikirim.'); } catch { toast('Gagal mengirim. Coba lagi nanti.'); }
      } }),
      h('button', { class: 'btn btn--ghost', type: 'button', text: 'Saya sudah verifikasi', onclick: () => enter(user) }),
      h('button', { class: 'btn btn--ghost', type: 'button', text: 'Keluar', onclick: logout })));
}

function showNoAccess() {
  authScreen(
    h('h1', { text: 'Tidak ada akses' }),
    h('p', { class: 'notice', text: 'Akun ini tidak memiliki akses admin ke situs ini.' }),
    h('button', { class: 'btn btn--ghost', type: 'button', text: 'Keluar', onclick: logout }));
}

async function enter(user) {
  try { await user.reload(); await user.getIdToken(true); } catch { /* lanjut dengan data yang ada */ }
  if (!user.emailVerified) return showVerify(user);
  let m = null;
  try {
    const snap = await getDoc(doc(adminDb, 'tenants', S.tenant.id, 'memberships', user.uid));
    m = snap.exists() ? snap.data() : null;
  } catch (e) { if (e?.code !== 'permission-denied') console.error(e); }
  if (!m || m.status !== 'active') return showNoAccess();
  showApp(user, m.role);
}

// Kerangka: bilah atas, menu (kiri di layar lebar, geser mendatar di ponsel), judul halaman, isi.
function showApp(user, role) {
  const tabs = tabsFor(role);
  const body = h('div', { id: 'admin-content' });
  const headTitle = h('h1', {});
  const headDesc = h('p', {});
  const nav = h('nav', { class: 'snav', 'aria-label': 'Menu admin' });
  for (const g of groupTabs(tabs)) {
    nav.append(h('p', { class: 'snav__group', text: g.group }));
    for (const t of g.tabs) nav.append(h('button', { class: 'snav__item', type: 'button', 'data-key': t.key, text: t.label, onclick: () => select(t.key) }));
  }

  function select(key) {
    const tab = tabs.find((t) => t.key === key) ?? tabs[0];
    nav.querySelectorAll('.snav__item').forEach((b) => {
      const on = b.dataset.key === tab.key;
      b.setAttribute('aria-current', on ? 'page' : 'false');
      if (on) b.scrollIntoView({ inline: 'center', block: 'nearest' });
    });
    headTitle.textContent = tab.title;
    headDesc.textContent = tab.desc;
    document.title = `${tab.title} — Admin ${S.tenant.brandName}`;
    history.replaceState(null, '', `#${tab.key}`);
    body.replaceChildren(h('div', { class: 'skeleton', style: 'height:8rem' }));
    MOUNTS[tab.key](body, { tenant: S.tenant, role, user });
  }

  root().replaceChildren(h('div', { class: 'shell' },
    h('header', { class: 'appbar' },
      h('span', { class: 'appbar__brand', text: S.tenant.brandName }),
      h('span', { class: 'appbar__user', text: `${user.email} · ${ROLE_LABEL[role] ?? role}` }),
      h('button', { class: 'btn btn--small', type: 'button', text: 'Keluar', onclick: logout })),
    nav,
    h('main', { id: 'admin-main', class: 'smain' }, h('header', { class: 'ahead' }, headTitle, headDesc), body)));

  const fromHash = location.hash.slice(1);
  select(tabs.some((t) => t.key === fromHash) ? fromHash : defaultTab(role));
}

async function start() {
  try { S.tenant = await resolveTenant(); }
  catch (e) { console.error(e); S.tenant = null; }
  if (!S.tenant) {
    root().replaceChildren(h('main', { class: 'auth' }, h('div', { class: 'auth__card' },
      h('h1', { text: 'Situs tidak ditemukan' }),
      h('p', { class: 'empty', text: 'Alamat ini belum terhubung ke situs mana pun.' }))));
    return;
  }
  applyTheme(S.tenant.theme);
  document.title = `Admin — ${S.tenant.brandName}`;
  await adminAuth.authStateReady();
  if (adminAuth.currentUser) await enter(adminAuth.currentUser);
  else showLogin();
}

start();

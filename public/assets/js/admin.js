import {
  adminAuth, adminDb, doc, getDoc, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, sendEmailVerification,
} from './admin-firebase.js';
import { resolveTenant } from './tenant.js';
import { applyTheme } from './theme.js';
import { h } from './dom.js';
import { askDialog, toast } from './admin-ui.js';
import { mountBookings } from './admin-bookings.js';
import { mountPayments } from './admin-payments.js';
import { mountCatalog } from './admin-catalog.js';
import { mountBrand } from './admin-brand.js';
import { mountHours } from './admin-hours.js';

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', content_manager: 'Content Manager', finance_manager: 'Finance Manager' };
const S = { tenant: null };
const root = () => document.getElementById('admin-root');

function render(rightOfBar, ...content) {
  root().replaceChildren(
    h('header', { class: 'site-header' }, h('div', { class: 'container site-header__inner' },
      h('span', { class: 'brand', text: `${S.tenant.brandName} · Admin` }), rightOfBar ?? null)),
    h('main', { id: 'admin-main', class: 'container admin-wrap' }, content));
}

async function logout() {
  await signOut(adminAuth);
  showLogin();
}

function showLogin(msg = '') {
  const err = h('p', { class: 'alert', role: 'alert', hidden: !msg, text: msg });
  const show = (t) => { err.hidden = false; err.textContent = t; };
  const email = h('input', { class: 'input', id: 'email', type: 'email', autocomplete: 'username' });
  const pass = h('input', { class: 'input', id: 'password', type: 'password', autocomplete: 'current-password' });
  const btn = h('button', { class: 'btn', type: 'submit', text: 'Masuk' });
  const form = h('form', { class: 'form narrow', novalidate: true, onsubmit: async (e) => {
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
  render(null, h('h1', { class: 'section-title', text: 'Masuk' }), form);
}

function showVerify(user) {
  render(null,
    h('h1', { class: 'section-title', text: 'Verifikasi email' }),
    h('p', { class: 'notice narrow', text: `Email ${user.email} belum terverifikasi. Akses admin mensyaratkan email terverifikasi.` }),
    h('div', { class: 'hist__actions' },
      h('button', { class: 'btn', type: 'button', text: 'Kirim ulang email verifikasi', onclick: async () => {
        try { await sendEmailVerification(user); toast('Email verifikasi dikirim.'); } catch { toast('Gagal mengirim. Coba lagi nanti.'); }
      } }),
      h('button', { class: 'btn btn--ghost', type: 'button', text: 'Saya sudah verifikasi', onclick: () => enter(user) }),
      h('button', { class: 'btn btn--ghost', type: 'button', text: 'Keluar', onclick: logout })));
}

function showNoAccess() {
  render(null,
    h('h1', { class: 'section-title', text: 'Tidak ada akses' }),
    h('p', { class: 'notice narrow', text: 'Akun ini tidak memiliki akses admin ke situs ini.' }),
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

function showApp(user, role) {
  const tabs = [['booking', 'Booking', mountBookings]];
  if (['owner', 'finance_manager'].includes(role)) tabs.push(['pembayaran', 'Pembayaran', mountPayments]);
  if (['owner', 'admin', 'content_manager'].includes(role)) {
    for (const [key, label] of [['produk', 'Produk'], ['layanan', 'Layanan'], ['portfolio', 'Portfolio']]) {
      tabs.push([key, label, (el, c) => mountCatalog(el, c, key)]);
    }
  }
  if (['owner', 'admin'].includes(role)) tabs.push(['brand', 'Brand', mountBrand], ['jam', 'Jam buka', mountHours]);
  const content = h('div', { id: 'admin-content' });
  const nav = h('nav', { class: 'tabs', 'aria-label': 'Menu admin' });
  const select = (key) => {
    nav.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', b.dataset.key === key ? 'page' : 'false'));
    content.replaceChildren(h('div', { class: 'skeleton', style: 'height:8rem' }));
    tabs.find((t) => t[0] === key)[2](content, { tenant: S.tenant, role, user });
  };
  for (const [key, label] of tabs) nav.append(h('button', { class: 'tab', type: 'button', 'data-key': key, text: label, onclick: () => select(key) }));
  const bar = h('div', { class: 'admin-bar' },
    h('span', { text: `${user.email} · ${ROLE_LABEL[role] ?? role}` }),
    h('button', { class: 'btn btn--ghost btn--small', type: 'button', text: 'Keluar', onclick: logout }));
  render(bar, nav, content);
  select(role === 'finance_manager' ? 'pembayaran' : 'booking');
}

async function start() {
  try { S.tenant = await resolveTenant(); }
  catch (e) { console.error(e); S.tenant = null; }
  if (!S.tenant) {
    root().replaceChildren(h('main', { class: 'container admin-wrap' },
      h('h1', { class: 'section-title', text: 'Situs tidak ditemukan' }),
      h('p', { class: 'empty', text: 'Alamat ini belum terhubung ke situs mana pun.' })));
    return;
  }
  applyTheme(S.tenant.theme);
  document.title = `Admin — ${S.tenant.brandName}`;
  await adminAuth.authStateReady();
  if (adminAuth.currentUser) await enter(adminAuth.currentUser);
  else showLogin();
}

start();

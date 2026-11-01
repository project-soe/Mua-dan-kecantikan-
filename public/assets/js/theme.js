const MAP = {
  primary: '--color-primary', secondary: '--color-secondary', background: '--color-bg', accent: '--color-accent',
  text: '--color-text', surface: '--color-surface', muted: '--color-muted', border: '--color-border',
};
const HEX = /^#[0-9a-fA-F]{6}$/;

// Hanya warna hex #RRGGBB untuk kunci yang dikenal; yang lain dibuang (mencegah injeksi CSS).
export function sanitizeTheme(theme) {
  const out = {};
  const colors = theme?.colors;
  if (colors && typeof colors === 'object') {
    for (const [k, v] of Object.entries(colors)) {
      if (Object.hasOwn(MAP, k) && typeof v === 'string' && HEX.test(v)) out[MAP[k]] = v;
    }
  }
  return out;
}

export function applyTheme(theme, root = document.documentElement) {
  for (const [k, v] of Object.entries(sanitizeTheme(theme))) root.style.setProperty(k, v);
}

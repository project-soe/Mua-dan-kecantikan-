const KEY = 'mua-putri-cart-v1';
function read() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(value) ? value.filter((x) => x && typeof x.productId === 'string'
      && Number.isInteger(x.quantity) && x.quantity > 0 && x.quantity <= 20) : [];
  } catch { return []; }
}
function write(items) { localStorage.setItem(KEY, JSON.stringify(items)); }
export function getCart() { return read(); }
export function addCartItem(product) {
  if (!product?.id || typeof product.name !== 'string') throw new Error('Produk tidak valid');
  const items = read();
  const found = items.find((x) => x.productId === product.id);
  if (found) found.quantity = Math.min(20, found.quantity + 1);
  else items.push({ productId: product.id, name: product.name, price: Number(product.discountPrice ?? product.price) || 0,
    image: product.thumbnailImage ?? product.coverImage ?? null, quantity: 1 });
  write(items);
  return items;
}
export function setCartQuantity(productId, quantity) {
  const items = read().map((x) => x.productId === productId ? { ...x, quantity: Math.max(1, Math.min(20, Number(quantity) || 1)) } : x);
  write(items); return items;
}
export function removeCartItem(productId) { const items = read().filter((x) => x.productId !== productId); write(items); return items; }
export function clearCart() { localStorage.removeItem(KEY); }
export function cartCount() { return read().reduce((n, x) => n + x.quantity, 0); }

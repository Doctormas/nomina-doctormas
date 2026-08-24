let container = null;
function ensureContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

/** Reemplazo no bloqueante de alert() para confirmaciones/avisos rápidos. */
export function toast(message, type = 'info', timeoutMs = 4200) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  ensureContainer().appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 220);
  }, timeoutMs);
}

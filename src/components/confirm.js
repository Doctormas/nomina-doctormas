/** Reemplazo no bloqueante de confirm() nativo, coherente con la marca. */
export function confirmDialog({ title = 'Confirmar', message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal modal-confirm">
        <h3>${title}</h3>
        <p class="confirm-message">${message}</p>
        <div class="modal-actions">
          <button class="btn ghost" data-action="cancel">${cancelLabel}</button>
          <button class="btn ${danger ? 'danger' : ''}" data-action="confirm">${confirmLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    function close(result) { overlay.remove(); resolve(result); }
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => close(false));
    overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => close(true));
    const onKey = (e) => { if (e.key === 'Escape') { close(false); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
  });
}

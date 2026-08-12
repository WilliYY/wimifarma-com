(() => {
  'use strict';

  const money = (value) => {
    const raw = String(value || '').replace(/R\$/gi, '').replace(/\s+/g, '');
    let normalized = raw;
    if (normalized.includes(',')) normalized = normalized.replace(/\./g, '').replace(',', '.');
    const number = Number(normalized);
    return Number.isFinite(number)
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(number)
      : 'R$ 0,00';
  };

  const date = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    return match ? `${match[3]}/${match[2]}/${match[1]}` : 'Sem validade';
  };

  function previewFor(form) {
    const scope = form.closest('.creation-grid, .coupon-edit-grid, .surface') || document;
    return scope.querySelector('[data-coupon-preview]');
  }

  function updatePreview(form) {
    const preview = previewFor(form);
    if (!preview) return;
    form.querySelectorAll('[data-preview-source]').forEach((field) => {
      const key = field.getAttribute('data-preview-source');
      const target = preview.querySelector(`[data-preview="${key}"]`);
      if (!target) return;
      let value = field.value;
      if (key === 'normal' || key === 'promotional') {
        value = money(value);
      } else if (key === 'expiration') {
        value = date(value);
      }
      target.textContent = value || (key === 'product' ? 'PRODUTO / MEDICAMENTO' : key === 'code' ? '-----' : 'Sem validade');
    });
  }

  document.querySelectorAll('[data-coupon-form]').forEach((form) => {
    form.addEventListener('input', () => updatePreview(form));
    form.addEventListener('change', () => updatePreview(form));
    updatePreview(form);
  });

  document.querySelectorAll('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      if (!window.confirm(form.getAttribute('data-confirm') || 'Confirmar esta acao?')) event.preventDefault();
    });
  });
})();

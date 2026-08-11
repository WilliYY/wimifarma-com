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

  const normalizedLetters = (value) => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '');

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
      if (key === 'person' && field instanceof HTMLSelectElement) {
        value = field.selectedOptions[0]?.dataset.personName || 'Indicador';
      } else if (key === 'normal' || key === 'promotional') {
        value = money(value);
      } else if (key === 'expiration') {
        value = date(value);
      }
      target.textContent = value || (key === 'product' ? 'PRODUTO / MEDICAMENTO' : key === 'code' ? 'CODIGO' : 'Indicador');
    });
  }

  document.querySelectorAll('[data-coupon-form]').forEach((form) => {
    form.addEventListener('input', () => updatePreview(form));
    form.addEventListener('change', () => updatePreview(form));
    const generate = form.querySelector('[data-generate-code]');
    generate?.addEventListener('click', () => {
      const person = form.querySelector('[name="referral_person_id"]');
      const option = person instanceof HTMLSelectElement ? person.selectedOptions[0] : null;
      const prefix = normalizedLetters(option?.dataset.personName || '').slice(0, 3).padEnd(3, 'X');
      const random = globalThis.crypto?.getRandomValues
        ? globalThis.crypto.getRandomValues(new Uint16Array(1))[0] % 10000
        : Math.floor(Math.random() * 10000);
      const code = `${prefix}-${String(random).padStart(4, '0')}`;
      const input = form.querySelector('[name="code"]');
      if (input instanceof HTMLInputElement) input.value = code;
      const marker = form.querySelector('[data-auto-code]');
      if (marker instanceof HTMLInputElement) marker.value = '1';
      updatePreview(form);
      input?.focus();
    });
    updatePreview(form);
  });

  document.querySelectorAll('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      if (!window.confirm(form.getAttribute('data-confirm') || 'Confirmar esta acao?')) event.preventDefault();
    });
  });
})();

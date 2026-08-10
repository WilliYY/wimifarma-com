(() => {
  'use strict';

  const period = document.querySelector('[data-period]');
  const customDates = Array.from(document.querySelectorAll('[data-custom-date]'));

  function syncCustomDates() {
    const visible = period instanceof HTMLSelectElement && period.value === 'custom';
    customDates.forEach((field) => {
      field.toggleAttribute('hidden', !visible);
      field.querySelectorAll('input').forEach((input) => {
        if (input instanceof HTMLInputElement) input.disabled = !visible;
      });
    });
  }

  period?.addEventListener('change', syncCustomDates);
  syncCustomDates();

  document.querySelectorAll('[data-phone]').forEach((field) => {
    field.addEventListener('input', () => {
      if (!(field instanceof HTMLInputElement)) return;
      const digits = field.value.replace(/\D/g, '').slice(0, 11);
      if (digits.length <= 2) return;
      if (digits.length <= 6) field.value = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
      else if (digits.length <= 10) field.value = `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
      else field.value = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    });
  });

  document.querySelectorAll('[data-lock-submit]').forEach((form) => {
    form.addEventListener('submit', () => {
      const button = form.querySelector('button[type="submit"]');
      if (!(button instanceof HTMLButtonElement)) return;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      window.setTimeout(() => { button.disabled = false; button.removeAttribute('aria-busy'); }, 8000);
    });
  });

  document.querySelectorAll('[data-confirm-cancel]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      if (!window.confirm('Cancelar esta entrega e estornar a comissao de R$ 1,00? O historico sera mantido.')) {
        event.preventDefault();
      }
    });
  });
})();

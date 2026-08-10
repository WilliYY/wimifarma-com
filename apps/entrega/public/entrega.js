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

  const deliveryForm = document.querySelector('[data-delivery-form]');
  const preview = document.querySelector('[data-delivery-preview]');

  function previewText(selector, value, fallback) {
    const target = preview?.querySelector(selector);
    if (target) target.textContent = value.trim() || fallback;
  }

  function syncDeliveryPreview() {
    if (!(deliveryForm instanceof HTMLFormElement) || !preview) return;
    const customer = deliveryForm.elements.namedItem('customer_name');
    const phone = deliveryForm.elements.namedItem('customer_phone');
    const address = deliveryForm.elements.namedItem('address');
    const responsible = deliveryForm.elements.namedItem('responsible_user_id');
    previewText('[data-preview-customer]', customer instanceof HTMLInputElement ? customer.value : '', 'Nome do cliente');
    previewText('[data-preview-phone]', phone instanceof HTMLInputElement ? phone.value : '', '(44) 99999-9999');
    previewText('[data-preview-address]', address instanceof HTMLInputElement ? address.value : '', 'Rua, numero, bairro e referencia');
    const selectedOption = responsible instanceof HTMLSelectElement ? responsible.selectedOptions[0] : null;
    previewText('[data-preview-responsible]', selectedOption?.dataset.displayName || '', 'Usuario responsavel');
    previewText('[data-preview-date]', new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date()), '-');
  }

  deliveryForm?.addEventListener('input', syncDeliveryPreview);
  deliveryForm?.addEventListener('change', syncDeliveryPreview);
  syncDeliveryPreview();

  document.querySelectorAll('[data-lock-submit]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      window.setTimeout(() => {
        if (event.defaultPrevented) return;
        const button = form.querySelector('button[type="submit"]');
        if (!(button instanceof HTMLButtonElement)) return;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        window.setTimeout(() => { button.disabled = false; button.removeAttribute('aria-busy'); }, 8000);
      }, 0);
    });
  });

  document.querySelectorAll('[data-confirm-cancel]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      if (!window.confirm('Cancelar esta entrega e estornar a comissao de R$ 1,00? O historico sera mantido.')) {
        event.preventDefault();
      }
    });
  });

  document.querySelectorAll('[data-confirm-payment]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      const select = form.querySelector('select[name="user_id"]');
      const option = select instanceof HTMLSelectElement ? select.selectedOptions[0] : null;
      const label = option?.textContent?.trim() || 'o usuario selecionado';
      if (!window.confirm(`Confirmar o pagamento de ${label}? Esta baixa nao podera ser alterada.`)) {
        event.preventDefault();
      }
    });
  });
})();

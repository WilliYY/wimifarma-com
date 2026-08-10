(() => {
  'use strict';

  document.querySelector('[data-print-now]')?.addEventListener('click', () => window.print());
  if (document.body.hasAttribute('data-auto-print')) {
    window.setTimeout(() => window.print(), 180);
  }
})();

(() => {
  'use strict';
  const print = () => window.print();
  document.querySelector('[data-print]')?.addEventListener('click', print);
  window.addEventListener('load', () => window.setTimeout(print, 250), { once: true });
})();

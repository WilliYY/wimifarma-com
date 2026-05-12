(function () {
    'use strict';

    // Compatibilidade para paginas antigas que ainda tentem carregar /app.js.
    // A tela ativa da Cotacao deve carregar /cotacao/app.js diretamente.
    if (!document.getElementById('sheet-grid')) {
        return;
    }

    if (document.querySelector('script[src*="/cotacao/app.js"]')) {
        return;
    }

    var script = document.createElement('script');
    script.src = '/cotacao/app.js';
    script.defer = true;
    document.head.appendChild(script);
}());

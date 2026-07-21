(function () {
    'use strict';

    function parseMoney(value) {
        var raw = String(value || '').replace(/[^\d,.-]/g, '');

        if (raw.indexOf(',') !== -1 && raw.indexOf('.') !== -1) {
            raw = raw.replace(/\./g, '').replace(',', '.');
        } else {
            raw = raw.replace(',', '.');
        }

        var parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function formatMoney(value) {
        return value.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function formatDecimalInput(value) {
        return Number(value || 0).toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, function (char) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            }[char];
        });
    }

    function bindMoneyFields() {
        document.querySelectorAll('[data-money]').forEach(function (input) {
            input.addEventListener('blur', function () {
                var value = parseMoney(input.value);

                if (value <= 0) {
                    return;
                }

                input.value = value.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            });
        });
    }

    function sectionFromHref(href) {
        try {
            var url = new URL(href, window.location.href);
            var isHashOnly = href.charAt(0) === '#';

            if (url.pathname !== window.location.pathname || !url.hash) {
                return '';
            }

            /*
             * Links com query diferente precisam navegar para o PHP carregar
             * cliente, busca ou filtro. Se interceptarmos aqui, a tela muda,
             * mas o backend fica com dados antigos.
             */
            if (!isHashOnly && url.search !== window.location.search) {
                return '';
            }

            return url.hash.replace('#', '');
        } catch (error) {
            return '';
        }
    }

    function activateSection(sectionId, shouldPushState) {
        var sections = Array.prototype.slice.call(document.querySelectorAll('.workspace-section[id]'));
        var ids = sections.map(function (section) {
            return section.id;
        });

        if (ids.indexOf(sectionId) === -1) {
            sectionId = ids.indexOf('busca') !== -1 ? 'busca' : ids[0];
        }

        if (!sectionId) {
            return;
        }

        document.body.classList.add('sections-ready');

        sections.forEach(function (section) {
            section.classList.toggle('is-active', section.id === sectionId);
            section.hidden = section.id !== sectionId;
        });

        document.querySelectorAll('[data-section-link], .nav a').forEach(function (link) {
            var target = link.getAttribute('data-section-link') || sectionFromHref(link.getAttribute('href') || '');
            var isActive = target === sectionId;

            link.classList.toggle('is-active', isActive);
            link.classList.toggle('active', isActive);
            if (isActive) {
                link.setAttribute('aria-current', 'page');
            } else {
                link.removeAttribute('aria-current');
            }
        });

        if (shouldPushState) {
            window.history.pushState({ section: sectionId }, '', '#' + sectionId);
        }

        console.log('Wimifarma Cashback: abriu secao', sectionId);
    }

    function bindSections() {
        var sections = document.querySelectorAll('.workspace-section[id]');

        if (!sections.length) {
            return;
        }

        activateSection(window.location.hash.replace('#', '') || 'busca', false);

        document.addEventListener('click', function (event) {
            var link = event.target.closest('a[href]');

            if (!link) {
                return;
            }

            var href = link.getAttribute('href') || '';
            var sectionId = link.getAttribute('data-section-link') || sectionFromHref(href);

            if (!sectionId) {
                return;
            }

            if (href && href.indexOf('#') !== 0) {
                var linkUrl = new URL(href, window.location.href);

                if (linkUrl.pathname !== window.location.pathname) {
                    return;
                }
            }

            event.preventDefault();
            console.log('Wimifarma Cashback: clicou em', sectionId);
            activateSection(sectionId, true);
        });

        window.addEventListener('popstate', function () {
            activateSection(window.location.hash.replace('#', '') || 'busca', false);
        });

        window.addEventListener('hashchange', function () {
            activateSection(window.location.hash.replace('#', '') || 'busca', false);
        });
    }

    function bindActiveNav() {
        if (document.querySelector('.workspace-section[id]')) {
            return;
        }

        var links = Array.prototype.slice.call(document.querySelectorAll('[data-nav-link]'));

        if (!links.length) {
            return;
        }

        var current = (window.location.pathname || '').split('/').filter(Boolean).pop() || 'dashboard.php';

        links.forEach(function (link) {
            var targetPath = link.getAttribute('data-nav-path') || '';
            var isActive = targetPath === current;

            link.classList.toggle('is-active', isActive);
            link.classList.toggle('active', isActive);
            if (isActive) {
                link.setAttribute('aria-current', 'page');
            } else {
                link.removeAttribute('aria-current');
            }
        });
    }

    function bindCashbackPreview() {
        document.querySelectorAll('[data-cashback-form]').forEach(function (form) {
            var valueInput = form.querySelector('[name="valor_total"]');
            var percentInput = form.querySelector('[name="percentual_cashback"]');
            var preview = form.querySelector('.js-cashback-preview');

            if (!valueInput || !percentInput || !preview) {
                return;
            }

            function update() {
                var total = parseMoney(valueInput.value);
                var percent = parseMoney(percentInput.value);
                var cashback = total * (percent / 100);

                if (total <= 0 || percent < 0) {
                    preview.className = 'live-preview full js-cashback-preview';
                    preview.textContent = 'Preencha o valor para ver o cashback gerado.';
                    return;
                }

                preview.className = 'live-preview full js-cashback-preview ok';
                preview.textContent = 'Cashback previsto: ' + formatMoney(cashback) + ' para uma compra de ' + formatMoney(total) + '.';
            }

            valueInput.addEventListener('input', update);
            percentInput.addEventListener('input', update);
            update();
        });
    }

    function bindQuickCashbackForm() {
        document.querySelectorAll('[data-quick-cashback-form]').forEach(function (form) {
            var valueInput = form.querySelector('[name="valor_compra_rapida"]');
            var output = form.querySelector('.js-quick-cashback-value');
            var percent = Number(String(form.getAttribute('data-default-percent') || '5').replace(',', '.')) || 5;

            if (!valueInput || !output) {
                return;
            }

            function update() {
                var total = parseMoney(valueInput.value);
                output.textContent = formatMoney(Math.max(0, total * (percent / 100)));
            }

            valueInput.addEventListener('input', update);
            update();
        });
    }

    function requestReceiptAudit(endpoint, fieldName, id) {
        var csrfMeta = document.querySelector('meta[name="wfwc-csrf"]');
        var body = new URLSearchParams();
        body.set(fieldName, id || '');
        body.set('csrf_token', window.WFWC_CSRF || (csrfMeta ? csrfMeta.getAttribute('content') : '') || '');
        fetch(endpoint, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Accept': 'application/json'
            },
            body: body.toString(),
            keepalive: true
        }).catch(function (error) {
            console.error('Wimifarma Cashback: nao foi possivel auditar a solicitacao de impressao', error);
        });
    }

    function printCashbackReceipt(receipt) {
        document.querySelectorAll('.cashback-receipt-print-root').forEach(function (oldRoot) {
            oldRoot.remove();
        });
        var printRoot = document.createElement('div');
        printRoot.className = 'cashback-receipt-print-root';
        printRoot.setAttribute('aria-hidden', 'true');
        printRoot.appendChild(receipt.cloneNode(true));
        document.body.appendChild(printRoot);
        document.body.classList.add('printing-cashback-receipt');

        var cleaned = false;
        var cleanup = function () {
            if (cleaned) {
                return;
            }
            cleaned = true;
            document.body.classList.remove('printing-cashback-receipt');
            printRoot.remove();
        };
        window.addEventListener('afterprint', cleanup, { once: true });
        window.setTimeout(cleanup, 60000);
        window.print();
    }

    function bindCashbackReceiptPrint() {
        document.querySelectorAll('[data-print-quick-voucher]').forEach(function (button) {
            button.addEventListener('click', function () {
                var result = button.closest('.quick-voucher-result');
                var receipt = result ? result.querySelector('[data-quick-voucher-receipt]') : null;
                if (!receipt) {
                    return;
                }
                requestReceiptAudit('api-cashback-rapido-impressao.php', 'voucher_id', button.getAttribute('data-voucher-id') || '');
                printCashbackReceipt(receipt);
            });
        });

        document.querySelectorAll('[data-print-cashback-purchase]').forEach(function (button) {
            button.addEventListener('click', function () {
                var result = button.closest('[data-cashback-operation-result]');
                var receipt = result ? result.querySelector('[data-cashback-purchase-receipt]') : null;
                if (!receipt) {
                    return;
                }
                requestReceiptAudit(
                    'api-comprovante-cashback-impressao.php',
                    'purchase_id',
                    button.getAttribute('data-purchase-id') || ''
                );
                printCashbackReceipt(receipt);
            });
        });
    }

    function refreshQuickVoucherForm(form) {
        if (form.hasAttribute('data-redeem-form')) {
            updateRedeemForm(form);
            return;
        }
        var purchaseInput = form.querySelector('[name="valor_compra_inicial"]');
        if (purchaseInput) {
            purchaseInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    function bindQuickVoucherCodes() {
        document.querySelectorAll('[data-quick-voucher-code]').forEach(function (input) {
            var form = input.closest('form');
            var status = form ? form.querySelector('[data-quick-voucher-status]') : null;
            var timer = null;
            var requestVersion = 0;

            if (!form) {
                return;
            }

            function clearVoucherState() {
                delete form.dataset.quickVoucherCashback;
                delete form.dataset.quickVoucherMinimum;
                delete form.dataset.quickVoucherClientId;
                input.setCustomValidity('');
                if (status) {
                    status.textContent = 'Opcional';
                    status.className = '';
                }
                refreshQuickVoucherForm(form);
            }

            input.addEventListener('input', function () {
                var code = String(input.value || '').replace(/\D/g, '').slice(0, 4);
                input.value = code;
                clearTimeout(timer);
                requestVersion += 1;
                var currentRequest = requestVersion;

                if (!code) {
                    clearVoucherState();
                    return;
                }

                if (code.length < 4) {
                    delete form.dataset.quickVoucherCashback;
                    delete form.dataset.quickVoucherMinimum;
                    delete form.dataset.quickVoucherClientId;
                    input.setCustomValidity('Informe os 4 digitos do codigo.');
                    if (status) {
                        status.textContent = 'Digite os 4 numeros';
                        status.className = 'is-pending';
                    }
                    refreshQuickVoucherForm(form);
                    return;
                }

                input.setCustomValidity('Validando codigo...');
                if (status) {
                    status.textContent = 'Validando...';
                    status.className = 'is-pending';
                }

                timer = window.setTimeout(function () {
                    fetch('api-cashback-rapido.php?codigo=' + encodeURIComponent(code), {
                        credentials: 'same-origin',
                        headers: { 'Accept': 'application/json' }
                    })
                        .then(function (response) {
                            return response.json().then(function (payload) {
                                if (!response.ok) {
                                    throw new Error(payload && payload.message ? payload.message : 'Codigo indisponivel.');
                                }
                                return payload;
                            });
                        })
                        .then(function (payload) {
                            if (currentRequest !== requestVersion || String(input.value || '') !== code) {
                                return;
                            }
                            var selectedClient = form.querySelector('[name="cliente_id"]');
                            var selectedClientId = selectedClient ? Number(selectedClient.value || 0) : 0;
                            var linkedClientId = Number(payload.cliente_id || 0);
                            var invalidMessage = '';

                            if (form.hasAttribute('data-initial-purchase-form') && payload.vinculado) {
                                invalidMessage = 'Codigo ja vinculado. Use o cliente cadastrado em Gastar/Usar Cashback.';
                            } else if (form.hasAttribute('data-redeem-form') && linkedClientId > 0 && linkedClientId !== selectedClientId) {
                                invalidMessage = 'Codigo vinculado a outro cliente. Selecione o cliente correto.';
                            }

                            form.dataset.quickVoucherCashback = String(payload.cashback_raw || 0);
                            form.dataset.quickVoucherMinimum = String(payload.compra_minima_raw || 0);
                            form.dataset.quickVoucherClientId = String(linkedClientId || 0);
                            input.setCustomValidity(invalidMessage);
                            if (status) {
                                status.textContent = invalidMessage || ('Valido: ' + payload.cashback + ' | compra minima ' + payload.compra_minima);
                                status.className = invalidMessage ? 'is-error' : 'is-valid';
                            }
                            refreshQuickVoucherForm(form);
                        })
                        .catch(function (error) {
                            if (currentRequest !== requestVersion || String(input.value || '') !== code) {
                                return;
                            }
                            delete form.dataset.quickVoucherCashback;
                            delete form.dataset.quickVoucherMinimum;
                            delete form.dataset.quickVoucherClientId;
                            input.setCustomValidity(error.message || 'Codigo indisponivel.');
                            if (status) {
                                status.textContent = error.message || 'Codigo indisponivel.';
                                status.className = 'is-error';
                            }
                            refreshQuickVoucherForm(form);
                        });
                }, 160);
            });
        });
    }

    function bindInitialPurchasePreview() {
        document.querySelectorAll('[data-initial-purchase-form]').forEach(function (form) {
            var valueInput = form.querySelector('[name="valor_compra_inicial"]');
            var percentInput = form.querySelector('[name="percentual_cashback_inicial"]');
            var charge = form.querySelector('.js-initial-charge');
            var cashbackValue = form.querySelector('.js-initial-cashback');
            var preview = form.querySelector('.js-initial-preview');
            var codeInput = form.querySelector('[name="codigo_cashback"]');
            var defaultPercent = Number(String(form.getAttribute('data-default-percent') || '5').replace(',', '.')) || 5;

            if (!valueInput || !percentInput || !preview) {
                return;
            }

            function update() {
                var total = parseMoney(valueInput.value);
                var percent = parseMoney(percentInput.value);
                var cashback = total * (percent / 100);
                var quickCode = codeInput ? String(codeInput.value || '').trim() : '';
                var quickCashback = Number(form.dataset.quickVoucherCashback || 0);
                var minimumPurchase = Number(form.dataset.quickVoucherMinimum || 0);
                var chargedTotal = total;

                if (quickCode) {
                    if (quickCashback <= 0) {
                        if (charge) {
                            charge.textContent = formatMoney(total);
                        }
                        if (cashbackValue) {
                            cashbackValue.textContent = formatMoney(0);
                        }
                        preview.className = 'live-preview full js-initial-preview';
                        preview.textContent = 'Valide o codigo para calcular a compra.';
                        return;
                    }

                    if (total < minimumPurchase) {
                        if (charge) {
                            charge.textContent = formatMoney(total);
                        }
                        if (cashbackValue) {
                            cashbackValue.textContent = formatMoney(0);
                        }
                        preview.className = 'live-preview full js-initial-preview blocked';
                        preview.textContent = 'Compra minima para este codigo: ' + formatMoney(minimumPurchase) + '.';
                        return;
                    }

                    chargedTotal = Math.max(0, total - quickCashback);
                    cashback = chargedTotal * (defaultPercent / 100);
                    if (charge) {
                        charge.textContent = formatMoney(chargedTotal);
                    }
                    if (cashbackValue) {
                        cashbackValue.textContent = formatMoney(cashback);
                    }
                    preview.className = 'live-preview full js-initial-preview ok';
                    preview.textContent = 'Codigo aplicado: descontar ' + formatMoney(quickCashback) + ', cobrar ' + formatMoney(chargedTotal) + ' e gerar o proximo codigo de ' + formatMoney(cashback) + '.';
                    return;
                }

                if (charge) {
                    charge.textContent = formatMoney(chargedTotal);
                }

                if (cashbackValue) {
                    cashbackValue.textContent = formatMoney(cashback);
                }

                if (total <= 0) {
                    preview.className = 'live-preview full js-initial-preview';
                    preview.textContent = 'Sem valor de compra: o sistema apenas cadastra e seleciona o cliente.';
                    return;
                }

                preview.className = 'live-preview full js-initial-preview ok';
                preview.textContent = 'Cadastro com primeira compra: cobrar ' + formatMoney(total) + ' e gerar ' + formatMoney(cashback) + ' de cashback.';
            }

            valueInput.addEventListener('input', update);
            percentInput.addEventListener('input', update);
            update();
        });
    }

    function updateRedeemForm(form) {
        var purchaseInput = form.querySelector('[name="valor_compra"]');
        var redeemInput = form.querySelector('[name="valor_resgate"]');
        var manualInput = form.querySelector('[name="cashback_manual"]');
        var preview = form.querySelector('.js-redeem-preview');
        var applied = form.querySelector('.js-redeem-auto');
        var charged = form.querySelector('.js-amount-charged');
        var newCashback = form.querySelector('.js-new-cashback');
        var manualCashback = form.querySelector('.js-manual-cashback');
        var quickCodeInput = form.querySelector('[name="codigo_cashback"]');
        var multiplier = Number(form.getAttribute('data-multiplier')) || 4;
        var percent = Number(String(form.getAttribute('data-default-percent') || '5').replace(',', '.')) || 5;
        var available = Number(form.getAttribute('data-available-balance')) || 0;

        if (!purchaseInput || !redeemInput || !preview) {
            return;
        }

        var purchase = parseMoney(purchaseInput.value);
        var quickCode = quickCodeInput ? String(quickCodeInput.value || '').trim() : '';
        var quickCashback = Number(form.dataset.quickVoucherCashback || 0);
        var minimumPurchase = Number(form.dataset.quickVoucherMinimum || 0);
        var linkedClientId = Number(form.dataset.quickVoucherClientId || 0);
        var selectedClientInput = form.querySelector('[name="cliente_id"]');
        var selectedClientId = selectedClientInput ? Number(selectedClientInput.value || 0) : 0;
        if (quickCode) {
            available = quickCashback;
        }
        var maxByRule = Math.floor((purchase / multiplier) * 100) / 100;
        var redeem = quickCode
            ? (quickCashback > 0 && purchase >= minimumPurchase ? quickCashback : 0)
            : Math.max(0, Math.min(available, maxByRule));
        var charge = Math.max(0, purchase - redeem);
        var manual = manualInput ? parseMoney(manualInput.value) : 0;
        if (manualInput) {
            manualInput.disabled = Boolean(quickCode);
            if (quickCode) {
                manualInput.value = '';
                manual = 0;
            }
        }
        var cashback = manual > 0 ? 0 : charge * (percent / 100);

        redeemInput.value = formatDecimalInput(redeem);

        if (applied) {
            applied.textContent = formatMoney(redeem);
        }

        if (charged) {
            charged.textContent = formatMoney(charge);
        }

        if (newCashback) {
            newCashback.textContent = formatMoney(cashback);
        }

        if (manualCashback) {
            manualCashback.textContent = formatMoney(manual);
        }

        if (purchase <= 0) {
            redeemInput.setCustomValidity('Informe o valor da compra.');
            preview.className = 'live-preview full js-redeem-preview';
            preview.textContent = 'Informe o valor da compra para calcular o cashback permitido.';
            return;
        }

        if (manual > charge) {
            redeemInput.setCustomValidity('');
            if (manualInput) {
                manualInput.setCustomValidity('Cashback Manual nao pode ser maior que o valor a cobrar.');
            }
            preview.className = 'live-preview full js-redeem-preview blocked';
            preview.textContent = 'Ajuste o Cashback Manual: ele nao pode ser maior que o valor a cobrar (' + formatMoney(charge) + ').';
            return;
        }

        if (manualInput) {
            manualInput.setCustomValidity('');
        }

        if (quickCode) {
            if (quickCashback <= 0) {
                preview.className = 'live-preview full js-redeem-preview';
                preview.textContent = 'Valide o codigo para calcular o desconto.';
                return;
            }
            if (linkedClientId > 0 && linkedClientId !== selectedClientId) {
                quickCodeInput.setCustomValidity('Codigo vinculado a outro cliente.');
                preview.className = 'live-preview full js-redeem-preview blocked';
                preview.textContent = 'Selecione o cliente correto para usar este codigo.';
                return;
            }
            quickCodeInput.setCustomValidity('');
            if (purchase < minimumPurchase) {
                preview.className = 'live-preview full js-redeem-preview blocked';
                preview.textContent = 'Compra minima para usar este codigo: ' + formatMoney(minimumPurchase) + '.';
                return;
            }
            preview.className = 'live-preview full js-redeem-preview ok';
            preview.textContent = 'Codigo aplicado: descontar ' + formatMoney(quickCashback) + ', cobrar ' + formatMoney(charge) + ' e gerar o proximo codigo de ' + formatMoney(cashback) + '.';
            return;
        }

        if (manual > 0) {
            redeemInput.setCustomValidity('');
            preview.className = 'live-preview full js-redeem-preview ok';
            preview.textContent = 'Manual ativo: o cashback automatico novo fica zerado e o cliente recebe ' + formatMoney(manual) + '. Valor a cobrar: ' + formatMoney(charge) + '.';
            return;
        }

        if (available <= 0) {
            redeemInput.setCustomValidity('');
            preview.className = 'live-preview full js-redeem-preview ok';
            preview.textContent = 'Cliente sem saldo disponivel. A compra sera registrada normalmente, cobrando ' + formatMoney(charge) + ' e gerando ' + formatMoney(cashback) + ' de cashback.';
            return;
        }

        if (redeem <= 0) {
            redeemInput.setCustomValidity('');
            preview.className = 'live-preview full js-redeem-preview ok';
            preview.textContent = 'Compra registrada sem uso de cashback pela regra ' + multiplier + 'x. Valor a cobrar: ' + formatMoney(charge) + '.';
            return;
        }

        redeemInput.setCustomValidity('');
        preview.className = 'live-preview full js-redeem-preview ok';
        preview.textContent = 'Liberado: uso ' + (redeem >= available - 0.009 ? 'total' : 'parcial') + ' de ' + formatMoney(redeem) + '. Valor a cobrar: ' + formatMoney(charge) + '.';
    }

    function bindRedeemPreview() {
        document.querySelectorAll('[data-redeem-form]').forEach(function (form) {
            var purchaseInput = form.querySelector('[name="valor_compra"]');
            var manualInput = form.querySelector('[name="cashback_manual"]');

            if (!purchaseInput) {
                return;
            }

            purchaseInput.addEventListener('input', function () {
                updateRedeemForm(form);
            });
            if (manualInput) {
                manualInput.addEventListener('input', function () {
                    updateRedeemForm(form);
                });
            }
            updateRedeemForm(form);
        });
    }

    function bindLiveClientSearch() {
        document.querySelectorAll('[data-live-client-search]').forEach(function (input) {
            var resultsSelector = input.getAttribute('data-results');
            var results = resultsSelector ? document.querySelector(resultsSelector) : null;
            var timer = null;
            var lastTerm = '';

            if (!results) {
                return;
            }

            function setMessage(message) {
                results.hidden = false;
                results.innerHTML = '<div class="live-client-empty">' + escapeHtml(message) + '</div>';
            }

            function hideResults() {
                results.hidden = true;
                results.innerHTML = '';
            }

            function render(payload) {
                var clientes = payload && Array.isArray(payload.clientes) ? payload.clientes : [];

                if (!clientes.length) {
                    setMessage('Nenhum cliente encontrado. Use o cadastro rapido.');
                    return;
                }

                results.hidden = false;
                results.innerHTML = clientes.map(function (client) {
                    return [
                        '<article class="live-client-card">',
                        '<div>',
                        '<strong>', escapeHtml(client.nome), '</strong>',
                        '<span>#', escapeHtml(client.id), ' | ', escapeHtml(client.telefone), ' | ', escapeHtml(client.atendente), '</span>',
                        '<small>Ultima compra: ', escapeHtml(client.ultima_compra), ' | ', escapeHtml(client.ultima_compra_valor), '</small>',
                        '<small>Validade: ', escapeHtml(client.validade_resumo || 'Sem vencimentos ativos'), '</small>',
                        '</div>',
                        '<div class="live-client-balance">',
                        '<span>Disponivel</span>',
                        '<strong>', escapeHtml(client.saldo_disponivel), '</strong>',
                        '<small>Expirando: ', escapeHtml(client.saldo_expirando), '</small>',
                        '</div>',
                        '<div class="message-actions">',
                        '<a class="btn primary" href="', escapeHtml(client.resgate_url), '">Gastar/Usar Cashback</a>',
                        '<a class="btn" href="', escapeHtml(client.selecionar_url), '">Selecionar</a>',
                        '</div>',
                        '</article>'
                    ].join('');
                }).join('');
            }

            input.addEventListener('input', function () {
                var term = input.value.trim();

                clearTimeout(timer);

                if (term.length < 2) {
                    hideResults();
                    return;
                }

                timer = window.setTimeout(function () {
                    if (term === lastTerm) {
                        return;
                    }

                    lastTerm = term;
                    setMessage('Buscando cliente...');

                    fetch('api-clientes.php?q=' + encodeURIComponent(term), {
                        credentials: 'same-origin',
                        headers: {
                            'Accept': 'application/json'
                        }
                    })
                        .then(function (response) {
                            if (!response.ok) {
                                throw new Error('Falha HTTP ' + response.status);
                            }

                            return response.json();
                        })
                        .then(render)
                        .catch(function (error) {
                            console.error('Wimifarma Cashback: erro na busca viva', error);
                            setMessage('Nao foi possivel buscar agora. Use o botao Buscar.');
                        });
                }, 220);
            });

            document.addEventListener('click', function (event) {
                if (!results.contains(event.target) && event.target !== input) {
                    hideResults();
                }
            });
        });
    }

    function bindClientPickers() {
        document.querySelectorAll('[data-client-picker]').forEach(function (input) {
            var results = document.querySelector(input.getAttribute('data-results') || '');
            var target = document.querySelector(input.getAttribute('data-target') || '');
            var selected = document.querySelector(input.getAttribute('data-selected') || '');
            var form = input.closest('form');
            var timer = null;
            var lastTerm = '';

            if (!results || !target) {
                return;
            }

            function setMessage(message) {
                results.hidden = false;
                results.innerHTML = '<div class="live-client-empty">' + escapeHtml(message) + '</div>';
            }

            function hideResults() {
                results.hidden = true;
                results.innerHTML = '';
            }

            function chooseClient(client) {
                var balance = Number(client.saldo_disponivel_raw || 0);

                target.value = client.id;
                input.value = client.nome + ' - ' + client.telefone;

                if (selected) {
                    selected.dataset.balance = String(balance);
                    selected.innerHTML = 'Selecionado: <strong>' + escapeHtml(client.nome) + '</strong> | ' + escapeHtml(client.telefone) + ' | Saldo disponivel <strong>' + escapeHtml(client.saldo_disponivel) + '</strong><br><span class="selected-client-expiry">Validade: ' + escapeHtml(client.validade_resumo || 'Sem vencimentos ativos') + '</span>';
                }

                if (form && form.hasAttribute('data-redeem-form')) {
                    form.setAttribute('data-available-balance', String(balance));
                    updateRedeemForm(form);
                }

                hideResults();
            }

            function render(payload) {
                var clientes = payload && Array.isArray(payload.clientes) ? payload.clientes : [];

                if (!clientes.length) {
                    setMessage('Nenhum cliente encontrado.');
                    return;
                }

                results.hidden = false;
                results.innerHTML = clientes.map(function (client, index) {
                    return [
                        '<button type="button" class="client-picker-option" data-index="', index, '">',
                        '<span><strong>', escapeHtml(client.nome), '</strong><small>#', escapeHtml(client.id), ' | ', escapeHtml(client.telefone), ' | Ultima compra: ', escapeHtml(client.ultima_compra), '</small></span>',
                        '<span><em>Disponivel</em><strong>', escapeHtml(client.saldo_disponivel), '</strong><small>', escapeHtml(client.validade_resumo || 'Sem vencimentos ativos'), '</small></span>',
                        '</button>'
                    ].join('');
                }).join('');

                results.querySelectorAll('[data-index]').forEach(function (button) {
                    button.addEventListener('click', function () {
                        chooseClient(clientes[Number(button.getAttribute('data-index'))]);
                    });
                });
            }

            input.addEventListener('input', function () {
                var term = input.value.trim();
                target.value = '';

                if (form && form.hasAttribute('data-redeem-form')) {
                    form.setAttribute('data-available-balance', '0');
                    updateRedeemForm(form);
                }

                clearTimeout(timer);

                if (term.length < 2) {
                    hideResults();
                    return;
                }

                timer = window.setTimeout(function () {
                    if (term === lastTerm) {
                        return;
                    }

                    lastTerm = term;
                    setMessage('Buscando cliente...');

                    fetch('api-clientes.php?q=' + encodeURIComponent(term), {
                        credentials: 'same-origin',
                        headers: {
                            'Accept': 'application/json'
                        }
                    })
                        .then(function (response) {
                            if (!response.ok) {
                                throw new Error('Falha HTTP ' + response.status);
                            }

                            return response.json();
                        })
                        .then(render)
                        .catch(function (error) {
                            console.error('Wimifarma Cashback: erro no seletor de cliente', error);
                            setMessage('Nao foi possivel buscar agora.');
                        });
                }, 180);
            });

            document.addEventListener('click', function (event) {
                if (!results.contains(event.target) && event.target !== input) {
                    hideResults();
                }
            });
        });
    }

    function bindClientResultsShowMore() {
        document.querySelectorAll('[data-client-results-list]').forEach(function (list) {
            var items = Array.prototype.slice.call(list.querySelectorAll('[data-client-result-item]'));
            var button = list.querySelector('[data-show-more-clients]');
            var counter = list.querySelector('[data-client-results-count]');
            var step = Number(list.getAttribute('data-visible-step')) || 5;

            if (!items.length || !button) {
                return;
            }

            function visibleCount() {
                return items.filter(function (item) {
                    return !item.hidden;
                }).length;
            }

            function updateCounter() {
                var visible = visibleCount();

                if (counter) {
                    counter.textContent = visible + ' de ' + items.length + ' visiveis';
                }

                button.hidden = visible >= items.length;
            }

            button.addEventListener('click', function () {
                var opened = 0;

                items.forEach(function (item) {
                    if (opened >= step || !item.hidden) {
                        return;
                    }

                    item.hidden = false;
                    opened += 1;
                });

                updateCounter();
            });

            updateCounter();
        });
    }

    function postWhatsappStatus(id, eventName) {
        var csrfMeta = document.querySelector('meta[name="wfwc-csrf"]');
        var csrfToken = window.WFWC_CSRF || (csrfMeta ? csrfMeta.getAttribute('content') : '');
        var body = new URLSearchParams();
        body.set('id', id);
        body.set('event', eventName);
        body.set('csrf_token', csrfToken || '');

        return fetch('api-whatsapp-status.php', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Accept': 'application/json'
            },
            body: body.toString(),
            keepalive: true
        });
    }

    function hideWhatsappCard(card) {
        if (!card) {
            return;
        }

        card.classList.add('is-sent');
        window.setTimeout(function () {
            card.hidden = true;
            refreshWhatsappSection(card);
        }, 260);
    }

    function refreshWhatsappSection(card) {
        var section = card && card.closest('[data-message-section]');

        if (!section) {
            return;
        }

        var visibleCards = section.querySelectorAll('[data-whatsapp-card]:not([hidden])').length;
        var count = section.querySelector('[data-message-section-count]');
        var empty = section.querySelector('[data-message-empty]');
        var metric = document.querySelector('[data-whatsapp-metric-count="' + section.id + '"]');

        if (count) {
            count.textContent = visibleCards + ' na fila';
        }

        if (metric) {
            metric.textContent = String(visibleCards);
        }

        if (empty) {
            empty.hidden = visibleCards > 0;
        }
    }

    function bindWhatsappStatus() {
        document.addEventListener('click', function (event) {
            var link = event.target.closest('[data-whatsapp-send]');

            if (!link) {
                return;
            }

            var id = link.getAttribute('data-message-id');
            var card = link.closest('[data-whatsapp-card]');
            var openedWindow = window.open(link.href, '_blank', 'noopener');

            event.preventDefault();
            console.log('Wimifarma Cashback: abriu WhatsApp mensagem', id);

            if (!openedWindow) {
                window.location.href = link.href;
            }

            if (id) {
                postWhatsappStatus(id, 'sent')
                    .then(function () {
                        hideWhatsappCard(card);
                    })
                    .catch(function (error) {
                        console.error('Wimifarma Cashback: erro ao salvar status WhatsApp', error);
                    });
            } else {
                hideWhatsappCard(card);
            }
        });
    }

    function bindCopyMessages() {
        document.querySelectorAll('[data-copy-message]').forEach(function (button) {
            button.addEventListener('click', function () {
                var message = button.getAttribute('data-copy-message') || '';
                var id = button.getAttribute('data-message-id') || '';
                var card = button.closest('[data-whatsapp-card]');
                var previous = button.textContent;

                if (!message) {
                    return;
                }

                if (!navigator.clipboard) {
                    window.prompt('Copie a mensagem:', message);
                    return;
                }

                navigator.clipboard.writeText(message).then(function () {
                    button.disabled = true;
                    button.textContent = 'Texto copiado';

                    if (id) {
                        postWhatsappStatus(id, 'copied')
                            .then(function (response) {
                                if (!response.ok) {
                                    throw new Error('Falha HTTP ' + response.status);
                                }

                                hideWhatsappCard(card);
                            })
                            .catch(function (error) {
                                console.error('Wimifarma Cashback: erro ao salvar copia WhatsApp', error);
                                button.disabled = false;
                                button.textContent = previous;
                            });
                        return;
                    }

                    window.setTimeout(function () {
                        hideWhatsappCard(card);
                    }, 1600);
                }).catch(function (error) {
                    console.error('Wimifarma Cashback: erro ao copiar mensagem WhatsApp', error);
                    button.disabled = false;
                    button.textContent = previous;
                });
            });
        });
    }

    function bindCancelMessages() {
        document.addEventListener('click', function (event) {
            var button = event.target.closest('[data-cancel-message]');

            if (!button) {
                return;
            }

            var id = button.getAttribute('data-message-id') || '';
            var card = button.closest('[data-whatsapp-card]');
            var previous = button.textContent;

            button.disabled = true;
            button.textContent = 'Removendo...';
            console.log('Wimifarma Cashback: excluiu da fila mensagem', id);

            if (!id) {
                hideWhatsappCard(card);
                return;
            }

            postWhatsappStatus(id, 'cancelled')
                .then(function (response) {
                    if (!response.ok) {
                        throw new Error('Falha HTTP ' + response.status);
                    }

                    hideWhatsappCard(card);
                })
                .catch(function (error) {
                    console.error('Wimifarma Cashback: erro ao excluir mensagem da fila', error);
                    button.disabled = false;
                    button.textContent = previous;
                    window.alert('Nao foi possivel excluir esta mensagem da fila. Tente novamente.');
                });
        });
    }

    function bindAutoSubmit() {
        document.querySelectorAll('[data-auto-submit]').forEach(function (field) {
            field.addEventListener('change', function () {
                if (field.form) {
                    field.form.submit();
                }
            });
        });
    }

    function financeField(container, name) {
        return container.querySelector('[data-finance-field="' + name + '"]');
    }

    function financeFieldValue(container, name) {
        var field = financeField(container, name);
        return field ? parseMoney(field.value) : 0;
    }

    function financeSetMoneyOutput(element, value) {
        if (!element) {
            return;
        }

        element.textContent = formatMoney(value);
        element.classList.remove('is-positive', 'is-negative', 'is-zero');

        if (value > 0.009) {
            element.classList.add('is-positive');
        } else if (value < -0.009) {
            element.classList.add('is-negative');
        } else {
            element.classList.add('is-zero');
        }
    }

    function updateFinanceCalculation(container) {
        var pixManualField = financeField(container, 'pix_correto_manual');
        var pixBanco = financeFieldValue(container, 'pix_banco_total');
        var pixMaquininha = financeFieldValue(container, 'pix_maquininha_total');
        var pixManualRaw = pixManualField ? String(pixManualField.value || '').trim() : '';
        var pixCorreto = pixManualRaw === '' ? pixBanco + pixMaquininha : parseMoney(pixManualRaw);
        var total = financeFieldValue(container, 'caixa_fisico') +
            financeFieldValue(container, 'cartao_total') +
            pixCorreto +
            financeFieldValue(container, 'sangria_total') +
            financeFieldValue(container, 'retirada_caixa') +
            financeFieldValue(container, 'ajustes');
        var diff = total - financeFieldValue(container, 'abertura_sistema');
        var limit = Number(container.getAttribute('data-finance-limit')) || 10;
        var status = Math.abs(diff) > (limit + 0.009) ? 'Divergente' : (Math.abs(diff) > 0.009 ? 'Em conferencia' : 'Fechado');

        financeSetMoneyOutput(container.querySelector('[data-finance-total-output]'), total);
        financeSetMoneyOutput(container.querySelector('[data-finance-diff-output]'), diff);
        financeSetMoneyOutput(container.querySelector('.js-finance-total'), total);
        financeSetMoneyOutput(container.querySelector('.js-finance-diff'), diff);

        var statusOutput = container.querySelector('.js-finance-status');
        if (statusOutput) {
            statusOutput.textContent = status;
        }
    }

    function bindFinanceCalculations() {
        document.querySelectorAll('[data-finance-calc]').forEach(function (container) {
            container.querySelectorAll('[data-finance-field]').forEach(function (field) {
                field.addEventListener('input', function () {
                    updateFinanceCalculation(container);
                });
                field.addEventListener('change', function () {
                    updateFinanceCalculation(container);
                });
            });

            updateFinanceCalculation(container);
        });
    }

    function bindNoEnterSubmit() {
        document.querySelectorAll('[data-no-enter-submit]').forEach(function (form) {
            form.addEventListener('keydown', function (event) {
                var target = event.target;

                if (event.key !== 'Enter' || !target) {
                    return;
                }

                if (target.tagName === 'TEXTAREA' || target.matches('button, [type="submit"]')) {
                    return;
                }

                event.preventDefault();

                var fields = Array.prototype.slice.call(form.querySelectorAll('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])')).filter(function (field) {
                    return field.offsetParent !== null;
                });
                var currentIndex = fields.indexOf(target);

                if (currentIndex >= 0 && fields[currentIndex + 1]) {
                    fields[currentIndex + 1].focus();
                }

                console.log('Wimifarma Cashback: Enter bloqueado para evitar cadastro acidental');
            });
        });
    }

    function bindConfirmSubmit() {
        var forms = Array.prototype.slice.call(document.querySelectorAll('form[data-confirm-submit]'));

        document.querySelectorAll('[data-confirm-submit]').forEach(function (node) {
            var form = node.tagName === 'FORM' ? node : node.closest('form');

            if (form && forms.indexOf(form) === -1) {
                forms.push(form);
            }
        });

        forms.forEach(function (form) {
            if (form.dataset.confirmBound === '1') {
                return;
            }

            form.dataset.confirmBound = '1';
            form.addEventListener('submit', function (event) {
                var submitter = event.submitter || document.activeElement;
                var message = '';

                if (submitter && submitter.getAttribute) {
                    message = submitter.getAttribute('data-confirm-submit') || '';
                }

                message = message || form.getAttribute('data-confirm-submit') || '';

                if (message && !window.confirm(message)) {
                    event.preventDefault();
                }
            });
        });
    }

    function cashbackBaseUrl() {
        var marker = '/cashback/';
        var path = window.location.pathname || '';
        var index = path.indexOf(marker);

        if (index !== -1) {
            return window.location.origin + path.slice(0, index + marker.length);
        }

        return '/cashback/';
    }

    function bindCashbackRunner() {
        var runner = document.querySelector('[data-cashback-runner]');
        var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (!runner) {
            runner = document.createElement('img');
            runner.className = 'cashback-screen-runner';
            runner.src = cashbackBaseUrl() + 'mario.gif';
            runner.alt = '';
            runner.setAttribute('aria-hidden', 'true');
            runner.setAttribute('data-cashback-runner', '');
            document.body.appendChild(runner);
        }

        if (runner.dataset.cashbackRunnerBound === '1') {
            return;
        }

        runner.dataset.cashbackRunnerBound = '1';

        var pointer = {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            active: false
        };
        var x = Math.max(16, Math.min(window.innerWidth - 130, window.innerWidth * 0.18));
        var y = Math.max(86, Math.min(window.innerHeight - 130, window.innerHeight * 0.52));
        var vx = 0.78;
        var vy = -0.42;
        var lastTick = performance.now();

        runner.style.setProperty('--cashback-runner-x', String(x) + 'px');
        runner.style.setProperty('--cashback-runner-y', String(y) + 'px');
        runner.style.setProperty('--cashback-runner-dir', vx < 0 ? '-1' : '1');

        if (reducedMotion) {
            return;
        }

        window.addEventListener('pointermove', function (event) {
            pointer.x = event.clientX;
            pointer.y = event.clientY;
            pointer.active = true;
        }, { passive: true });

        function tick(now) {
            var dt = Math.min(32, now - lastTick) / 16.67;
            lastTick = now;
            var rect = runner.getBoundingClientRect();
            var w = rect.width || 110;
            var h = rect.height || 90;
            var centerX = x + w / 2;
            var centerY = y + h / 2;
            var dx = centerX - pointer.x;
            var dy = centerY - pointer.y;
            var distance = Math.max(1, Math.hypot(dx, dy));

            if (pointer.active && distance < 220) {
                var flee = (220 - distance) / 220;
                vx += (dx / distance) * flee * 0.58;
                vy += (dy / distance) * flee * 0.58;
            } else {
                vx += Math.sin(now / 880) * 0.012;
                vy += Math.cos(now / 1040) * 0.012;
            }

            var speed = Math.hypot(vx, vy);
            if (speed > 3.8) {
                vx = (vx / speed) * 3.8;
                vy = (vy / speed) * 3.8;
            }

            x += vx * dt;
            y += vy * dt;

            if (x < 10 || x > window.innerWidth - w - 10) {
                vx *= -0.88;
                x = Math.max(10, Math.min(window.innerWidth - w - 10, x));
            }

            if (y < 76 || y > window.innerHeight - h - 14) {
                vy *= -0.88;
                y = Math.max(76, Math.min(window.innerHeight - h - 14, y));
            }

            runner.style.setProperty('--cashback-runner-x', String(x) + 'px');
            runner.style.setProperty('--cashback-runner-y', String(y) + 'px');
            runner.style.setProperty('--cashback-runner-dir', vx < 0 ? '-1' : '1');
            window.requestAnimationFrame(tick);
        }

        window.requestAnimationFrame(tick);
    }

    document.addEventListener('DOMContentLoaded', function () {
        bindMoneyFields();
        bindActiveNav();
        bindSections();
        bindCashbackPreview();
        bindQuickCashbackForm();
        bindInitialPurchasePreview();
        bindRedeemPreview();
        bindQuickVoucherCodes();
        bindCashbackReceiptPrint();
        bindLiveClientSearch();
        bindClientResultsShowMore();
        bindClientPickers();
        bindWhatsappStatus();
        bindCopyMessages();
        bindCancelMessages();
        bindFinanceCalculations();
        bindAutoSubmit();
        bindNoEnterSubmit();
        bindConfirmSubmit();
        bindCashbackRunner();
    });

    document.addEventListener('DOMContentLoaded', bindCashbackRunner);
}());

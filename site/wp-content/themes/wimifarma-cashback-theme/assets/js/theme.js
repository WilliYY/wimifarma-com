(function () {
    'use strict';

    console.log('Wimifarma theme.js carregado', window.location.href);

    function formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(Number(value || 0));
    }

    function apiFetch(path) {
        return fetch((window.wfwcPortal && window.wfwcPortal.restUrl ? window.wfwcPortal.restUrl : '') + path, {
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json'
            }
        }).then(function (response) {
            return response.json().then(function (data) {
                if (!response.ok) {
                    var errorMessage = data && data.message ? data.message : 'Nao foi possivel concluir a operacao.';
                    throw new Error(errorMessage);
                }

                return data;
            });
        });
    }

    function showSection(sectionId) {
        document.querySelectorAll('.section').forEach(function (sec) {
            sec.style.display = 'none';
            sec.classList.remove('is-active');
            sec.setAttribute('aria-hidden', 'true');
        });

        var target = document.getElementById(sectionId);

        if (!target) {
            console.warn('Secao nao encontrada:', sectionId);
            return;
        }

        target.style.display = 'block';
        target.classList.add('is-active');
        target.removeAttribute('aria-hidden');

        document.querySelectorAll('[data-action]').forEach(function (button) {
            button.classList.toggle('is-active', button.getAttribute('data-target-section') === sectionId);
        });
    }

    window.showSection = showSection;

    function bindPortalNavigation() {
        if (window.wfwcPortalNavBound) {
            return;
        }

        window.wfwcPortalNavBound = true;

        var labels = {
            'dashboard': 'clicou em Dashboard',
            'nova-compra': 'clicou em Nova Compra',
            'clientes': 'clicou em Clientes',
            'consulta': 'clicou em Consulta',
            'relatorios': 'clicou em Relatorios',
            'equipe-acessos': 'clicou em Equipe e acessos',
            'atendentes': 'clicou em Atendentes'
        };

        document.querySelectorAll('[data-action]').forEach(function (button) {
            button.addEventListener('click', function (event) {
                var action = button.getAttribute('data-action');
                var sectionId = button.getAttribute('data-target-section') || action;

                event.preventDefault();
                console.log(labels[action] || ('clicou em ' + action));
                showSection(sectionId);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });

        var portalToSection = {
            dashboard: 'dashboard',
            purchases: 'nova-compra',
            clients: 'clientes',
            cashback: 'consulta',
            reports: 'relatorios',
            attendants: 'atendentes',
            settings: 'equipe',
            logs: 'relatorios'
        };
        var params = new URLSearchParams(window.location.search);
        var initialSection = params.get('section') || portalToSection[params.get('portal')] || 'dashboard';

        if (document.getElementById(initialSection)) {
            showSection(initialSection);
        }

        console.log('Wimifarma navegacao carregada');
    }

    function resolvePortalUrl(view, clientId) {
        var baseMap = {
            purchases: window.wfwcPortal && window.wfwcPortal.purchasesUrl ? window.wfwcPortal.purchasesUrl : window.location.href,
            cashback: window.wfwcPortal && window.wfwcPortal.cashbackUrl ? window.wfwcPortal.cashbackUrl : window.location.href,
            clients: window.wfwcPortal && window.wfwcPortal.clientsUrl ? window.wfwcPortal.clientsUrl : window.location.href,
            reports: window.wfwcPortal && window.wfwcPortal.reportsUrl ? window.wfwcPortal.reportsUrl : window.location.href
        };

        var rawUrl = baseMap[view] || (window.wfwcPortal && window.wfwcPortal.homeUrl ? window.wfwcPortal.homeUrl : window.location.href);
        var url = new URL(rawUrl, window.location.origin);

        if (clientId) {
            url.searchParams.set('client_id', clientId);
        }

        return url.toString();
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function renderSearchResults(container, items, view) {
        if (!container) {
            return;
        }

        if (!items.length) {
            container.innerHTML = '<div class="wfwc-live-search-empty">Nenhum cliente encontrado.</div>';
            container.hidden = false;
            return;
        }

        container.innerHTML = items.map(function (item) {
            var lastPurchase = item.last_purchase
                ? '<span>Ultima compra: ' + escapeHtml(formatCurrency(item.last_purchase.gross_amount)) + '</span>'
                : '<span>Sem compras recentes</span>';
            var available = item.balances ? formatCurrency(item.balances.total_available || 0) : 'R$ 0,00';

            return '' +
                '<button type="button" class="wfwc-live-search-item" data-client-id="' + escapeHtml(item.id) + '" data-target-view="' + escapeHtml(view) + '">' +
                    '<strong>' + escapeHtml(item.full_name) + '</strong>' +
                    '<span>' + escapeHtml(item.phone_formatted || item.phone || 'Sem telefone') + '</span>' +
                    '<span>Saldo: ' + escapeHtml(available) + '</span>' +
                    lastPurchase +
                '</button>';
        }).join('');

        container.hidden = false;
    }

    function bindLiveSearch(root, options) {
        var input = root.querySelector(options.inputSelector);
        var results = root.querySelector(options.resultsSelector);
        var timer = null;

        if (!input || !results || !window.wfwcPortal || !window.wfwcPortal.portalAuthorized) {
            return;
        }

        function closeResults() {
            results.hidden = true;
        }

        input.addEventListener('input', function () {
            var term = input.value.trim();

            window.clearTimeout(timer);

            if (term.length < 2) {
                results.innerHTML = '';
                results.hidden = true;
                return;
            }

            timer = window.setTimeout(function () {
                apiFetch('clients/search?term=' + encodeURIComponent(term))
                    .then(function (data) {
                        renderSearchResults(results, Array.isArray(data) ? data : [], options.view);
                    })
                    .catch(function () {
                        results.innerHTML = '<div class="wfwc-live-search-empty">Falha ao buscar clientes.</div>';
                        results.hidden = false;
                    });
            }, 220);
        });

        results.addEventListener('click', function (event) {
            var item = event.target.closest('.wfwc-live-search-item');

            if (!item) {
                return;
            }

            var clientId = item.getAttribute('data-client-id');
            var view = item.getAttribute('data-target-view') || options.view;

            window.location.href = resolvePortalUrl(view, clientId);
        });

        document.addEventListener('click', function (event) {
            if (!root.contains(event.target)) {
                closeResults();
            }
        });
    }

    function bindSearches() {
        document.querySelectorAll('[data-wfwc-quick-search]').forEach(function (input) {
            var form = input.closest('form');
            var pageField = form ? form.querySelector('input[name="page"], input[name="portal"]') : null;
            var inferredView = 'cashback';

            if (pageField && /purchases/.test(pageField.value)) {
                inferredView = 'purchases';
            } else if (pageField && /clients/.test(pageField.value)) {
                inferredView = 'clients';
            } else if (pageField && /reports/.test(pageField.value)) {
                inferredView = 'reports';
            }

            if (input.parentNode && input.parentNode.classList && input.parentNode.classList.contains('wfwc-live-search-wrapper')) {
                return;
            }

            var wrapper = document.createElement('div');
            wrapper.className = 'wfwc-live-search-wrapper';
            input.parentNode.insertBefore(wrapper, input);
            wrapper.appendChild(input);

            var results = document.createElement('div');
            results.className = 'wfwc-live-search-results';
            results.hidden = true;
            wrapper.appendChild(results);

            bindLiveSearch(wrapper, {
                inputSelector: '[data-wfwc-quick-search]',
                resultsSelector: '.wfwc-live-search-results',
                view: inferredView
            });
        });

        document.querySelectorAll('[data-wfwc-smart-search]').forEach(function (smartSearch) {
            bindLiveSearch(smartSearch, {
                inputSelector: '[data-wfwc-live-search]',
                resultsSelector: '[data-wfwc-live-search-results]',
                view: 'cashback'
            });
        });
    }

    function bindWhatsApp() {
        var whatsappTrigger = document.querySelector('[data-wfwc-whatsapp-trigger]');
        var whatsappStatus = document.querySelector('[data-wfwc-whatsapp-status]');
        var whatsappList = document.querySelector('[data-wfwc-whatsapp-list]');

        if (!whatsappTrigger || !whatsappStatus || !whatsappList || !window.wfwcPortal || !window.wfwcPortal.portalAuthorized) {
            return;
        }

        whatsappTrigger.addEventListener('click', function () {
            console.log('clicou em Enviar mensagem clientes de hoje');
            whatsappTrigger.disabled = true;
            whatsappStatus.textContent = 'Gerando links do WhatsApp...';
            whatsappList.innerHTML = '';

            apiFetch('whatsapp/today')
                .then(function (data) {
                    var items = Array.isArray(data.items) ? data.items : [];

                    if (!items.length) {
                        whatsappStatus.textContent = 'Nenhum cliente comprou hoje ou faltam telefones validos.';
                        return;
                    }

                    whatsappStatus.textContent = items.length + ' cliente(s) com compra hoje.';
                    whatsappList.innerHTML = items.map(function (item) {
                        return '' +
                            '<a class="wfwc-whatsapp-item" href="' + escapeHtml(item.link) + '" target="_blank" rel="noopener noreferrer">' +
                                '<strong>' + escapeHtml(item.client_name) + '</strong>' +
                                '<span>' + escapeHtml(item.total_cashback_label) + ' de cashback gerado hoje</span>' +
                            '</a>';
                    }).join('');
                })
                .catch(function (error) {
                    whatsappStatus.textContent = error.message || 'Nao foi possivel gerar os links.';
                })
                .finally(function () {
                    whatsappTrigger.disabled = false;
            });
        });
    }

    function bindHomeLaunchpad() {
        var launchpad = document.querySelector('.wfwc-home-launchpad');
        var cards = document.querySelectorAll('.wfwc-module-card');
        var title = document.querySelector('[data-wfwc-magnetic-title]');
        var titleLetters = title ? Array.prototype.slice.call(title.querySelectorAll('.wfwc-title-letter')) : [];
        var runners = Array.prototype.slice.call(document.querySelectorAll('[data-wfwc-runner]'));
        var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var pointer = {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            active: false
        };

        if (!launchpad || !cards.length) {
            return;
        }

        if (title && titleLetters.length && !reducedMotion) {
            launchpad.addEventListener('pointermove', function (event) {
                var active = false;

                titleLetters.forEach(function (letter) {
                    var rect = letter.getBoundingClientRect();
                    var centerX = rect.left + rect.width / 2;
                    var centerY = rect.top + rect.height / 2;
                    var dx = centerX - event.clientX;
                    var dy = centerY - event.clientY;
                    var distance = Math.max(1, Math.hypot(dx, dy));
                    var strength = Math.max(0, 1 - distance / 360);
                    var push = 9 * strength;

                    if (strength > 0.02) {
                        active = true;
                    }

                    letter.style.setProperty('--letter-push-x', ((dx / distance) * push).toFixed(2) + 'px');
                    letter.style.setProperty('--letter-push-y', ((dy / distance) * push).toFixed(2) + 'px');
                });

                title.classList.toggle('is-magnetized', active);
            });

            launchpad.addEventListener('pointerleave', function () {
                title.classList.remove('is-magnetized');
                titleLetters.forEach(function (letter) {
                    letter.style.setProperty('--letter-push-x', '0px');
                    letter.style.setProperty('--letter-push-y', '0px');
                });
            });
        }

        cards.forEach(function (card) {
            card.addEventListener('pointermove', function (event) {
                var rect = card.getBoundingClientRect();
                var x = ((event.clientX - rect.left) / rect.width) - 0.5;
                var y = ((event.clientY - rect.top) / rect.height) - 0.5;

                card.classList.add('is-tilting');
                card.style.setProperty('--tilt-x', String(y * -4) + 'deg');
                card.style.setProperty('--tilt-y', String(x * 5) + 'deg');
            });

            card.addEventListener('pointerleave', function () {
                card.classList.remove('is-tilting');
                card.style.setProperty('--tilt-x', '0deg');
                card.style.setProperty('--tilt-y', '0deg');
            });
        });

        if (runners.length && !reducedMotion) {
            window.addEventListener('pointermove', function (event) {
                pointer.x = event.clientX;
                pointer.y = event.clientY;
                pointer.active = true;
            }, { passive: true });
        }

        function startRunner(node, options) {
            var rect = node.getBoundingClientRect();
            var w = rect.width || options.fallbackWidth || 120;
            var h = rect.height || options.fallbackHeight || 80;
            var x = Math.max(20, Math.min(window.innerWidth - w - 20, window.innerWidth * options.xRatio));
            var y = Math.max(90, Math.min(window.innerHeight - h - 20, window.innerHeight * options.yRatio));
            var vx = options.vx;
            var vy = options.vy;
            var lastTick = performance.now();

            function tick(now) {
                var dt = Math.min(32, now - lastTick) / 16.67;
                lastTick = now;
                rect = node.getBoundingClientRect();
                w = rect.width || options.fallbackWidth || 120;
                h = rect.height || options.fallbackHeight || 80;
                var centerX = x + w / 2;
                var centerY = y + h / 2;
                var dx = centerX - pointer.x;
                var dy = centerY - pointer.y;
                var distance = Math.max(1, Math.hypot(dx, dy));

                if (pointer.active && distance < options.fleeRadius) {
                    var flee = (options.fleeRadius - distance) / options.fleeRadius;
                    vx += (dx / distance) * flee * options.fleeForce;
                    vy += (dy / distance) * flee * options.fleeForce;
                } else {
                    vx += Math.sin(now / options.driftX) * 0.012;
                    vy += Math.cos(now / options.driftY) * 0.012;
                }

                var speed = Math.hypot(vx, vy);
                if (speed > options.maxSpeed) {
                    vx = (vx / speed) * options.maxSpeed;
                    vy = (vy / speed) * options.maxSpeed;
                }

                x += vx * dt;
                y += vy * dt;

                if (x < 12 || x > window.innerWidth - w - 12) {
                    vx *= -0.86;
                    x = Math.max(12, Math.min(window.innerWidth - w - 12, x));
                }

                if (y < 86 || y > window.innerHeight - h - 18) {
                    vy *= -0.86;
                    y = Math.max(86, Math.min(window.innerHeight - h - 18, y));
                }

                node.style.setProperty('--runner-x', String(x) + 'px');
                node.style.setProperty('--runner-y', String(y) + 'px');
                node.style.setProperty('--runner-dir', vx < 0 ? '-1' : '1');
                window.requestAnimationFrame(tick);
            }

            window.requestAnimationFrame(tick);
        }

        function runnerOptions(runner) {
            var kind = runner.getAttribute('data-runner-kind') || 'nyan';

            if (kind === 'duck') {
                return {
                    xRatio: 0.72,
                    yRatio: 0.36,
                    vx: -0.52,
                    vy: 0.28,
                    maxSpeed: 2.75,
                    fleeRadius: 235,
                    fleeForce: 0.42,
                    driftX: 1000,
                    driftY: 900,
                    fallbackWidth: 190,
                    fallbackHeight: 130
                };
            }

            if (kind === 'dragon') {
                return {
                    xRatio: 0.56,
                    yRatio: 0.18,
                    vx: -0.46,
                    vy: 0.22,
                    maxSpeed: 2.6,
                    fleeRadius: 260,
                    fleeForce: 0.4,
                    driftX: 1200,
                    driftY: 980,
                    fallbackWidth: 210,
                    fallbackHeight: 160
                };
            }

            return {
                xRatio: 0.14,
                yRatio: 0.24,
                vx: 0.68,
                vy: 0.3,
                maxSpeed: 3.1,
                fleeRadius: 300,
                fleeForce: 0.46,
                driftX: 900,
                driftY: 1100,
                fallbackWidth: 360,
                fallbackHeight: 220
            };
        }

        if (runners.length && !reducedMotion) {
            runners.forEach(function (runner) {
                startRunner(runner, runnerOptions(runner));
            });
        }

        window.WimifarmaHomeFlashPhoto = function (src) {
            if (!src || !launchpad) {
                return;
            }

            var image = document.createElement('img');
            image.className = 'wfwc-home-flash-photo';
            image.src = src;
            image.alt = '';
            image.setAttribute('aria-hidden', 'true');
            launchpad.appendChild(image);
            window.setTimeout(function () {
                image.remove();
            }, 5200);
        };
    }

    function bindTaskBadge() {
        var badge = document.querySelector('[data-task-count]');
        var config = window.wfwcPortal || {};
        var endpoint = config.taskBadgeUrl || '/tarefa/badge.php';
        var interval = Math.max(8000, Number(config.taskBadgeInterval || 15000));
        var lastKnownCount = null;

        if (!badge) {
            return;
        }

        function applyCount(count, source) {
            count = Math.max(0, Number(count) || 0);
            lastKnownCount = count;
            badge.dataset.count = String(count);
            badge.dataset.updatedAt = String(Date.now());

            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : String(count);
                badge.hidden = false;
            } else {
                badge.hidden = true;
            }

            if (source !== 'storage' && window.localStorage) {
                try {
                    window.localStorage.setItem('wimifarma:task-badge', JSON.stringify({
                        open: count,
                        updatedAt: Date.now()
                    }));
                } catch (error) {
                    // Storage indisponivel nao pode quebrar a home.
                }
            }
        }

        function refreshBadge() {
            fetch(endpoint, {
                cache: 'no-store',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json'
                }
            }).then(function (response) {
                if (!response.ok) {
                    throw new Error('Falha ao consultar tarefas.');
                }

                return response.json();
            }).then(function (data) {
                applyCount(data && typeof data.open !== 'undefined' ? data.open : 0, 'network');
            }).catch(function () {
                if (lastKnownCount === null) {
                    badge.hidden = true;
                }
            });
        }

        refreshBadge();
        window.setInterval(refreshBadge, interval);
        window.addEventListener('focus', refreshBadge);
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) {
                refreshBadge();
            }
        });
        window.addEventListener('storage', function (event) {
            if (event.key !== 'wimifarma:task-badge' || !event.newValue) {
                return;
            }

            try {
                var data = JSON.parse(event.newValue);
                applyCount(data.open, 'storage');
            } catch (error) {
                // Estado compartilhado malformado e ignorado.
            }
        });
    }

    function init() {
        document.body.classList.add('wfwc-theme-ready');
        bindPortalNavigation();
        bindSearches();
        bindWhatsApp();
        bindHomeLaunchpad();
        bindTaskBadge();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());

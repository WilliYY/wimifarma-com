(function () {
    function parseMoney(value) {
        var text = String(value || '').replace(/R\$/g, '').replace(/\s+/g, '').trim();

        if (!text) {
            return 0;
        }

        if (text.indexOf(',') !== -1 && text.indexOf('.') !== -1) {
            text = text.replace(/\./g, '').replace(',', '.');
        } else if (text.indexOf(',') !== -1) {
            text = text.replace(',', '.');
        }

        var parsed = Number.parseFloat(text);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function formatMoney(value) {
        return 'R$ ' + Number(value || 0).toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function formatMonthLabel(value) {
        var text = String(value || '').trim();
        if (!/^\d{4}-\d{2}$/.test(text)) {
            return '';
        }
        return text.slice(5, 7) + '/' + text.slice(0, 4);
    }

    var categoryRules = [
        { label: 'Funcionario', weight: 90, terms: ['funcionario', 'funcionaria', 'colaborador', 'colaboradora', 'salario', 'salarios', 'folha', 'pagamento funcionario', 'adiantamento'] },
        { label: 'Comissao', weight: 86, terms: ['comissao', 'comissoes', 'comissionamento', 'bonus', 'premio venda', 'premiacao'] },
        { label: 'Aluguel', weight: 84, terms: ['aluguel', 'locacao', 'imovel'] },
        { label: 'Energia', weight: 82, terms: ['energia', 'luz', 'copel', 'conta de luz'] },
        { label: 'Internet', weight: 80, terms: ['internet', 'fibra', 'telefone', 'telefonia', 'vivo', 'claro', 'tim', 'oi', 'net'] },
        { label: 'Imposto', weight: 78, terms: ['imposto', 'taxa', 'das', 'simples', 'fgts', 'inss', 'irrf', 'gps', 'guia', 'alvara', 'tributo'] },
        { label: 'Medicamentos', weight: 76, terms: ['medicamento', 'medicamentos', 'remedio', 'remedios', 'farmaco', 'distribuidora', 'fornecedor medicamento'] },
        { label: 'Manutencao', weight: 74, terms: ['manutencao', 'conserto', 'reparo', 'reforma', 'tecnico', 'instalacao'] },
        { label: 'Servico', weight: 72, terms: ['servico', 'servicos', 'software', 'sistema', 'mensalidade', 'consultoria', 'contador', 'contabilidade', 'honorario'] },
        { label: 'Fornecedor', weight: 70, terms: ['fornecedor', 'distribuidor', 'distribuidora', 'compra fornecedor'] },
        { label: 'Boleto', weight: 68, terms: ['boleto', 'fatura', 'cobranca', 'parcela', 'duplicata'] }
    ];

    function normalizeCategoryText(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim()
            .replace(/\s+/g, ' ');
    }

    function inferCategoryFromTitle(value) {
        var text = normalizeCategoryText(value);
        if (!text) {
            return 'Geral';
        }

        var best = { label: 'Geral', score: 0 };
        categoryRules.forEach(function (rule) {
            var score = 0;
            rule.terms.forEach(function (term) {
                var normalizedTerm = normalizeCategoryText(term);
                if (normalizedTerm && text.indexOf(normalizedTerm) !== -1) {
                    score += rule.weight + normalizedTerm.length;
                }
            });
            if (score > best.score) {
                best = { label: rule.label, score: score };
            }
        });

        return best.label;
    }

    function addMonthsToMonth(value, amount) {
        var text = String(value || '').trim();
        if (!/^\d{4}-\d{2}$/.test(text)) {
            var now = new Date();
            text = String(now.getFullYear()) + '-' + String(now.getMonth() + 1).padStart(2, '0');
        }
        var year = Number.parseInt(text.slice(0, 4), 10);
        var month = Number.parseInt(text.slice(5, 7), 10) - 1;
        var date = new Date(year, month + Number(amount || 0), 1);
        return String(date.getFullYear()) + '-' + String(date.getMonth() + 1).padStart(2, '0');
    }

    function daysInMonth(year, monthIndex) {
        return new Date(year, monthIndex + 1, 0).getDate();
    }

    function addMonthsToDate(value, amount) {
        var text = String(value || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
            return '';
        }
        var year = Number.parseInt(text.slice(0, 4), 10);
        var month = Number.parseInt(text.slice(5, 7), 10) - 1;
        var day = Number.parseInt(text.slice(8, 10), 10);
        var target = new Date(year, month + Number(amount || 0), 1);
        var targetDay = Math.min(day, daysInMonth(target.getFullYear(), target.getMonth()));
        target.setDate(targetDay);
        return String(target.getDate()).padStart(2, '0') + '/' +
            String(target.getMonth() + 1).padStart(2, '0') + '/' +
            String(target.getFullYear());
    }

    function isoDateAfterDays(days) {
        var now = new Date();
        var target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + Number(days || 0), 12, 0, 0, 0);
        return String(target.getFullYear()) + '-' +
            String(target.getMonth() + 1).padStart(2, '0') + '-' +
            String(target.getDate()).padStart(2, '0');
    }

    function formatIsoDateBr(value) {
        var text = String(value || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
            return '';
        }
        return text.slice(8, 10) + '/' + text.slice(5, 7) + '/' + text.slice(0, 4);
    }

    function compactList(values) {
        if (values.length <= 5) {
            return values.join(', ');
        }
        return values.slice(0, 5).join(', ') + ' e mais ' + String(values.length - 5);
    }

    function emitMoneyChange() {
        document.dispatchEvent(new CustomEvent('gestao:money-change'));
    }

    function bindMoneyInputs(root) {
        Array.prototype.slice.call((root || document).querySelectorAll('[data-money-input]')).forEach(function (input) {
            if (input.dataset.gestaoMoneyBound === '1') {
                return;
            }

            input.dataset.gestaoMoneyBound = '1';
            input.addEventListener('input', emitMoneyChange);
            input.addEventListener('blur', function () {
                var value = parseMoney(input.value);
                if (value > 0) {
                    input.value = value.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    });
                }
                emitMoneyChange();
            });
        });
    }

    function initTotals() {
        var form = document.querySelector('[data-gestao-form]');
        var totalNode = document.querySelector('[data-gestao-total]');
        var addButton = document.querySelector('[data-add-item]');
        var list = document.querySelector('[data-line-items]');

        if (!form || !totalNode || !list) {
            return;
        }

        function moneyInputs() {
            return Array.prototype.slice.call(form.querySelectorAll('[data-money-input]'));
        }

        function refreshTotal() {
            var total = moneyInputs().reduce(function (sum, input) {
                return sum + Math.max(0, parseMoney(input.value));
            }, 0);

            totalNode.textContent = 'Total ' + formatMoney(total);
        }

        bindMoneyInputs(form);
        document.addEventListener('gestao:money-change', refreshTotal);

        if (addButton) {
            addButton.addEventListener('click', function () {
                var row = document.createElement('div');
                row.className = 'gestao-line-item';
                row.innerHTML = [
                    '<label>',
                    '<span>Descricao do item</span>',
                    '<input type="text" name="item_descricao[]" maxlength="180" placeholder="Outro item">',
                    '</label>',
                    '<label>',
                    '<span>Valor</span>',
                    '<input type="text" name="item_valor[]" inputmode="decimal" placeholder="0,00" data-money-input>',
                    '</label>'
                ].join('');
                list.appendChild(row);
                bindMoneyInputs(row);
                row.querySelector('input').focus();
                refreshTotal();
            });
        }

        form.addEventListener('submit', function (event) {
            var total = moneyInputs().reduce(function (sum, input) {
                return sum + Math.max(0, parseMoney(input.value));
            }, 0);

            if (total <= 0) {
                event.preventDefault();
                window.alert('Informe pelo menos um valor maior que zero.');
            }
        });

        refreshTotal();
    }

    function initRepeatPreview() {
        var form = document.querySelector('[data-gestao-form]');
        if (!form || form.dataset.gestaoRepeatPreviewBound === '1') {
            return;
        }

        var monthInput = form.querySelector('input[name="competencia_mes"]');
        var dueInput = form.querySelector('input[name="vencimento_em"]');
        var repeatNext = form.querySelector('[data-repeat-next]');
        var repeatForever = form.querySelector('[data-repeat-forever]');
        var repeatCount = form.querySelector('[data-repeat-count]');
        var preview = form.querySelector('[data-repeat-preview]');

        if (!monthInput || !repeatNext || !repeatForever || !repeatCount || !preview) {
            return;
        }

        form.dataset.gestaoRepeatPreviewBound = '1';

        function countValue() {
            var parsed = Number.parseInt(repeatCount.value || '0', 10);
            if (!Number.isFinite(parsed)) {
                return 0;
            }
            return Math.min(24, Math.max(0, parsed));
        }

        function refreshPreview() {
            if (repeatForever.checked) {
                repeatCount.value = '';
                repeatCount.disabled = true;
                repeatNext.checked = false;
                var nextForeverMonth = addMonthsToMonth(monthInput.value, 1);
                var foreverDate = dueInput && dueInput.value ? ' / vencimento ' + addMonthsToDate(dueInput.value, 1) : '';
                preview.textContent = 'Sempre ativo: proxima copia em ' + formatMonthLabel(nextForeverMonth) + foreverDate + '.';
                return;
            }

            repeatCount.disabled = false;
            var count = countValue();
            if (count > 0) {
                repeatNext.checked = true;
            }

            var totalRepeats = count > 0 ? count : repeatNext.checked ? 1 : 0;
            if (totalRepeats <= 0) {
                preview.textContent = 'Sem repeticao programada.';
                return;
            }

            var months = [];
            var dates = [];
            for (var index = 1; index <= totalRepeats; index += 1) {
                var month = addMonthsToMonth(monthInput.value, index);
                months.push(formatMonthLabel(month));
                if (dueInput && dueInput.value) {
                    dates.push(addMonthsToDate(dueInput.value, index));
                }
            }

            var repeatLabel = totalRepeats === 1 ? '1x' : String(totalRepeats) + 'x';
            var endMonth = months[months.length - 1] || '';
            if (dates.length) {
                preview.textContent = 'Vai repetir ' + repeatLabel + ' em ' + compactList(dates) + '. Termina em ' + endMonth + '.';
            } else {
                preview.textContent = 'Vai repetir ' + repeatLabel + ' nas competencias ' + compactList(months) + '. Termina em ' + endMonth + '.';
            }
        }

        repeatCount.addEventListener('input', refreshPreview);
        repeatNext.addEventListener('change', refreshPreview);
        repeatForever.addEventListener('change', refreshPreview);
        monthInput.addEventListener('change', refreshPreview);
        if (dueInput) {
            dueInput.addEventListener('change', refreshPreview);
        }
        refreshPreview();
    }

    function initDueDaysPreview() {
        var form = document.querySelector('[data-gestao-form]');
        if (!form || form.dataset.gestaoDueDaysBound === '1') {
            return;
        }

        var daysInput = form.querySelector('[data-due-days]');
        var dueHidden = form.querySelector('[data-due-date-hidden]');
        var preview = form.querySelector('[data-due-preview]');
        if (!daysInput || !dueHidden || !preview) {
            return;
        }

        form.dataset.gestaoDueDaysBound = '1';

        function emitDueChange() {
            dueHidden.dispatchEvent(new Event('change', { bubbles: true }));
        }

        function refreshPreview() {
            var text = String(daysInput.value || '').trim();
            if (!text) {
                dueHidden.value = '';
                preview.textContent = 'Sem vencimento definido.';
                emitDueChange();
                return;
            }

            if (!/^\d+$/.test(text)) {
                dueHidden.value = '';
                preview.textContent = 'Informe um numero de dias valido.';
                emitDueChange();
                return;
            }

            var parsed = Number.parseInt(text, 10);
            if (!Number.isFinite(parsed) || parsed < 0) {
                dueHidden.value = '';
                preview.textContent = 'Informe um numero de dias valido.';
                emitDueChange();
                return;
            }

            parsed = Math.min(3650, parsed);
            var isoDate = isoDateAfterDays(parsed);
            dueHidden.value = isoDate;
            preview.textContent = (parsed === 0 ? 'Vence hoje' : 'Vence em ' + String(parsed) + ' dia' + (parsed === 1 ? '' : 's')) +
                ': ' + formatIsoDateBr(isoDate) + '.';
            emitDueChange();
        }

        daysInput.addEventListener('input', refreshPreview);
        daysInput.addEventListener('blur', function () {
            var parsed = Number.parseInt(daysInput.value || '', 10);
            if (Number.isFinite(parsed) && parsed > 3650) {
                daysInput.value = '3650';
                refreshPreview();
            }
        });
        refreshPreview();
    }

    function initCategoryPreview() {
        var form = document.querySelector('[data-gestao-form]');
        if (!form || form.dataset.gestaoCategoryPreviewBound === '1') {
            return;
        }

        var titleInput = form.querySelector('[data-category-title]');
        var preview = form.querySelector('[data-category-preview]');
        if (!titleInput || !preview) {
            return;
        }

        form.dataset.gestaoCategoryPreviewBound = '1';

        function refreshPreview() {
            preview.textContent = inferCategoryFromTitle(titleInput.value);
        }

        titleInput.addEventListener('input', refreshPreview);
        refreshPreview();
    }

    function initMoneyValidation() {
        Array.prototype.slice.call(document.querySelectorAll('form[data-require-money]')).forEach(function (form) {
            form.addEventListener('submit', function (event) {
                var input = form.querySelector('[data-money-input]');

                if (input && parseMoney(input.value) <= 0) {
                    event.preventDefault();
                    window.alert('Informe um valor maior que zero.');
                    input.focus();
                }
            });
        });
    }

    function initConfirmations() {
        Array.prototype.slice.call(document.querySelectorAll('form[data-confirm]')).forEach(function (form) {
            form.addEventListener('submit', function (event) {
                var message = form.getAttribute('data-confirm') || 'Confirmar acao?';

                if (!window.confirm(message)) {
                    event.preventDefault();
                }
            });
        });
    }

    function initAccountCollapse() {
        function isInteractiveAccountTarget(target) {
            return target && target.closest && Boolean(target.closest('button, input, select, textarea, a, label, form'));
        }

        Array.prototype.slice.call(document.querySelectorAll('[data-account-card]')).forEach(function (card) {
            var trigger = card.querySelector('[data-account-toggle]');
            var id = card.getAttribute('data-account-id') || '';
            var key = 'gestao:account-collapsed:v3:' + id;

            if (!trigger || !id || trigger.dataset.gestaoCollapseBound === '1') {
                return;
            }

            function setCollapsed(collapsed) {
                card.classList.toggle('is-collapsed', collapsed);
                trigger.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
                try {
                    window.localStorage.setItem(key, collapsed ? '1' : '0');
                } catch (error) {
                    // Ignore private browsing/storage limitations.
                }
            }

            trigger.dataset.gestaoCollapseBound = '1';
            try {
                setCollapsed(window.localStorage.getItem(key) !== '0');
            } catch (error) {
                setCollapsed(true);
            }

            trigger.addEventListener('click', function (event) {
                if (isInteractiveAccountTarget(event.target)) {
                    return;
                }

                setCollapsed(!card.classList.contains('is-collapsed'));
            });
            trigger.addEventListener('keydown', function (event) {
                if (event.target !== trigger) {
                    return;
                }

                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }

                event.preventDefault();
                setCollapsed(!card.classList.contains('is-collapsed'));
            });
        });
    }

    function initPaymentCollapse() {
        Array.prototype.slice.call(document.querySelectorAll('[data-payment-block]')).forEach(function (block) {
            var button = block.querySelector('[data-payment-toggle]');
            var id = block.getAttribute('data-payment-block-id') || '';
            var key = 'gestao:payments-collapsed:v2:' + id;

            if (!button || !id || button.dataset.gestaoPaymentBound === '1') {
                return;
            }

            function setCollapsed(collapsed) {
                block.classList.toggle('is-collapsed', collapsed);
                button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
                try {
                    window.localStorage.setItem(key, collapsed ? '1' : '0');
                } catch (error) {
                    // Ignore private browsing/storage limitations.
                }
            }

            button.dataset.gestaoPaymentBound = '1';
            try {
                setCollapsed(window.localStorage.getItem(key) !== '0');
            } catch (error) {
                setCollapsed(true);
            }

            button.addEventListener('click', function () {
                setCollapsed(!block.classList.contains('is-collapsed'));
            });
        });
    }

    function initBlockCollapse(selector, buttonSelector, keyPrefix) {
        Array.prototype.slice.call(document.querySelectorAll(selector)).forEach(function (block) {
            var button = block.querySelector(buttonSelector);
            var id = block.getAttribute('data-history-block-id') ||
                block.getAttribute('data-note-block-id') ||
                block.getAttribute('data-due-block-id') ||
                block.getAttribute('data-adjust-block-id') ||
                '';
            var key = keyPrefix + ':' + id;

            if (!button || !id || button.dataset.gestaoBlockBound === '1') {
                return;
            }

            function setCollapsed(collapsed) {
                block.classList.toggle('is-collapsed', collapsed);
                button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
                try {
                    window.localStorage.setItem(key, collapsed ? '1' : '0');
                } catch (error) {
                    // Ignore private browsing/storage limitations.
                }
            }

            button.dataset.gestaoBlockBound = '1';
            try {
                setCollapsed(window.localStorage.getItem(key) !== '0');
            } catch (error) {
                setCollapsed(true);
            }

            button.addEventListener('click', function () {
                setCollapsed(!block.classList.contains('is-collapsed'));
            });
        });
    }

    function initItemOptions() {
        Array.prototype.slice.call(document.querySelectorAll('[data-item-row]')).forEach(function (row) {
            var button = row.querySelector('[data-item-toggle]');
            var itemId = row.getAttribute('data-item-id') || '';
            var key = 'gestao:item-open:' + itemId;

            if (!button || !itemId || button.dataset.gestaoItemBound === '1') {
                return;
            }

            function setOpen(open) {
                row.classList.toggle('is-open', open);
                button.setAttribute('aria-expanded', open ? 'true' : 'false');
                try {
                    window.localStorage.setItem(key, open ? '1' : '0');
                } catch (error) {
                    // Ignore private browsing/storage limitations.
                }
            }

            button.dataset.gestaoItemBound = '1';
            try {
                setOpen(window.localStorage.getItem(key) === '1');
            } catch (error) {
                setOpen(false);
            }

            button.addEventListener('click', function () {
                setOpen(!row.classList.contains('is-open'));
            });
        });
    }

    function initTitleEditors() {
        Array.prototype.slice.call(document.querySelectorAll('[data-account-card]')).forEach(function (card) {
            var button = card.querySelector('[data-title-edit-toggle]');
            var panel = card.querySelector('[data-title-edit-panel]');

            if (!button || !panel || button.dataset.gestaoTitleBound === '1') {
                return;
            }

            function setOpen(open) {
                panel.classList.toggle('is-open', open);
                button.setAttribute('aria-expanded', open ? 'true' : 'false');
                if (open && card.classList.contains('is-collapsed')) {
                    card.classList.remove('is-collapsed');
                    var trigger = card.querySelector('[data-account-toggle]');
                    if (trigger) {
                        trigger.setAttribute('aria-expanded', 'true');
                    }
                }
            }

            button.dataset.gestaoTitleBound = '1';
            button.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                setOpen(!panel.classList.contains('is-open'));
                if (panel.classList.contains('is-open')) {
                    var input = panel.querySelector('input[name="titulo"]');
                    if (input) input.focus();
                }
            });
        });
    }

    function initMonthlyDrag() {
        var list = document.querySelector('[data-monthly-sort-list]');
        if (!list || list.dataset.gestaoMonthlyDragBound === '1') {
            return;
        }

        var dragging = null;
        list.dataset.gestaoMonthlyDragBound = '1';

        function items() {
            return Array.prototype.slice.call(list.querySelectorAll('[data-monthly-item]'));
        }

        function csrfToken() {
            var meta = document.querySelector('meta[name="csrf-token"]');
            return meta ? meta.getAttribute('content') || '' : '';
        }

        function basePath() {
            return document.body.getAttribute('data-gestao-base-path') || '/gestao';
        }

        function closestItem(target) {
            return target && target.closest ? target.closest('[data-monthly-item]') : null;
        }

        function afterElement(y) {
            var candidates = items().filter(function (item) {
                return item !== dragging;
            });
            return candidates.reduce(function (closest, item) {
                var box = item.getBoundingClientRect();
                var offset = y - box.top - (box.height / 2);
                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: item };
                }
                return closest;
            }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
        }

        function setSaving(saving) {
            list.classList.toggle('is-saving', saving);
        }

        function saveOrder() {
            var ids = items().map(function (item) {
                return item.getAttribute('data-monthly-account-id') || '';
            }).filter(Boolean);
            if (!ids.length) {
                return Promise.resolve();
            }
            setSaving(true);
            return window.fetch(basePath() + '/api/monthly-order', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken()
                },
                body: JSON.stringify({
                    competencia_mes: list.getAttribute('data-month') || '',
                    ids: ids
                })
            }).then(function (response) {
                if (!response.ok) {
                    throw new Error('Nao consegui salvar a ordem mensal.');
                }
                return response.json();
            }).then(function (payload) {
                if (!payload || payload.ok !== true) {
                    throw new Error(payload && payload.error ? payload.error : 'Nao consegui salvar a ordem mensal.');
                }
            }).catch(function (error) {
                window.alert(error.message || 'Nao consegui salvar a ordem mensal.');
            }).finally(function () {
                setSaving(false);
            });
        }

        list.addEventListener('dragstart', function (event) {
            var item = closestItem(event.target);
            if (!item) {
                return;
            }
            dragging = item;
            item.classList.add('is-dragging');
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', item.getAttribute('data-monthly-account-id') || '');
            }
        });

        list.addEventListener('dragover', function (event) {
            if (!dragging) {
                return;
            }
            event.preventDefault();
            var before = afterElement(event.clientY);
            if (before) {
                list.insertBefore(dragging, before);
            } else {
                list.appendChild(dragging);
            }
        });

        list.addEventListener('dragend', function () {
            if (!dragging) {
                return;
            }
            dragging.classList.remove('is-dragging');
            dragging = null;
            saveOrder();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            bindMoneyInputs(document);
            initTotals();
            initCategoryPreview();
            initDueDaysPreview();
            initRepeatPreview();
            initMoneyValidation();
            initConfirmations();
            initAccountCollapse();
            initPaymentCollapse();
            initBlockCollapse('[data-history-block]', '[data-history-toggle]', 'gestao:history-collapsed:v1');
            initBlockCollapse('[data-note-block]', '[data-note-toggle]', 'gestao:note-collapsed:v2');
            initBlockCollapse('[data-due-block]', '[data-due-toggle]', 'gestao:due-collapsed:v1');
            initBlockCollapse('[data-adjust-block]', '[data-adjust-toggle]', 'gestao:adjust-collapsed:v1');
            initItemOptions();
            initTitleEditors();
            initMonthlyDrag();
        });
    } else {
        bindMoneyInputs(document);
        initTotals();
        initCategoryPreview();
        initDueDaysPreview();
        initRepeatPreview();
        initMoneyValidation();
        initConfirmations();
        initAccountCollapse();
        initPaymentCollapse();
        initBlockCollapse('[data-history-block]', '[data-history-toggle]', 'gestao:history-collapsed:v1');
        initBlockCollapse('[data-note-block]', '[data-note-toggle]', 'gestao:note-collapsed:v2');
        initBlockCollapse('[data-due-block]', '[data-due-toggle]', 'gestao:due-collapsed:v1');
        initBlockCollapse('[data-adjust-block]', '[data-adjust-toggle]', 'gestao:adjust-collapsed:v1');
        initItemOptions();
        initTitleEditors();
        initMonthlyDrag();
    }
}());

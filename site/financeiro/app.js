document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('form[data-no-enter-submit]').forEach(function (form) {
        form.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter') {
                return;
            }

            var target = event.target;
            var tag = target && target.tagName ? target.tagName.toLowerCase() : '';

            if (tag === 'textarea') {
                return;
            }

            event.preventDefault();
        });
    });

    var autosaveForm = document.querySelector('[data-autosave-day]');
    var saveStatus = document.querySelector('[data-save-status]');
    var divergenceField = document.querySelector('[data-divergence-justification]');
    var saveTimer = null;
    var dailyRevenueForm = document.querySelector('[data-daily-revenue-form]');
    var dailyRevenueState = document.querySelector('[data-daily-revenue-save-state]');
    var emptyConfirm = document.querySelector('[data-empty-confirm]');
    var emptyConfirmDate = document.querySelector('[data-empty-confirm-date]');
    var emptyConfirmButton = document.querySelector('[data-empty-confirm-yes]');
    var pendingEmptyDate = '';

    function setStatus(text, state) {
        if (!saveStatus) {
            return;
        }

        saveStatus.textContent = text;
        saveStatus.dataset.state = state || '';
    }

    function syncDivergenceJustification(rawValue) {
        if (!divergenceField) {
            return;
        }

        var limit = parseFloat(divergenceField.dataset.limit || '10');
        var diff = parseFloat(rawValue || '0');

        if (Math.abs(diff) > limit) {
            divergenceField.classList.remove('is-hidden');
        } else {
            divergenceField.classList.add('is-hidden');
        }
    }

    function updateMoney(selector, value, className, rawValue) {
        var node = document.querySelector(selector);

        if (!node) {
            return;
        }

        node.textContent = value || 'R$ 0,00';
        if (className) {
            node.classList.remove('is-positive', 'is-negative', 'is-zero');
            node.classList.add(className);
        }

        if (rawValue !== undefined) {
            node.dataset.sobraRaw = rawValue;
        }
    }

    function updateFaturamentoHint(value) {
        var hint = document.querySelector('[data-faturamento-hint]');

        if (!hint) {
            return;
        }

        if (value) {
            hint.textContent = 'Lancado em ' + value;
            hint.classList.remove('is-empty');
        } else {
            hint.textContent = '';
            hint.classList.add('is-empty');
        }
    }

    function parseBrazilMoney(value) {
        value = String(value || '').trim().toLowerCase();
        value = value.replace(/[^\d,.-]/g, '');

        if (!value) {
            return 0;
        }

        if (value.indexOf(',') !== -1) {
            value = value.replace(/\./g, '').replace(',', '.');
        }

        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function formatBrazilMoney(value) {
        return Number(value || 0).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function updateDailyRevenueTotal() {
        var box = document.querySelector('[data-daily-revenue-total]');
        if (!box) {
            return;
        }

        var total = 0;
        document.querySelectorAll('[data-daily-revenue-input]').forEach(function (input) {
            if (input.disabled) {
                return;
            }
            total += parseBrazilMoney(input.value);
        });

        box.textContent = 'Total digitado: ' + formatBrazilMoney(total);
        box.classList.add('is-updated');
        window.setTimeout(function () {
            box.classList.remove('is-updated');
        }, 160);
    }

    function setDailyRevenueState(text, state) {
        if (!dailyRevenueState) {
            return;
        }

        dailyRevenueState.textContent = text;
        dailyRevenueState.dataset.state = state || '';
    }

    function reportFormValue(name, fallback) {
        if (!dailyRevenueForm) {
            return fallback || '';
        }

        var field = dailyRevenueForm.querySelector('[name="' + name + '"]');
        return field ? field.value : (fallback || '');
    }

    function parseJsonResponse(response, fallbackMessage) {
        return response.text().then(function (text) {
            var json = null;

            try {
                json = text ? JSON.parse(text) : {};
            } catch (error) {
                throw new Error(response.status === 401
                    ? 'Sessao expirada. Entre novamente no financeiro.'
                    : (fallbackMessage || 'Nao consegui confirmar com o servidor. Atualize a tela e tente de novo.'));
            }

            if (!response.ok || !json.ok) {
                throw new Error(json.message || fallbackMessage || 'Nao foi possivel salvar.');
            }

            return json;
        });
    }

    function formatDailyRevenueInput(input) {
        if (String(input.value || '').trim() === '') {
            input.value = '';
            return;
        }

        var value = parseBrazilMoney(input.value);
        input.value = value >= 0 ? value.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }) : '';
    }

    function saveDailyRevenueInput(input) {
        if (!dailyRevenueForm || !input || input.disabled) {
            return;
        }

        var entryDate = input.dataset.revenueDate || '';
        var tokenField = dailyRevenueForm.querySelector('input[name="csrf_token"]');
        if (!entryDate || !tokenField) {
            return;
        }

        var body = new FormData();
        body.set('csrf_token', tokenField.value);
        body.set('action', 'save_report_faturamento_auto');
        body.set('ajax', '1');
        body.set('entry_date', entryDate);
        body.set('valor', input.value);
        body.set('rel_ano', reportFormValue('rel_ano', dailyRevenueForm.dataset.reportYear));
        body.set('rel_mes', reportFormValue('rel_mes', dailyRevenueForm.dataset.reportMonth));
        body.set('data_fechamento', reportFormValue('data_fechamento', entryDate));

        setDailyRevenueState('Salvando...', 'saving');

        fetch('/financeiro/', {
            method: 'POST',
            headers: { 'Accept': 'application/json' },
            body: body
        }).then(function (response) {
            return parseJsonResponse(response, 'Nao foi possivel salvar o faturamento.');
        }).then(function (json) {
            if (json.total_faturamento) {
                var box = document.querySelector('[data-daily-revenue-total]');
                if (box) {
                    box.textContent = 'Total digitado: ' + json.total_faturamento;
                }
            }
            setDailyRevenueState('Salvo automaticamente.', 'saved');
        }).catch(function (error) {
            setDailyRevenueState(error.message || 'Falha ao salvar.', 'error');
        });
    }

    function autosaveDay() {
        if (!autosaveForm) {
            return;
        }

        var body = new FormData(autosaveForm);
        body.set('action', 'save_day');
        body.set('ajax', '1');

        setStatus('Salvando...', 'saving');

        fetch('/financeiro/', {
            method: 'POST',
            headers: { 'Accept': 'application/json' },
            body: body
        }).then(function (response) {
            return parseJsonResponse(response, 'Nao foi possivel salvar o dia.');
        }).then(function (json) {
            updateMoney('[data-total-conferido]', json.total_conferido);
            updateMoney('[data-total-sistema]', json.total_sistema);
            updateMoney('[data-sobra-falta]', json.sobra_falta, json.sobra_falta_class, json.sobra_falta_raw);
            updateFaturamentoHint(json.faturamento_registrado_em);
            syncDivergenceJustification(json.sobra_falta_raw);
            setStatus('Salvo automaticamente', 'saved');
        }).catch(function (error) {
            setStatus(error.message, 'error');
        });
    }

    function autosaveFields() {
        if (!autosaveForm) {
            return [];
        }

        var fields = Array.prototype.slice.call(autosaveForm.querySelectorAll('input, textarea'));

        if (autosaveForm.id) {
            fields = fields.concat(Array.prototype.slice.call(document.querySelectorAll('input[form="' + autosaveForm.id + '"], textarea[form="' + autosaveForm.id + '"]')));
        }

        return fields.filter(function (field, index, allFields) {
            return allFields.indexOf(field) === index;
        });
    }

    var initialDiff = document.querySelector('[data-sobra-falta]');
    if (initialDiff) {
        syncDivergenceJustification(initialDiff.dataset.sobraRaw || '0');
    }

    if (autosaveForm) {
        autosaveFields().forEach(function (field) {
            if (field.type === 'hidden' || field.disabled) {
                return;
            }

            field.addEventListener('input', function () {
                clearTimeout(saveTimer);
                setStatus('Alteracao pendente...', 'pending');
                saveTimer = setTimeout(autosaveDay, 750);
            });

            field.addEventListener('blur', function () {
                clearTimeout(saveTimer);
                autosaveDay();
            });
        });

        autosaveForm.addEventListener('submit', function (event) {
            var button = event.submitter;

            if (!button || button.value !== 'close_empty') {
                return;
            }

            var hidden = autosaveForm.querySelector('input[name="observacao_sem_movimento"]');
            if (!hidden) {
                hidden = document.createElement('input');
                hidden.type = 'hidden';
                hidden.name = 'observacao_sem_movimento';
                autosaveForm.appendChild(hidden);
            }
            hidden.value = 'Sem movimento.';
        });
    }

    document.querySelectorAll('[data-daily-revenue-input]').forEach(function (input) {
        input.addEventListener('input', function () {
            updateDailyRevenueTotal();
            window.clearTimeout(input._dailyRevenueTimer);
            setDailyRevenueState('Alteracao pendente...', 'pending');
            input._dailyRevenueTimer = window.setTimeout(function () {
                saveDailyRevenueInput(input);
            }, 850);
        });

        input.addEventListener('blur', function () {
            if (input.disabled) {
                return;
            }
            window.clearTimeout(input._dailyRevenueTimer);
            formatDailyRevenueInput(input);
            updateDailyRevenueTotal();
            saveDailyRevenueInput(input);
        });
    });

    document.querySelectorAll('[data-empty-day]').forEach(function (button) {
        button.addEventListener('click', function () {
            if (button.disabled || !emptyConfirm) {
                return;
            }

            pendingEmptyDate = button.dataset.emptyDay || '';
            if (emptyConfirmDate) {
                var dateParts = pendingEmptyDate.split('-');
                emptyConfirmDate.textContent = dateParts.length === 3
                    ? 'Dia ' + dateParts[2] + '/' + dateParts[1] + '/' + dateParts[0]
                    : 'Dia selecionado';
            }
            emptyConfirm.hidden = false;
        });
    });

    document.querySelector('[data-empty-cancel]')?.addEventListener('click', function () {
        pendingEmptyDate = '';
        if (emptyConfirm) {
            emptyConfirm.hidden = true;
        }
    });

    emptyConfirm?.addEventListener('click', function (event) {
        if (event.target === emptyConfirm) {
            pendingEmptyDate = '';
            emptyConfirm.hidden = true;
        }
    });

    emptyConfirmButton?.addEventListener('click', function () {
        if (!dailyRevenueForm || !pendingEmptyDate) {
            return;
        }

        var tokenField = dailyRevenueForm.querySelector('input[name="csrf_token"]');
        if (!tokenField) {
            return;
        }

        var body = new FormData();
        body.set('csrf_token', tokenField.value);
        body.set('action', 'close_report_empty_day');
        body.set('ajax', '1');
        body.set('entry_date', pendingEmptyDate);
        body.set('rel_ano', reportFormValue('rel_ano', dailyRevenueForm.dataset.reportYear));
        body.set('rel_mes', reportFormValue('rel_mes', dailyRevenueForm.dataset.reportMonth));
        body.set('data_fechamento', pendingEmptyDate);

        emptyConfirmButton.disabled = true;
        setDailyRevenueState('Fechando sem movimento...', 'saving');

        fetch('/financeiro/', {
            method: 'POST',
            headers: { 'Accept': 'application/json' },
            body: body
        }).then(function (response) {
            return parseJsonResponse(response, 'Nao foi possivel fechar o dia.');
        }).then(function () {
            setDailyRevenueState('Dia fechado sem movimento.', 'saved');
            window.location.reload();
        }).catch(function (error) {
            emptyConfirmButton.disabled = false;
            setDailyRevenueState(error.message || 'Falha ao fechar.', 'error');
        });
    });

    updateDailyRevenueTotal();

});

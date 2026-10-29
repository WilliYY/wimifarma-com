(function () {
  var body = document.body;
  var basePath = body ? body.getAttribute('data-base-path') || '/login-senha' : '/login-senha';
  var csrfMeta = document.querySelector('meta[name="csrf-token"]');
  var csrfToken = csrfMeta ? csrfMeta.getAttribute('content') || '' : '';
  var mask = '********';
  var hiddenEntries = Object.create(null);

  function closestButton(target) {
    return target && target.closest ? target.closest('[data-vault-action]') : null;
  }

  function entryFromButton(button) {
    return button.closest('.vault-entry, .vault-entry-row');
  }

  function outputFromEntry(entry) {
    return entry ? entry.querySelector('.vault-secret-output, .vault-row-password-output') : null;
  }

  function closestEntryRow(target) {
    return target && target.closest ? target.closest('.vault-entry-row') : null;
  }

  function editorForRow(row) {
    if (!row) return null;
    var id = row.getAttribute('data-entry-id') || '';
    return id ? document.getElementById('vault-entry-editor-' + id) : null;
  }

  function closeEntryEditor(row) {
    if (!row) return;
    var editor = editorForRow(row);
    row.classList.remove('is-selected');
    row.setAttribute('aria-expanded', 'false');
    var editButton = row.querySelector('[data-vault-action="edit"]');
    if (editButton) editButton.setAttribute('aria-expanded', 'false');
    if (editor) {
      editor.hidden = true;
    }
  }

  function toggleEntryEditor(row) {
    if (!row) return;
    var id = row.getAttribute('data-entry-id') || '';
    var editor = id ? document.getElementById('vault-entry-editor-' + id) : null;
    if (!editor) return;
    var willOpen = editor.hidden;
    document.querySelectorAll('.vault-entry-row.is-selected').forEach(function (openRow) {
      if (openRow !== row) closeEntryEditor(openRow);
    });
    row.classList.toggle('is-selected', willOpen);
    row.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    var editButton = row.querySelector('[data-vault-action="edit"]');
    if (editButton) editButton.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    editor.hidden = !willOpen;
    if (willOpen) {
      var firstInput = editor.querySelector('input[name="name"]');
      if (firstInput) window.setTimeout(function () { firstInput.focus(); }, 30);
    }
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (button.classList.contains('vault-icon-btn')) {
      button.disabled = busy;
      button.classList.toggle('is-busy', busy);
      return;
    }
    if (!button.dataset.originalLabel) {
      button.dataset.originalLabel = button.textContent || '';
    }
    button.disabled = busy;
    if (label) button.textContent = label;
    if (!busy && !label) button.textContent = button.dataset.originalLabel || '';
  }

  function postEntryAction(id, action) {
    return fetch(basePath + '/api/entries/' + encodeURIComponent(id) + '/' + action, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'X-CSRF-Token': csrfToken
      }
    }).then(function (response) {
      return response.json().catch(function () {
        return { ok: false, error: 'Resposta invalida.' };
      }).then(function (data) {
        if (!response.ok || !data.ok) {
          throw new Error(data.error || 'Falha na acao.');
        }
        return data;
      });
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      if (!document.execCommand('copy')) {
        throw new Error('Nao foi possivel copiar. Selecione o texto e use Ctrl+C.');
      }
    } catch (error) {
      return Promise.reject(error);
    } finally {
      document.body.removeChild(textarea);
    }
    return Promise.resolve();
  }

  function setRevealButtonLabel(button, visible) {
    if (!button) return;
    var label = visible ? 'Ocultar senha' : 'Mostrar senha';
    button.classList.toggle('is-revealed', visible);
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    if (!button.classList.contains('vault-icon-btn')) {
      button.textContent = visible ? 'Ocultar' : 'Mostrar';
    }
  }

  function setEntryPassword(entry, password, visible) {
    var id = entry.getAttribute('data-entry-id') || '';
    var row = document.querySelector('.vault-entry-row[data-entry-id="' + id + '"]');
    var editor = editorForRow(row);
    [row, editor].forEach(function (container) {
      if (!container) return;
      var output = outputFromEntry(container);
      if (output) {
        output.type = visible ? 'text' : 'password';
        output.value = visible ? password : mask;
        output.removeAttribute('aria-invalid');
        output.removeAttribute('title');
      }
      setRevealButtonLabel(container.querySelector('[data-vault-action="row-reveal"], [data-vault-action="reveal"]'), visible);
    });
  }

  function showInitialPasswords() {
    var rows = Array.prototype.slice.call(document.querySelectorAll('.vault-entry-row'));
    function revealNext() {
      var row = rows.shift();
      if (!row) return;
      var id = row.getAttribute('data-entry-id');
      var button = row.querySelector('[data-vault-action="row-reveal"]');
      setBusy(button, true);
      postEntryAction(id, 'reveal').then(function (data) {
        if (!hiddenEntries[id]) setEntryPassword(row, data.password || '', true);
      }).catch(function (error) {
        if (hiddenEntries[id]) return;
        [row, editorForRow(row)].forEach(function (container) {
          var output = outputFromEntry(container);
          if (!output || output.value) return;
          output.placeholder = 'Senha indisponivel';
          output.setAttribute('aria-invalid', 'true');
          output.setAttribute('title', error.message || 'Nao foi possivel carregar a senha.');
        });
      }).finally(function () {
        setBusy(button, false);
        revealNext();
      });
    }
    for (var index = 0; index < Math.min(4, rows.length); index += 1) revealNext();
  }

  function normalizeSearch(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
  }

  function filterEntries() {
    var search = document.getElementById('vault-search');
    var category = document.getElementById('vault-category-filter');
    var query = normalizeSearch(search ? search.value : '');
    var categoryValue = category ? category.value : '';
    var visible = 0;
    var rows = document.querySelectorAll('.vault-entry-row');
    rows.forEach(function (row) {
      var matches = (!query || normalizeSearch(row.getAttribute('data-search') || '').includes(query))
        && (!categoryValue || row.getAttribute('data-category') === categoryValue);
      row.hidden = !matches;
      if (!matches) closeEntryEditor(row);
      if (matches) visible += 1;
    });
    document.querySelectorAll('.vault-category').forEach(function (group) {
      group.hidden = !Array.prototype.some.call(group.querySelectorAll('.vault-entry-row'), function (row) {
        return !row.hidden;
      });
    });
    var count = document.getElementById('vault-filter-count');
    var empty = document.getElementById('vault-filter-empty');
    if (count) count.textContent = visible + ' de ' + rows.length + ' acessos';
    if (empty) empty.hidden = visible !== 0 || rows.length === 0;
  }

  ['input', 'change'].forEach(function (type) {
    document.addEventListener(type, function (event) {
      if (event.target && (event.target.id === 'vault-search' || event.target.id === 'vault-category-filter')) {
        filterEntries();
      }
    });
  });

  document.addEventListener('click', function (event) {
    var button = closestButton(event.target);
    if (!button) return;
    var action = button.getAttribute('data-vault-action') || '';
    var id = button.getAttribute('data-entry-id') || '';
    var entry = entryFromButton(button);
    var output = outputFromEntry(entry);
    if (!id || !action) return;
    event.preventDefault();
    if (action === 'edit') {
      toggleEntryEditor(closestEntryRow(button));
      return;
    }

    if ((action === 'reveal' || action === 'row-reveal') && output && output.type === 'text' && output.value !== '') {
      hiddenEntries[id] = true;
      setEntryPassword(entry, '', false);
      return;
    }
    if (action === 'reveal' || action === 'row-reveal') delete hiddenEntries[id];

    event.preventDefault();
    setBusy(button, true, '...');

    var endpoint = action === 'copy-login' ? 'copy-login'
      : action === 'copy-password' ? 'copy-password'
      : 'reveal';

    postEntryAction(id, endpoint).then(function (data) {
      if (action === 'copy-login') {
        return copyText(data.login_username || '').then(function () {
          setBusy(button, false, 'Copiado');
          window.setTimeout(function () { setBusy(button, false); }, 1200);
        });
      }
      if (action === 'copy-password') {
        return copyText(data.password || '').then(function () {
          setBusy(button, false, 'Copiado');
          window.setTimeout(function () { setBusy(button, false); }, 1200);
        });
      }
      setBusy(button, false);
      if (!hiddenEntries[id]) setEntryPassword(entry, data.password || '', true);
      return null;
    }).catch(function (error) {
      window.alert(error && error.message ? error.message : 'Falha na acao.');
      setBusy(button, false);
    });
  });

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || !form.matches || !form.matches('[data-confirm]')) return;
    var message = form.getAttribute('data-confirm') || 'Confirmar?';
    if (!window.confirm(message)) {
      event.preventDefault();
    }
  });

  filterEntries();
  showInitialPasswords();
}());

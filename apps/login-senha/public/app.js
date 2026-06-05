(function () {
  var body = document.body;
  var basePath = body ? body.getAttribute('data-base-path') || '/login-senha' : '/login-senha';
  var csrfMeta = document.querySelector('meta[name="csrf-token"]');
  var csrfToken = csrfMeta ? csrfMeta.getAttribute('content') || '' : '';
  var mask = '********';

  function closestButton(target) {
    return target && target.closest ? target.closest('[data-vault-action]') : null;
  }

  function entryFromButton(button) {
    return button.closest('.vault-entry');
  }

  function outputFromEntry(entry) {
    return entry ? entry.querySelector('.vault-secret-output') : null;
  }

  function closestEntryRow(target) {
    return target && target.closest ? target.closest('.vault-entry-row') : null;
  }

  function closeEntryEditor(row) {
    if (!row) return;
    var id = row.getAttribute('data-entry-id') || '';
    var editor = id ? document.getElementById('vault-entry-editor-' + id) : null;
    row.classList.remove('is-selected');
    row.setAttribute('aria-expanded', 'false');
    if (editor) {
      hidePassword(
        editor.querySelector('.vault-secret-output'),
        editor.querySelector('[data-vault-action="reveal"]')
      );
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
    editor.hidden = !willOpen;
    if (willOpen) {
      var firstInput = editor.querySelector('input[name="name"]');
      if (firstInput) window.setTimeout(function () { firstInput.focus(); }, 30);
    }
  }

  function setBusy(button, busy, label) {
    if (!button) return;
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
      document.execCommand('copy');
    } finally {
      document.body.removeChild(textarea);
    }
    return Promise.resolve();
  }

  function hidePassword(output, button) {
    if (!output) return;
    output.type = 'password';
    output.value = mask;
    if (button) button.textContent = 'Mostrar';
  }

  document.addEventListener('click', function (event) {
    var button = closestButton(event.target);
    if (!button) {
      var row = closestEntryRow(event.target);
      if (row) {
        event.preventDefault();
        toggleEntryEditor(row);
      }
      return;
    }
    var action = button.getAttribute('data-vault-action') || '';
    var id = button.getAttribute('data-entry-id') || '';
    var entry = entryFromButton(button);
    var output = outputFromEntry(entry);
    if (!id || !action) return;

    if (action === 'reveal' && output && output.type === 'text') {
      hidePassword(output, button);
      return;
    }

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
      if (output) {
        output.type = 'text';
        output.value = data.password || '';
        button.textContent = 'Ocultar';
        window.setTimeout(function () { hidePassword(output, button); }, 15000);
      }
      button.disabled = false;
      return null;
    }).catch(function (error) {
      window.alert(error && error.message ? error.message : 'Falha na acao.');
      setBusy(button, false);
    });
  });

  document.addEventListener('keydown', function (event) {
    var row = closestEntryRow(event.target);
    if (!row) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggleEntryEditor(row);
  });

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || !form.matches || !form.matches('[data-confirm]')) return;
    var message = form.getAttribute('data-confirm') || 'Confirmar?';
    if (!window.confirm(message)) {
      event.preventDefault();
    }
  });
}());

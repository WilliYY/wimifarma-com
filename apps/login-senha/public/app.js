(function () {
  var body = document.body;
  var basePath = body ? body.getAttribute('data-base-path') || '/login-senha' : '/login-senha';
  var csrfMeta = document.querySelector('meta[name="csrf-token"]');
  var csrfToken = csrfMeta ? csrfMeta.getAttribute('content') || '' : '';
  var mask = '********';
  var draggedRow = null;
  var dragStartOrder = '';
  var lastDragAt = 0;

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

  function closestDragHandle(target) {
    return target && target.closest ? target.closest('[data-vault-drag-handle]') : null;
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
      document.execCommand('copy');
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

  function hidePassword(output, button) {
    if (!output) return;
    output.type = 'password';
    output.value = mask;
    setRevealButtonLabel(button, false);
  }

  function currentOrder() {
    return Array.prototype.map.call(document.querySelectorAll('.vault-entry-row'), function (row) {
      return row.getAttribute('data-entry-id') || '';
    }).filter(Boolean);
  }

  function updateRowNumbers() {
    document.querySelectorAll('.vault-entry-row').forEach(function (row, index) {
      var number = row.querySelector('.vault-row-number');
      if (number) number.textContent = String(index + 1);
    });
  }

  function moveRowPair(row, target, placeAfter) {
    if (!row || !target || row === target) return;
    var tbody = row.parentNode;
    var editor = editorForRow(row);
    var targetEditor = editorForRow(target);
    var reference = placeAfter ? (targetEditor || target).nextSibling : target;
    tbody.insertBefore(row, reference);
    if (editor) tbody.insertBefore(editor, row.nextSibling);
  }

  function postOrder(order) {
    return fetch(basePath + '/api/entries/reorder', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ order: order })
    }).then(function (response) {
      return response.json().catch(function () {
        return { ok: false, error: 'Resposta invalida.' };
      }).then(function (data) {
        if (!response.ok || !data.ok) {
          throw new Error(data.error || 'Falha ao salvar ordem.');
        }
        return data;
      });
    });
  }

  function saveOrderIfChanged() {
    var order = currentOrder();
    if (!dragStartOrder || order.join(',') === dragStartOrder) return;
    var wrap = document.querySelector('.vault-entry-table-wrap');
    if (wrap) wrap.classList.add('is-saving-order');
    postOrder(order).then(function () {
      if (wrap) wrap.classList.remove('is-saving-order');
    }).catch(function (error) {
      if (wrap) wrap.classList.remove('is-saving-order');
      window.alert(error && error.message ? error.message : 'Falha ao salvar ordem.');
      window.location.reload();
    });
  }

  function finishDrag() {
    if (!draggedRow) return;
    draggedRow.classList.remove('is-dragging');
    document.querySelectorAll('.vault-entry-row.is-drop-target').forEach(function (row) {
      row.classList.remove('is-drop-target');
    });
    lastDragAt = Date.now();
    saveOrderIfChanged();
    draggedRow = null;
    dragStartOrder = '';
  }

  document.addEventListener('click', function (event) {
    if (Date.now() - lastDragAt < 250) {
      event.preventDefault();
      return;
    }
    if (closestDragHandle(event.target)) {
      event.preventDefault();
      return;
    }
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

    if ((action === 'reveal' || action === 'row-reveal') && output && output.type === 'text') {
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
        setRevealButtonLabel(button, true);
        window.setTimeout(function () { hidePassword(output, button); }, 15000);
      }
      button.disabled = false;
      return null;
    }).catch(function (error) {
      window.alert(error && error.message ? error.message : 'Falha na acao.');
      setBusy(button, false);
    });
  });

  document.addEventListener('dragstart', function (event) {
    var row = closestEntryRow(event.target);
    if (!row || !row.draggable) return;
    draggedRow = row;
    dragStartOrder = currentOrder().join(',');
    document.querySelectorAll('.vault-entry-row.is-selected').forEach(closeEntryEditor);
    row.classList.add('is-dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', row.getAttribute('data-entry-id') || '');
    }
  });

  document.addEventListener('dragover', function (event) {
    if (!draggedRow) return;
    var target = closestEntryRow(event.target);
    if (!target || target === draggedRow) return;
    event.preventDefault();
    var rect = target.getBoundingClientRect();
    var placeAfter = event.clientY > rect.top + rect.height / 2;
    moveRowPair(draggedRow, target, placeAfter);
    updateRowNumbers();
    target.classList.add('is-drop-target');
  });

  document.addEventListener('drop', function (event) {
    if (!draggedRow) return;
    event.preventDefault();
    finishDrag();
  });

  document.addEventListener('dragend', finishDrag);

  document.addEventListener('keydown', function (event) {
    if (closestDragHandle(event.target)) return;
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

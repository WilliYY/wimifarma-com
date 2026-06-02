(function () {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';

  function closestButton(target) {
    return target && target.closest ? target.closest('[data-password-generate], [data-password-toggle], [data-password-copy]') : null;
  }

  function passwordControl(button) {
    return button ? button.closest('[data-password-control]') : null;
  }

  function passwordInput(control) {
    return control ? control.querySelector('[data-password-input]') : null;
  }

  function statusNode(control) {
    var label = control ? control.closest('.users-password-label') : null;
    return label ? label.querySelector('[data-password-status]') : null;
  }

  function setStatus(control, text, kind) {
    var node = statusNode(control);
    if (!node) return;
    node.textContent = text;
    node.classList.remove('ok', 'warn');
    if (kind) node.classList.add(kind);
  }

  function updatePasswordHint(input) {
    var control = input ? input.closest('[data-password-control]') : null;
    if (!control || input.readOnly) return;
    var value = input.value || '';
    if (!value) {
      setStatus(
        control,
        input.required
          ? 'Senha simples e permitida; ela fica com hash seguro e cofre ADM criptografado.'
          : 'Deixe vazio para manter a senha atual.',
        ''
      );
      return;
    }
    if (value.length < 6) {
      setStatus(control, 'Senha fraca, mas permitida. O login continua protegido por hash seguro.', 'warn');
      return;
    }
    setStatus(control, 'Senha aceita. O login continua protegido por hash seguro.', 'ok');
  }

  function randomIndex(max) {
    if (window.crypto && window.crypto.getRandomValues) {
      var bytes = new Uint32Array(1);
      window.crypto.getRandomValues(bytes);
      return bytes[0] % max;
    }
    return Math.floor(Math.random() * max);
  }

  function generatePassword() {
    var output = '';
    for (var index = 0; index < 14; index += 1) {
      output += chars.charAt(randomIndex(chars.length));
    }
    return output;
  }

  function copyInput(input) {
    if (!input || !input.value) return Promise.reject(new Error('empty'));
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(input.value);
    }
    input.focus();
    input.select();
    var ok = document.execCommand && document.execCommand('copy');
    return ok ? Promise.resolve() : Promise.reject(new Error('copy_failed'));
  }

  document.addEventListener('click', function (event) {
    var button = closestButton(event.target);
    if (!button) return;
    var control = passwordControl(button);
    var input = passwordInput(control);
    if (!control || !input) return;

    if (button.hasAttribute('data-password-generate')) {
      input.value = generatePassword();
      input.type = 'text';
      var toggle = control.querySelector('[data-password-toggle]');
      if (toggle) toggle.textContent = 'Ocultar';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
      input.select();
      setStatus(control, 'Senha gerada. Confira, copie e salve.', 'ok');
      return;
    }

    if (button.hasAttribute('data-password-toggle')) {
      var visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      button.textContent = visible ? 'Mostrar' : 'Ocultar';
      setStatus(control, visible ? 'Senha oculta no campo.' : 'Senha visivel no campo.', visible ? '' : 'warn');
      return;
    }

    if (button.hasAttribute('data-password-copy')) {
      copyInput(input)
        .then(function () {
          setStatus(control, 'Senha copiada.', 'ok');
        })
        .catch(function () {
          setStatus(control, 'Digite ou gere uma senha antes de copiar.', 'warn');
        });
    }
  });

  document.addEventListener('input', function (event) {
    var input = event.target && event.target.matches ? event.target : null;
    if (!input || !input.matches('[data-password-input]')) return;
    updatePasswordHint(input);
  });
}());

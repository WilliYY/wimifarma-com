(function () {
  var ignoredSelector = [
    'a',
    'button',
    'input',
    'select',
    'textarea',
    'label',
    'summary',
    'form',
    '[role="button"]',
    '[contenteditable="true"]',
    '.users-integrations',
    '.users-user-history',
  ].join(', ');

  function shouldIgnoreClick(target) {
    return target && target.closest && target.closest(ignoredSelector);
  }

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;

    var card = target.closest('.users-user');
    if (!card || shouldIgnoreClick(target)) return;

    var editDetails = card.querySelector('.users-edit-details');
    if (!editDetails) return;

    editDetails.open = !editDetails.open;
  });
})();

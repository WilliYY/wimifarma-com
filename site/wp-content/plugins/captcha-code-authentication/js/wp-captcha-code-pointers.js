/**
 * Captcha Code
 * Backend GUI pointers
 * (c) WebFactory Ltd, 2022 - 2026, www.webfactoryltd.com
 */

jQuery(document).ready(function($){
  if (typeof wp_captcha_code_pointers  == 'undefined') {
    return;
  }

  $.each(wp_captcha_code_pointers, function(index, pointer) {
    if (index.charAt(0) == '_') {
      return true;
    }
    $(pointer.target).pointer({
        content: '<h3>WP Captcha</h3><p>' + pointer.content + '</p>',
        pointerWidth: 380,
        position: {
            edge: pointer.edge,
            align: pointer.align
        },
        close: function() {
                $.get(ajaxurl, {
                    action: "wp_captcha_code_dismiss_pointers",
                    notice_name: index,
                    _ajax_nonce: wp_captcha_code_pointers.dismiss_pointer_nonce
                });
        }
      }).pointer('open');
  });
});

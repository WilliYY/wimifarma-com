jQuery(document).ready(function ($) {
  $('#wpwrap').on('click', '.open-upsell', function (e) {
    e.preventDefault();
    feature = $(this).data('feature');
    $(this).blur();
    open_upsell(feature);

    return false;
  });

  $('#wpwrap').on('click', '.open-pro-dialog', function (e) {
    e.preventDefault();
    $(this).blur();

    pro_feature = $(this).data('pro-feature');
    if (!pro_feature) {
      pro_feature = $(this).parent('label').attr('for');
    }
    open_upsell(pro_feature);

    return false;
  });

  $('#wp-captcha-code-pro-dialog').dialog({
    dialogClass: 'wp-dialog wp-captcha-code-pro-dialog',
    modal: true,
    resizable: false,
    width: 850,
    height: 'auto',
    show: 'fade',
    hide: 'fade',
    close: function (event, ui) {},
    open: function (event, ui) {
      $(this).siblings().find('span.ui-dialog-title').html('WP Captcha PRO is here!');
      wp_captcha_code_fix_dialog_close(event, ui);
    },
    autoOpen: false,
    closeOnEscape: true,
  });

  function clean_feature(feature) {
    feature = feature || 'captcha-code-unknown';
    feature = feature.toLowerCase();
    feature = feature.replace(' ', '-');

    return feature;
  }

  function open_upsell(feature) {
    feature = clean_feature(feature);

    $('#wp-captcha-code-pro-dialog').dialog('open');

    $('#wp-captcha-code-pro-table .button-buy').each(function (ind, el) {
      tmp = $(el).data('href-org');
      tmp = tmp.replace('pricing-table', feature);
      $(el).attr('href', tmp);
    });
  } // open_upsell

  // show upsell popup every 4 months
  if (window.localStorage.getItem('captcha_upsell_timestamp') === null ||
      (new Date().getTime() / 1000 - window.localStorage.getItem('captcha_upsell_timestamp')) > (86400 * 120)) {
    window.localStorage.setItem('captcha_upsell_timestamp', Math.round(new Date().getTime() / 1000));

    open_upsell('cc-welcome');
  }

  if (window.location.hash == '#get-pro') {
    open_upsell('cc-url-hash');
    window.location.hash = '';
  }

  $('.install-wp301').on('click', function (e) {
    e.preventDefault();

    if (
      !confirm(
        'The free WP 301 Redirects plugin will be installed & activated from the official WordPress repository. Click OK to proceed.'
      )
    ) {
      return false;
    }

    jQuery('body').append(
      '<div style="width:550px;height:450px; position:fixed;top:10%;left:50%;margin-left:-275px; color:#444; background-color: #fbfbfb;border:1px solid #DDD; border-radius:4px;box-shadow: 0px 0px 0px 4000px rgba(0, 0, 0, 0.85);z-index: 9999999;"><iframe src="' +
        wp_captcha_code_vars.wp301_install_url +
        '" style="width:100%;height:100%;border:none;" /></div>'
    );
    jQuery('#wpwrap').css('pointer-events', 'none');

    e.preventDefault();
    return false;
  });

  function wp_captcha_code_fix_dialog_close(event, ui) {
    jQuery('.ui-widget-overlay').bind('click', function () {
      jQuery('#' + event.target.id).dialog('close');
    });
  } // wp_captcha_code_fix_dialog_close

  $('#wpwrap').on('change', 'select', function (e) {
    option_class = $('#' + $(this).attr('id') + ' :selected').attr('class');
    if (option_class == 'pro-option') {
      option_text = $('#' + $(this).attr('id') + ' :selected').text();
      value = $('#' + $(this).attr('id') + ' :selected').attr('value');
      $(this).val('builtin');
      $(this).trigger('change');
      open_upsell($(this).attr('id') + '-' + value);
      $('.show_if_' + $(this).attr('id')).hide();
    }
  });
});


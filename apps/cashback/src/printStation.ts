import crypto from 'crypto';

export const PRINT_STATION_COOKIE = 'WFWIMIPRINT';
export const PRINT_STATION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
export const PRINT_STATION_PROTOCOL_VERSION = 'web-1';

export type PrintStationDevice = {
  id: number;
  computerName: string;
  printerName: string;
};

type PrintStationPageOptions = {
  basePath: string;
  csrfToken: string;
  device: PrintStationDevice;
  nonce: string;
  serviceVersion: string;
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function createPrintStationToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function isPrintStationToken(value: unknown): value is string {
  return /^[A-Za-z0-9_-]{43}$/.test(String(value ?? ''));
}

export function printStationTokenHash(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function printStationCsrfToken(secret: string, token: string): string {
  return crypto.createHmac('sha256', secret).update(`wimi-print-station:${token}`, 'utf8').digest('base64url');
}

export function printStationCsrfMatches(secret: string, token: string, received: unknown): boolean {
  const candidate = String(received ?? '');
  if (!candidate || candidate.length > 120) return false;
  const expected = Buffer.from(printStationCsrfToken(secret, token), 'utf8');
  const actual = Buffer.from(candidate, 'utf8');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function cookieValue(cookieHeader: unknown, name: string): string {
  const header = String(cookieHeader ?? '');
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return '';
    }
  }
  return '';
}

export function serializePrintStationCookie(token: string, basePath: string, secure: boolean): string {
  const parts = [
    `${PRINT_STATION_COOKIE}=${encodeURIComponent(token)}`,
    `Path=${basePath}`,
    `Max-Age=${PRINT_STATION_COOKIE_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Strict',
    'Priority=High',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearPrintStationCookie(basePath: string, secure: boolean): string {
  const parts = [
    `${PRINT_STATION_COOKIE}=`,
    `Path=${basePath}`,
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
    'SameSite=Strict',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function printStationShortcut(publicStationUrl: string): string {
  const url = publicStationUrl.replace(/[\r\n"]/g, '');
  return [
    '@echo off',
    'setlocal',
    `set "WIMI_URL=${url}"`,
    'set "WIMI_PROFILE=%LocalAppData%\\WimiFarma\\ImpressoraWeb\\ChromeProfile"',
    'set "CHROME=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not exist "%CHROME%" set "CHROME=%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not exist "%CHROME%" (',
    '  echo Google Chrome nao foi encontrado.',
    '  echo Instale o Chrome e execute este atalho novamente.',
    '  pause',
    '  exit /b 1',
    ')',
    'if not exist "%WIMI_PROFILE%" mkdir "%WIMI_PROFILE%"',
    'start "" "%CHROME%" --user-data-dir="%WIMI_PROFILE%" --app="%WIMI_URL%" --kiosk-printing --start-maximized --no-first-run --disable-session-crashed-bubble',
    'endlocal',
    '',
  ].join('\r\n');
}

export function renderPrintStationPage(options: PrintStationPageOptions): string {
  const config = {
    csrf: options.csrfToken,
    heartbeatUrl: `${options.basePath}/internal/print-station/heartbeat`,
    nextJobUrl: `${options.basePath}/internal/print-station/jobs/next`,
    completeBaseUrl: `${options.basePath}/internal/print-station/jobs`,
    logoUrl: `${options.basePath}/logo-wimifarma-receipt.png?v=${options.serviceVersion}`,
    lockName: `wimi-print-station-${options.device.id}`,
  };

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Estacao Web - Wimi Impressora</title>
  <style nonce="${escapeHtml(options.nonce)}">
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #eef5f7;
      color: #25171b;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #eef5f7; }
    button, a { font: inherit; }
    .station-topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      min-height: 72px;
      padding: 12px clamp(18px, 4vw, 48px);
      background: #8f1231;
      color: #fff;
    }
    .station-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .station-brand img { width: 150px; max-width: 36vw; filter: brightness(0) invert(1); }
    .station-brand strong { font-size: 1.05rem; }
    .station-live {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border: 1px solid rgba(255,255,255,.48);
      border-radius: 999px;
      font-weight: 800;
      white-space: nowrap;
    }
    .station-live::before {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #f5b942;
      content: "";
    }
    .station-live.is-online::before { background: #55df9f; box-shadow: 0 0 0 4px rgba(85,223,159,.18); }
    .station-live.is-error::before { background: #ff9aac; }
    .station-main {
      width: min(1180px, calc(100% - 32px));
      margin: 28px auto;
    }
    .station-heading { margin-bottom: 18px; }
    .station-heading span {
      display: block;
      margin-bottom: 5px;
      color: #8f1231;
      font-size: .72rem;
      font-weight: 900;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .station-heading h1 { margin: 0; font-size: clamp(1.8rem, 4vw, 2.65rem); letter-spacing: 0; }
    .station-heading p { margin: 7px 0 0; color: #52606d; }
    .station-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.45fr) minmax(300px, .75fr);
      gap: 16px;
      align-items: stretch;
    }
    .station-panel {
      border: 1px solid #c9dce1;
      border-radius: 8px;
      background: #fff;
      box-shadow: 0 18px 44px rgba(31, 77, 112, .09);
    }
    .station-status-panel { padding: clamp(20px, 4vw, 34px); }
    .station-state {
      display: grid;
      grid-template-columns: 54px minmax(0, 1fr);
      gap: 16px;
      align-items: center;
      min-height: 108px;
      padding-bottom: 24px;
      border-bottom: 1px solid #dce7ea;
    }
    .station-state-icon {
      display: grid;
      width: 54px;
      height: 54px;
      place-items: center;
      border-radius: 50%;
      background: #e6f7f0;
      color: #08724e;
      font-size: 1.45rem;
      font-weight: 900;
    }
    .station-state h2 { margin: 0; font-size: 1.35rem; }
    .station-state p { margin: 5px 0 0; color: #52606d; line-height: 1.45; }
    .station-facts {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin: 22px 0;
    }
    .station-fact {
      min-height: 88px;
      padding: 14px;
      border: 1px solid #dce7ea;
      border-top: 4px solid #2475ad;
      border-radius: 8px;
      background: #f9fcfd;
    }
    .station-fact.is-green { border-top-color: #159466; }
    .station-fact.is-amber { border-top-color: #d78114; }
    .station-fact span, .station-fact small { display: block; color: #52606d; }
    .station-fact strong { display: block; margin: 5px 0 2px; overflow-wrap: anywhere; }
    .station-notice {
      padding: 14px 16px;
      border: 1px solid #e6c46f;
      border-radius: 8px;
      background: #fffaf0;
      color: #65420d;
      line-height: 1.45;
    }
    .station-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
    .station-button {
      display: inline-flex;
      min-height: 44px;
      align-items: center;
      justify-content: center;
      padding: 10px 18px;
      border: 1px solid #8f1231;
      border-radius: 6px;
      background: #8f1231;
      color: #fff;
      font-weight: 850;
      text-decoration: none;
      cursor: pointer;
    }
    .station-button.secondary { background: #fff; color: #8f1231; }
    .station-button:focus-visible { outline: 3px solid #f2b4c4; outline-offset: 2px; }
    .station-preview-panel {
      display: grid;
      min-height: 540px;
      place-items: center;
      padding: 18px;
      background: #f8fbfc;
    }
    .station-preview-empty { max-width: 260px; text-align: center; color: #60717d; }
    .station-preview-empty strong { display: block; margin-bottom: 7px; color: #25171b; }
    .station-receipt {
      width: 76mm;
      max-width: 100%;
      padding: 5mm 4mm;
      border: 1px dashed #67737a;
      background: #fff;
      color: #000;
      font-family: Arial, Helvetica, sans-serif;
      text-align: center;
    }
    .station-receipt[hidden] { display: none; }
    .station-receipt img { display: block; width: 42mm; max-height: 16mm; object-fit: contain; margin: 0 auto 4mm; }
    .receipt-title { margin: 0 0 3mm; font-size: 16px; font-weight: 800; }
    .receipt-eyebrow { margin: 0 0 1mm; font-size: 11px; font-weight: 800; text-transform: uppercase; }
    .receipt-value { margin: 0 0 3mm; font-size: 30px; font-weight: 900; }
    .receipt-code {
      margin: 2mm 0 3mm;
      padding: 2mm 0;
      border-top: 1px solid #000;
      border-bottom: 1px solid #000;
    }
    .receipt-code span { display: block; font-size: 10px; font-weight: 800; text-transform: uppercase; }
    .receipt-code strong { display: block; margin-top: 1mm; font-size: 28px; letter-spacing: 1px; }
    .receipt-customer { margin: 2mm 0; padding: 2mm 0; border-top: 1px dashed #555; border-bottom: 1px dashed #555; }
    .receipt-customer strong, .receipt-customer span { display: block; font-size: 12px; font-weight: 800; }
    .receipt-row {
      display: flex;
      justify-content: space-between;
      gap: 6px;
      padding: 1.4mm 0;
      border-bottom: 1px dotted #777;
      font-size: 12px;
      font-weight: 800;
      text-align: left;
    }
    .receipt-row strong { text-align: right; }
    .receipt-footer { margin-top: 3mm; font-size: 11px; font-weight: 800; line-height: 1.45; }
    .receipt-footer span { display: block; }
    .station-log { margin-top: 14px; color: #60717d; font-size: .82rem; }
    @media (max-width: 820px) {
      .station-grid { grid-template-columns: 1fr; }
      .station-preview-panel { min-height: 440px; }
    }
    @media (max-width: 520px) {
      .station-topbar { align-items: flex-start; }
      .station-brand strong { display: none; }
      .station-main { width: min(100% - 20px, 1180px); margin: 18px auto; }
      .station-facts { grid-template-columns: 1fr; }
      .station-state { grid-template-columns: 42px minmax(0, 1fr); }
      .station-state-icon { width: 42px; height: 42px; }
      .station-button { width: 100%; }
    }
    @page { margin: 2mm; }
    @media print {
      body { margin: 0; background: #fff; }
      body * { visibility: hidden !important; }
      #station-receipt {
        visibility: visible !important;
        display: block !important;
        position: absolute;
        inset: 0 auto auto 0;
        width: 76mm;
        max-width: 76mm;
        margin: 0;
        padding: 2mm;
        border: 0;
      }
      #station-receipt * { visibility: visible !important; }
    }
  </style>
</head>
<body>
  <header class="station-topbar">
    <div class="station-brand">
      <img src="${escapeHtml(config.logoUrl)}" alt="WimiFarma">
      <strong>Wimi Impressora Web</strong>
    </div>
    <span class="station-live" id="station-live">Conectando</span>
  </header>
  <main class="station-main">
    <div class="station-heading">
      <span>Computador da Bematech</span>
      <h1>Estacao de impressao</h1>
      <p>Mantenha esta tela aberta. Os comprovantes chegam pela fila segura do Cashback.</p>
    </div>
    <div class="station-grid">
      <section class="station-panel station-status-panel" aria-labelledby="station-state-title">
        <div class="station-state">
          <div class="station-state-icon" id="station-state-icon" aria-hidden="true">W</div>
          <div>
            <h2 id="station-state-title">Preparando a estacao</h2>
            <p id="station-state-message" role="status" aria-live="polite">Validando a conexao segura deste navegador.</p>
          </div>
        </div>
        <div class="station-facts">
          <div class="station-fact is-green"><span>Estacao</span><strong>${escapeHtml(options.device.computerName)}</strong><small>credencial protegida neste navegador</small></div>
          <div class="station-fact"><span>Destino</span><strong>${escapeHtml(options.device.printerName)}</strong><small>impressora padrao do Chrome</small></div>
          <div class="station-fact is-amber"><span>Trabalho atual</span><strong id="station-job">Nenhum</strong><small id="station-job-detail">aguardando fila</small></div>
          <div class="station-fact"><span>Ultimo sinal</span><strong id="station-last-seen">Agora</strong><small>renovado automaticamente</small></div>
        </div>
        <div class="station-notice">
          A Bematech deve estar definida como impressora padrao do Windows. Com o atalho web, o Chrome confirma a impressao automaticamente; sem o atalho, ele abre a tela normal da impressora.
        </div>
        <div class="station-actions">
          <button class="station-button secondary" id="station-reconnect" type="button">Reconectar agora</button>
          <a class="station-button" href="${escapeHtml(options.basePath)}/impressora.php">Abrir painel ADM</a>
        </div>
        <p class="station-log" id="station-log">Nenhum comprovante recebido nesta abertura.</p>
      </section>
      <aside class="station-panel station-preview-panel" aria-label="Previa do comprovante">
        <div class="station-preview-empty" id="station-preview-empty"><strong>Aguardando comprovante</strong><span>A previa aparece aqui antes de ser enviada para a impressora.</span></div>
        <section class="station-receipt" id="station-receipt" hidden aria-label="Comprovante para impressao"></section>
      </aside>
    </div>
  </main>
  <script nonce="${escapeHtml(options.nonce)}">
    (() => {
      'use strict';
      const config = ${safeJson(config)};
      const live = document.getElementById('station-live');
      const title = document.getElementById('station-state-title');
      const message = document.getElementById('station-state-message');
      const icon = document.getElementById('station-state-icon');
      const jobLabel = document.getElementById('station-job');
      const jobDetail = document.getElementById('station-job-detail');
      const lastSeen = document.getElementById('station-last-seen');
      const log = document.getElementById('station-log');
      const receipt = document.getElementById('station-receipt');
      const emptyPreview = document.getElementById('station-preview-empty');
      const reconnect = document.getElementById('station-reconnect');
      let stopped = false;
      let currentJob = null;
      let wakeLock = null;

      const sleep = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
      const money = (cents) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents || 0) / 100);
      const date = (value) => {
        if (!value) return '-';
        const raw = String(value).slice(0, 10);
        const parts = raw.split('-');
        return parts.length === 3 ? parts.reverse().join('/') : raw;
      };
      const dateTime = (value) => {
        const parsed = value ? new Date(value) : new Date();
        return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      };

      function setState(kind, heading, detail) {
        live.className = 'station-live' + (kind === 'online' ? ' is-online' : kind === 'error' ? ' is-error' : '');
        live.textContent = kind === 'online' ? 'Online' : kind === 'error' ? 'Atencao' : 'Conectando';
        title.textContent = heading;
        message.textContent = detail;
        icon.textContent = kind === 'online' ? 'OK' : kind === 'error' ? '!' : 'W';
      }

      async function api(url, body = {}) {
        const response = await fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Wimi-CSRF': config.csrf,
          },
          body: JSON.stringify(body),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok === false) {
          const error = new Error(payload.message || 'Falha temporaria na estacao.');
          error.status = response.status;
          throw error;
        }
        return payload;
      }

      function clearReceipt() {
        receipt.replaceChildren();
        receipt.hidden = true;
        emptyPreview.hidden = false;
      }

      function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = String(text);
        return node;
      }

      function appendFooter(payload) {
        const footer = element('div', 'receipt-footer');
        footer.append(
          element('span', '', 'WhatsApp ' + String(payload.whatsapp || '(44) 98413-4971')),
          element('span', '', String(payload.address || 'Av. Minas Gerais, 2263')),
          element('span', '', 'Emitido por ' + String(payload.attendant_name || payload.requested_by || 'Wimifarma')),
        );
        receipt.append(footer);
      }

      function addReceiptRow(label, value) {
        const row = element('div', 'receipt-row');
        row.append(element('span', '', label), element('strong', '', value));
        receipt.append(row);
      }

      function renderReceipt(job) {
        const payload = job.payload || {};
        receipt.replaceChildren();
        const logo = document.createElement('img');
        logo.src = config.logoUrl;
        logo.alt = 'WimiFarma';
        receipt.append(logo);

        if (job.receipt_type === 'quick_voucher') {
          receipt.append(
            element('h2', 'receipt-title', 'CashBack Wimifarma'),
            element('p', 'receipt-eyebrow', 'Voce ganhou'),
            element('p', 'receipt-value', money(payload.cashback_cents)),
          );
          const code = element('div', 'receipt-code');
          code.append(element('span', '', 'Codigo'), element('strong', '', payload.code || '-'));
          receipt.append(code);
          addReceiptRow('Valido ate', date(payload.expires_at));
          appendFooter(payload);
        } else if (job.receipt_type === 'purchase') {
          receipt.append(element('h2', 'receipt-title', 'Comprovante CashBack'));
          const customer = element('div', 'receipt-customer');
          customer.append(
            element('span', '', 'Cliente cadastrado'),
            element('strong', '', payload.client_name || '-'),
            element('span', '', payload.client_phone || ''),
            element('span', '', 'Codigo do cliente: #' + String(payload.client_code || '-')),
          );
          receipt.append(customer);
          addReceiptRow('Cashback gerado', money(payload.cashback_generated_cents));
          if (payload.successor_code) {
            const code = element('div', 'receipt-code');
            code.append(element('span', '', 'Novo codigo'), element('strong', '', payload.successor_code));
            receipt.append(code);
          }
          addReceiptRow('Valido ate', date(payload.expires_at));
          appendFooter(payload);
          addReceiptRow('Operacao', '#' + String(payload.operation_id || '-') + ' | ' + dateTime(payload.purchased_at));
        } else {
          receipt.append(
            element('h2', 'receipt-title', 'Teste Wimi Impressora Web'),
            element('p', 'receipt-eyebrow', 'Conexao confirmada'),
          );
          addReceiptRow('Estacao', payload.computer_name || '-');
          addReceiptRow('Destino', payload.printer_name || 'Impressora padrao');
          addReceiptRow('Solicitado por', payload.requested_by || 'adm');
          addReceiptRow('Data', dateTime(payload.requested_at));
        }
        emptyPreview.hidden = true;
        receipt.hidden = false;
      }

      async function complete(jobId, status, error = '') {
        return api(config.completeBaseUrl + '/' + encodeURIComponent(jobId) + '/complete', { status, error });
      }

      async function printJob(job) {
        currentJob = job;
        jobLabel.textContent = '#' + job.id;
        jobDetail.textContent = 'preparando comprovante';
        renderReceipt(job);
        setState('online', 'Imprimindo trabalho #' + job.id, 'Aguarde a conclusao da impressao antes de fechar esta tela.');
        await sleep(350);

        let afterPrint;
        const printed = new Promise((resolve) => {
          afterPrint = () => resolve(true);
          window.addEventListener('afterprint', afterPrint, { once: true });
        });
        try {
          window.print();
          const confirmed = await Promise.race([printed, sleep(10 * 60 * 1000).then(() => false)]);
          if (!confirmed) {
            await complete(job.id, 'uncertain', 'O navegador nao confirmou o fim da janela de impressao.');
            setState('error', 'Confira o papel', 'A impressao ficou sem confirmacao. O trabalho nao sera repetido automaticamente.');
            log.textContent = 'Trabalho #' + job.id + ' precisa de conferencia manual.';
          } else {
            await complete(job.id, 'printed');
            setState('online', 'Estacao pronta', 'Impressao solicitada ao navegador. Aguardando o proximo comprovante.');
            log.textContent = 'Trabalho #' + job.id + ' concluido em ' + new Date().toLocaleTimeString('pt-BR') + '.';
          }
        } catch (error) {
          await complete(job.id, 'uncertain', String(error && error.message ? error.message : 'Falha do navegador durante a impressao.')).catch(() => undefined);
          setState('error', 'Confira o papel', 'Houve uma interrupcao. O trabalho nao sera repetido automaticamente.');
        } finally {
          if (afterPrint) window.removeEventListener('afterprint', afterPrint);
          currentJob = null;
          jobLabel.textContent = 'Nenhum';
          jobDetail.textContent = 'aguardando fila';
          window.setTimeout(clearReceipt, 4000);
        }
      }

      async function heartbeat() {
        const result = await api(config.heartbeatUrl);
        lastSeen.textContent = new Date().toLocaleTimeString('pt-BR');
        return result;
      }

      async function stationLoop() {
        setState('online', 'Estacao pronta', 'Conexao segura ativa. Aguardando o proximo comprovante.');
        let lastHeartbeat = 0;
        while (!stopped) {
          try {
            if (Date.now() - lastHeartbeat > 15000) {
              await heartbeat();
              lastHeartbeat = Date.now();
            }
            const result = await api(config.nextJobUrl);
            if (result.job) {
              await printJob(result.job);
            } else {
              await sleep(2000);
            }
          } catch (error) {
            if (error && (error.status === 401 || error.status === 403)) {
              stopped = true;
              setState('error', 'Estacao desativada', 'Abra o painel ADM e ative este navegador novamente.');
              return;
            }
            setState('error', 'Reconectando', 'A fila esta temporariamente indisponivel. Nova tentativa em alguns segundos.');
            await sleep(5000);
          }
        }
      }

      async function requestWakeLock() {
        if (!('wakeLock' in navigator)) return;
        try {
          wakeLock = await navigator.wakeLock.request('screen');
        } catch {
          wakeLock = null;
        }
      }

      async function start() {
        await requestWakeLock();
        if (!navigator.locks || !navigator.locks.request) {
          setState('error', 'Chrome atualizado necessario', 'Atualize o Google Chrome para impedir duas abas de imprimirem ao mesmo tempo.');
          return;
        }
        setState('', 'Aguardando exclusividade', 'Somente uma aba desta estacao pode consumir a fila.');
        navigator.locks.request(config.lockName, { mode: 'exclusive' }, stationLoop).catch(() => {
          setState('error', 'Nao foi possivel iniciar', 'Feche outras abas da estacao e tente novamente.');
        });
      }

      reconnect.addEventListener('click', () => {
        if (stopped) window.location.reload();
        else heartbeat().then(() => setState('online', 'Estacao pronta', 'Conexao renovada. Aguardando o proximo comprovante.')).catch(() => setState('error', 'Sem conexao', 'Verifique a internet e tente novamente.'));
      });

      window.addEventListener('pagehide', () => {
        if (!currentJob) return;
        fetch(config.completeBaseUrl + '/' + encodeURIComponent(currentJob.id) + '/complete', {
          method: 'POST',
          credentials: 'same-origin',
          keepalive: true,
          headers: { 'Content-Type': 'application/json', 'X-Wimi-CSRF': config.csrf },
          body: JSON.stringify({ status: 'uncertain', error: 'A estacao web foi fechada durante a impressao.' }),
        }).catch(() => undefined);
      });

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && !wakeLock) requestWakeLock();
      });

      start();
    })();
  </script>
</body>
</html>`;
}

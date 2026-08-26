export function safeInboundText(value: unknown, limit = 4000): string {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, Math.max(0, limit));
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNestedRecord(parent: JsonRecord, key: string): JsonRecord {
  const value = parent[key];
  return isRecord(value) ? value : {};
}

export function firstMessageText(message: JsonRecord): { type: string; text: string } {
  const conversation = safeInboundText(message.conversation, 4000);
  if (conversation) return { type: 'conversation', text: conversation };

  const extended = readNestedRecord(message, 'extendedTextMessage');
  const extendedText = safeInboundText(extended.text, 4000);
  if (extendedText) return { type: 'extendedTextMessage', text: extendedText };

  const image = readNestedRecord(message, 'imageMessage');
  const imageCaption = safeInboundText(image.caption, 4000);
  if (imageCaption) return { type: 'imageMessage', text: imageCaption };

  const document = readNestedRecord(message, 'documentMessage');
  const documentCaption = safeInboundText(document.caption, 4000);
  if (documentCaption) return { type: 'documentMessage', text: documentCaption };

  const video = readNestedRecord(message, 'videoMessage');
  const videoCaption = safeInboundText(video.caption, 4000);
  if (videoCaption) return { type: 'videoMessage', text: videoCaption };

  const buttons = readNestedRecord(message, 'buttonsResponseMessage');
  const buttonText = safeInboundText(buttons.selectedDisplayText || buttons.selectedButtonId, 4000);
  if (buttonText) return { type: 'buttonsResponseMessage', text: buttonText };

  const list = readNestedRecord(message, 'listResponseMessage');
  const listReply = isRecord(list.singleSelectReply) ? list.singleSelectReply : {};
  const listText = safeInboundText(list.title || listReply.selectedRowId || '', 4000);
  if (listText) return { type: 'listResponseMessage', text: listText };

  const keys = Object.keys(message);
  return { type: keys[0] || 'unknown', text: '' };
}

export function metaMessageText(message: JsonRecord): { type: string; text: string } {
  const type = safeInboundText(message.type || 'unknown', 80) || 'unknown';
  const text = readNestedRecord(message, 'text');
  const textBody = safeInboundText(text.body, 4000);
  if (textBody) return { type, text: textBody };

  for (const key of ['image', 'video', 'document']) {
    const media = readNestedRecord(message, key);
    const caption = safeInboundText(media.caption, 4000);
    if (caption) return { type, text: caption };
  }

  const button = readNestedRecord(message, 'button');
  const buttonText = safeInboundText(button.text || button.payload, 4000);
  if (buttonText) return { type, text: buttonText };

  const interactive = readNestedRecord(message, 'interactive');
  const buttonReply = readNestedRecord(interactive, 'button_reply');
  const buttonReplyText = safeInboundText(buttonReply.title || buttonReply.id, 4000);
  if (buttonReplyText) return { type, text: buttonReplyText };
  const listReply = readNestedRecord(interactive, 'list_reply');
  const listReplyText = safeInboundText(listReply.title || listReply.id, 4000);
  if (listReplyText) return { type, text: listReplyText };

  return { type, text: '' };
}

const fs = require('fs');
let code = fs.readFileSync('src/whatsapp.ts', 'utf8');

// Replace sequence in sendWhatsAppMessageDirect
const original = `  // 1. Send to Telegram if configured
  if (config.telegramBotToken && config.telegramChatId) {
    try {
      const telegramUrl = \`https://api.telegram.org/bot\${config.telegramBotToken}/sendMessage\`;
      const tResp = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.telegramChatId,
          text: message,
          parse_mode: 'Markdown'
        })
      });
      const tData = await tResp.json().catch(() => ({}));
      if (tResp.ok && tData.ok) {
        telegramSuccess = true;
      } else {
        telegramError = 'Error Telegram: ' + JSON.stringify(tData);
      }
    } catch (err: any) {
      telegramError = err.message;
    }
  }`;

const replaced = `  // 1. Send to Telegram if configured (Concurrent)
  let telegramPromise = Promise.resolve();
  if (config.telegramBotToken && config.telegramChatId && config.whatsappProvider !== 'none') {
    const telegramUrl = \`https://api.telegram.org/bot\${config.telegramBotToken}/sendMessage\`;
    telegramPromise = fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.telegramChatId, text: message, parse_mode: 'Markdown' })
    }).then(r => r.json()).then(d => {
      if (d.ok) telegramSuccess = true;
      else telegramError = 'Error Telegram: ' + JSON.stringify(d);
    }).catch(e => { telegramError = e.message; });
  } else if (config.telegramBotToken && config.telegramChatId && config.whatsappProvider === 'none') {
    // If it's a Telegram-only test, wait for it immediately
    try {
      const telegramUrl = \`https://api.telegram.org/bot\${config.telegramBotToken}/sendMessage\`;
      const tResp = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: config.telegramChatId, text: message, parse_mode: 'Markdown' })
      });
      const tData = await tResp.json().catch(() => ({}));
      if (tResp.ok && tData.ok) telegramSuccess = true;
      else telegramError = 'Error Telegram: ' + JSON.stringify(tData);
    } catch(err: any) { telegramError = err.message; }
  }`;

code = code.replace(original, replaced);

// Wait for telegram at the end of render_baileys and greenapi block if needed
const baileysEnd = `      await saveWhatsAppBackupRecord(message, formattedTo, 'success', undefined, provider);
      return { success: true, data };`;

const baileysEndReplaced = `      await telegramPromise;
      await saveWhatsAppBackupRecord(message, formattedTo, 'success', undefined, provider);
      return { success: true, data };`;

const baileysCatch = `    } catch (err: any) {
      if (telegramSuccess) {`;
      
const baileysCatchReplaced = `    } catch (err: any) {
      await telegramPromise;
      if (telegramSuccess) {`;

code = code.replace(baileysEnd, baileysEndReplaced);
code = code.replace(baileysCatch, baileysCatchReplaced);
code = code.replace(baileysEnd, baileysEndReplaced); // Do it again for green api if identical
code = code.replace(baileysCatch, baileysCatchReplaced); // Do it again for green api if identical

fs.writeFileSync('src/whatsapp.ts', code);

import { collection, doc, setDoc, getDocs, deleteDoc, query, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase';

export interface WhatsAppConfig {
  whatsappProvider?: string;
  whatsappApiUrl?: string;
  whatsappToken?: string;
  whatsappGroupId?: string;
  greenApiInstanceId?: string;
  greenApiToken?: string;
  greenApiChatId?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
}

export async function saveWhatsAppBackupRecord(message: string, recipient: string, status: string, error?: string, provider?: string) {
  try {
    const backupId = `backup_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const record = {
      id: backupId,
      timestamp: new Date().toISOString(),
      message,
      recipient,
      status,
      error: error || null,
      provider: provider || 'unknown'
    };
    await setDoc(doc(db, 'whatsapp_backups', backupId), record);
  } catch (err) {
    console.error('Error saving whatsapp backup to Firestore:', err);
  }
}

export async function sendTelegramHelper(botToken: string, chatId: string, message: string): Promise<{ success: boolean; error?: string }> {
  const token = (botToken || '').trim();
  const cId = (chatId || '').trim();
  if (!token || !cId) {
    return { success: false, error: 'Token o Chat ID de Telegram no configurados' };
  }
  const telegramUrl = `https://api.telegram.org/bot${token}/sendMessage`;

  // 1. First try Markdown mode
  try {
    const res = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cId, text: message, parse_mode: 'Markdown' })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      return { success: true };
    }
    console.warn("Telegram Markdown format failed, retrying plain text...", data);
  } catch (err: any) {
    console.warn("Telegram Markdown fetch error:", err);
  }

  // 2. Fallback: Retry sending as plain text (fixes HTTP 400 Bad Request on invalid Markdown entities)
  try {
    const res2 = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cId, text: message })
    });
    const data2 = await res2.json().catch(() => ({}));
    if (res2.ok && data2.ok) {
      return { success: true };
    }
    return { success: false, error: data2.description || 'Error Telegram: ' + JSON.stringify(data2) };
  } catch (err2: any) {
    return { success: false, error: err2.message };
  }
}

export async function sendWhatsAppMessageDirect(message: string, config: WhatsAppConfig, customRecipient?: string) {
  let telegramSuccess = false;
  let telegramError: string | null = null;

  // 1. Send to Telegram if configured (Concurrent)
  let telegramPromise = Promise.resolve();
  if (config.telegramBotToken && config.telegramChatId && config.whatsappProvider !== 'none') {
    telegramPromise = sendTelegramHelper(config.telegramBotToken, config.telegramChatId, message).then(res => {
      if (res.success) telegramSuccess = true;
      else telegramError = res.error || null;
    });
  } else if (config.telegramBotToken && config.telegramChatId && config.whatsappProvider === 'none') {
    // If it's a Telegram-only test, wait for it immediately
    const res = await sendTelegramHelper(config.telegramBotToken, config.telegramChatId, message);
    if (res.success) {
      telegramSuccess = true;
    } else {
      telegramError = res.error || 'Error de conexión en Telegram';
    }
  }

  const provider = config.whatsappProvider || 'render_baileys';
  let formattedTo = customRecipient || config.whatsappGroupId || config.greenApiChatId || '120363427690312638@g.us';

  if (provider === 'render_baileys' || provider === 'baileys' || config.whatsappApiUrl?.includes('bot-whatsapp-baileys') || config.whatsappApiUrl?.includes('onrender.com')) {
    const targetUrl = config.whatsappApiUrl || 'https://bot-whatsapp-baileys-jpyb.onrender.com/send-message';
    formattedTo = formattedTo.replace('@c.us', '');
    
    try {
      const response = await fetch('/api/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl,
          payload: { to: formattedTo, message }
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) throw new Error(data.message || data.error || 'Error al conectar con Render Baileys API a través del proxy');
      await telegramPromise;
      await telegramPromise;
      await saveWhatsAppBackupRecord(message, formattedTo, 'success', undefined, provider);
      return { success: true, data };
    } catch (err: any) {
      await telegramPromise;
      if (telegramSuccess) {
        await saveWhatsAppBackupRecord(message, 'Telegram (WhatsApp Falló)', 'success', undefined, 'telegram');
        return { success: true, data: { message: 'Enviado por Telegram, falló WhatsApp' } };
      }
      await saveWhatsAppBackupRecord(message, formattedTo, 'failed', err.message, provider);
      return { success: false, error: err.message };
    }
  }

  // Green API fallback
  if (provider === 'greenapi') {
    if (!config.greenApiInstanceId || !config.greenApiToken) {
      return { success: false, error: 'Credenciales de Green API no configuradas' };
    }
    const url = `https://api.green-api.com/waInstance${config.greenApiInstanceId}/sendMessage/${config.greenApiToken}`;
    try {
      const response = await fetch('/api/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: url,
          payload: { chatId: formattedTo, message }
        })
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || 'Error de Green API a través del proxy');
      await saveWhatsAppBackupRecord(message, formattedTo, 'success', undefined, provider);
      return { success: true, data };
    } catch (err: any) {
      await telegramPromise;
      if (telegramSuccess) {
        await saveWhatsAppBackupRecord(message, 'Telegram (WhatsApp Falló)', 'success', undefined, 'telegram');
        return { success: true, data: { message: 'Enviado por Telegram, falló WhatsApp' } };
      }
      await saveWhatsAppBackupRecord(message, formattedTo, 'failed', err.message, provider);
      return { success: false, error: err.message };
    }
  }

  if (telegramSuccess) {
     await saveWhatsAppBackupRecord(message, 'Telegram', 'success', undefined, 'telegram');
     return { success: true, data: { message: 'Enviado a Telegram' } };
  }

  return { success: false, error: 'Proveedor no soportado en modo cliente' };
}

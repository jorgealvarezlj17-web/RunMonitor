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

export async function sendWhatsAppMessageDirect(message: string, config: WhatsAppConfig, customRecipient?: string) {
  const provider = config.whatsappProvider || 'render_baileys';
  let formattedTo = customRecipient || config.whatsappGroupId || config.greenApiChatId || '120363427690312638@g.us';

  if (provider === 'render_baileys' || provider === 'baileys' || config.whatsappApiUrl?.includes('bot-whatsapp-baileys') || config.whatsappApiUrl?.includes('onrender.com')) {
    const targetUrl = config.whatsappApiUrl || 'https://bot-whatsapp-baileys-jpyb.onrender.com/send-message';
    formattedTo = formattedTo.replace('@c.us', '');
    
    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: formattedTo, message })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.error || 'Error al conectar con Render Baileys API');
      await saveWhatsAppBackupRecord(message, formattedTo, 'success', undefined, provider);
      return { success: true, data };
    } catch (err: any) {
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
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: formattedTo, message })
      });
      const data = await response.json();
      if (!response.ok) throw new Error('Error de Green API');
      await saveWhatsAppBackupRecord(message, formattedTo, 'success', undefined, provider);
      return { success: true, data };
    } catch (err: any) {
      await saveWhatsAppBackupRecord(message, formattedTo, 'failed', err.message, provider);
      return { success: false, error: err.message };
    }
  }

  return { success: false, error: 'Proveedor no soportado en modo cliente' };
}

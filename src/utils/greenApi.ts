import axios from 'axios';

export interface GreenApiConfig {
  instanceId: string;
  apiTokenInstance: string;
  chatId: string; // phone number (e.g. 584121234567@c.us) or group (e.g. 12036302...@g.us)
}

/**
 * Format recipient number or group ID into Green API standard chatId
 * Numbers should end with @c.us, groups with @g.us
 */
export function formatGreenApiChatId(rawRecipient: string): string {
  const cleaned = rawRecipient.trim().replace(/[+\s\-()]/g, '');
  if (!cleaned) return '';
  if (cleaned.endsWith('@c.us') || cleaned.endsWith('@g.us')) {
    return cleaned;
  }
  // If it's a group ID with a dash or standard group format
  if (cleaned.includes('-') || cleaned.length > 15) {
    return `${cleaned}@g.us`;
  }
  // Standard phone number
  return `${cleaned}@c.us`;
}

/**
 * Send a WhatsApp text message using Green API
 * API docs: https://green-api.com/en/docs/api/sending/SendMessage/
 */
export async function sendGreenApiMessage(
  config: GreenApiConfig,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { instanceId, apiTokenInstance, chatId } = config;

  if (!instanceId || !apiTokenInstance || !chatId) {
    return {
      success: false,
      error: 'Configuración incompleta de Green API (se requiere IdInstance, ApiTokenInstance y Teléfono/ChatId).'
    };
  }

  const formattedChatId = formatGreenApiChatId(chatId);
  const url = `https://api.green-api.com/waInstance${instanceId.trim()}/sendMessage/${apiTokenInstance.trim()}`;

  try {
    const response = await axios.post(
      url,
      {
        chatId: formattedChatId,
        message: message
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    if (response.data && response.data.idMessage) {
      return {
        success: true,
        messageId: response.data.idMessage
      };
    }

    return {
      success: true,
      messageId: response.data?.id || 'sent'
    };
  } catch (error: any) {
    console.error('Error sending message via Green API:', error?.response?.data || error?.message || error);
    const serverMessage = error?.response?.data?.message || error?.message || 'Error de conexión con Green API';
    return {
      success: false,
      error: serverMessage
    };
  }
}

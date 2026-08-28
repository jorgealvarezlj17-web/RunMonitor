import { GoogleGenAI } from "@google/genai";

export const generateEquipmentImage = async (prompt: string, size: "1K" | "2K" | "4K" = "1K") => {
  // Use process.env.API_KEY for paid models if available, otherwise fallback to GEMINI_API_KEY
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: size
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
};

export const chatWithGemini = async (message: string, history: { role: string, parts: { text: string }[] }[]) => {
  const apiKey = process.env.GEMINI_API_KEY || '';
  const ai = new GoogleGenAI({ apiKey });

  try {
    const chat = ai.chats.create({
      model: "gemini-3.1-pro-preview",
      config: {
        systemInstruction: "Eres un asistente experto en mantenimiento de equipos industriales y de oficina. Ayudas a los usuarios a gestionar sus equipos y resolver dudas técnicas.",
      },
      history: history
    });

    const result = await chat.sendMessage({ message });
    return result.text;
  } catch (error) {
    console.error("Error in chat:", error);
    throw error;
  }
};

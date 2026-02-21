import type { VercelRequest, VercelResponse } from '@vercel/node';
import { translate as googleTranslate } from "@vitalets/google-translate-api";
import { translate as bingTranslate } from "bing-translate-api";
import { GoogleGenAI, Type } from "@google/genai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { texts, targetLang, engine, provider, context } = req.body;

  if (!texts || !Array.isArray(texts)) {
    return res.status(400).json({ error: "Invalid texts" });
  }

  try {
    if (provider === "google") {
      const results = [];
      for (const text of texts) {
        try {
          const res = await googleTranslate(text, { to: targetLang });
          results.push(res.text);
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (e) {
          results.push(text);
        }
      }
      return res.json({ translated: results });
    } 
    
    if (provider === "bing") {
      const results = [];
      for (const text of texts) {
        try {
          const res = await bingTranslate(text, null, targetLang);
          results.push(res.translation);
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (e) {
          results.push(text);
        }
      }
      return res.json({ translated: results });
    }

    if (provider === "mymemory") {
      const results = [];
      for (const text of texts) {
        try {
          const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${targetLang}`;
          const response = await fetch(url);
          const data = await response.json();
          results.push(data.responseData.translatedText || text);
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (e) {
          results.push(text);
        }
      }
      return res.json({ translated: results });
    }

    if (provider === "lingva") {
      const results = [];
      for (const text of texts) {
        try {
          const url = `https://lingva.ml/api/v1/auto/${targetLang}/${encodeURIComponent(text)}`;
          const response = await fetch(url);
          const data = await response.json();
          results.push(data.translation || text);
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (e) {
          results.push(text);
        }
      }
      return res.json({ translated: results });
    }

    // Default to Gemini
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key not configured on server." });
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = "gemini-3-flash-preview";
    const systemInstruction = `You are a professional game translator specializing in ${engine} engine scripts.
    Your task is to translate game dialogue and UI text from the source language to ${targetLang}.
    
    CRITICAL RULES:
    1. PRESERVE ALL ENGINE TAGS AND CONTROL CHARACTERS.
    2. Maintain the tone and personality of characters.
    3. If a line is just a command or technical tag without translatable text, return it as is.
    4. Context: ${context || "General game dialogue"}.
    5. Return the translations in the exact same order as the input.`;

    const geminiResponse = await ai.models.generateContent({
      model,
      contents: `Translate the following array of strings to ${targetLang}. Return a JSON array of strings.
      
      Strings to translate:
      ${JSON.stringify(texts)}`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    let text = geminiResponse.text || "[]";
    text = text.replace(/```json\n?|```/g, "").trim();
    const translatedTexts = JSON.parse(text);
    return res.json({ translated: translatedTexts });

  } catch (error: any) {
    console.error("Translation error:", error);
    res.status(500).json({ error: error.message });
  }
}

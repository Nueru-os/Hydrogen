const MODEL = "gemini-4-hydrogen";
const FALLBACK_MODEL = "gemini-3.8-flash";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Bot Gemini 4 Hydrogen Jalan di Vercel!");
  }
  const update = req.body;
  try {
    if (!update.message || !update.message.text) {
      return res.status(200).send("OK");
    }
    const chatId = update.message.chat.id;
    const text = update.message.text;
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (text === "/start") {
      await kirim(chatId, "Halo! Saya Gemini 4 Hydrogen (Thinking HIGH) jalan di Vercel.", TELEGRAM_TOKEN);
      return res.status(200).send("OK");
    }

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" })
    });

    // 1. Coba Hydrogen dulu
    let data = await callGemini(MODEL, text, GEMINI_API_KEY, true);
    let pakaiFallback = false;

    // 2. Kalau Hydrogen error quota / high demand, pindah ke 3.8 Flash
    if (data.error) {
      console.log("Hydrogen error:", data.error.message);
      pakaiFallback = true;
      await kirim(chatId, "Jatah Hydrogen 4 habis / lagi rame, aku pakai model cadangan dulu ya...", TELEGRAM_TOKEN);
      data = await callGemini(FALLBACK_MODEL, text, GEMINI_API_KEY, false);
    }

    let reply = "Maaf error.";
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      reply = data.candidates[0].content.parts[0].text;
      if (pakaiFallback) {
        reply = "[Pakai 3.8 Flash - Cadangan]\n\n" + reply;
      }
    } else if (data.error) {
      reply = "Fallback juga error: " + data.error.message;
    }

    for (let i = 0; i < reply.length; i += 4096) {
      await kirim(chatId, reply.slice(i, i + 4096), TELEGRAM_TOKEN);
    }
    return res.status(200).send("OK");
  } catch (e) {
    console.log(e);
    return res.status(200).send("OK");
  }
}

// Kalau isHydrogen = true, pakai Thinking HIGH. Kalau false (Flash), jangan pakai thinking biar tidak error
async function callGemini(model, text, key, isHydrogen) {
  const body = {
    contents: [{ parts: [{ text: text }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192
    }
  };
  if (isHydrogen) {
    body.generationConfig.thinkingConfig = { thinkingLevel: "HIGH" };
  }
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );
  return await r.json();
}

async function kirim(chatId, text, token) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

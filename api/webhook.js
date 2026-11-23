const MODELS = ["gemma-4-26b-a4b-it", "gemma-4-31b-it", "gemini-3.5-flash-lite"];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Bot Gemma 4 Jalan di Vercel!");
  }
  const update = req.body;
  try {
    if (!update.message || !update.message.text) return res.status(200).send("OK");
    const chatId = update.message.chat.id;
    const text = update.message.text;
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (text === "/start") {
      await kirim(chatId, "Halo! Saya Gemma 4 (26B) jalan di Vercel. Limitku gede, 14.400 chat / hari!", TELEGRAM_TOKEN);
      return res.status(200).send("OK");
    }

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" })
    });

    let data = null;
    let modelTerpakai = MODELS[0];
    let lastError = "";

    // Coba satu-satu: Gemma 26B -> Gemma 31B -> Flash-Lite
    for (let i = 0; i < MODELS.length; i++) {
      modelTerpakai = MODELS[i];
      data = await callGemini(modelTerpakai, text, GEMINI_API_KEY);
      if (!data.error) break;
      lastError = data.error.message;
      console.log(modelTerpakai + " gagal: " + lastError);
      if (i < MODELS.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    let reply = "Maaf error.";
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      reply = data.candidates[0].content.parts[0].text;
      if (modelTerpakai !== MODELS[0]) {
        reply = `[Pakai ${modelTerpakai}]\n\n` + reply;
      }
    } else {
      reply = `Semua model lagi rame. Coba lagi 2 menit ya.\n\nError: ${lastError}`;
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

async function callGemini(model, text, key) {
  // Gemma TIDAK BOLEH pakai thinkingConfig!
  const body = {
    contents: [{ parts: [{ text: text }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
  };
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
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

const MODELS = ["gemini-4-hydrogen", "gemini-3.8-flash", "gemini-2.5-flash", "gemini-2.0-flash"];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Bot Gemini 4 Hydrogen Jalan di Vercel!");
  }
  const update = req.body;
  try {
    if (!update.message || !update.message.text) return res.status(200).send("OK");
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

    let data = null;
    let modelTerpakai = MODELS[0];
    let lastError = "";

    // Coba satu-satu dari atas ke bawah
    for (let i = 0; i < MODELS.length; i++) {
      modelTerpakai = MODELS[i];
      const isHydrogen = modelTerpakai === "gemini-4-hydrogen";
      data = await callGemini(modelTerpakai, text, GEMINI_API_KEY, isHydrogen);
      
      if (!data.error) break; // Kalau berhasil, stop, jangan lanjut
      
      lastError = data.error.message;
      console.log(modelTerpakai + " gagal: " + lastError);
      
      // Kalau masih ada cadangan, kasih tau user dan tunggu 2 detik dulu
      if (i < MODELS.length - 1) {
        await kirim(chatId, `Model ${modelTerpakai} lagi rame, coba pindah ke ${MODELS[i+1]}...`, TELEGRAM_TOKEN);
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    let reply = "Maaf error.";
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      reply = data.candidates[0].content.parts[0].text;
      if (modelTerpakai !== MODELS[0]) {
        reply = `[Pakai ${modelTerpakai} - Cadangan]\n\n` + reply;
      }
    } else {
      reply = `Semua model Google lagi rame banget sekarang. Coba lagi 2-3 menit lagi ya.\n\nError terakhir: ${lastError}`;
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

async function callGemini(model, text, key, isHydrogen) {
  const body = {
    contents: [{ parts: [{ text: text }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
  };
  if (isHydrogen) {
    body.generationConfig.thinkingConfig = { thinkingLevel: "HIGH" };
  }
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

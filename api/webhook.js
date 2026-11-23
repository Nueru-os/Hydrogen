const MODEL = "gemma-4-31b-it";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Bot Gemma 4 31B Jalan di Vercel!");
  }
  const update = req.body;
  try {
    if (!update.message || !update.message.text) return res.status(200).send("OK");
    const chatId = update.message.chat.id;
    const text = update.message.text;
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (text === "/start") {
      await kirim(chatId, "Halo! Saya Gemma 4 31B (yang paling pinter) jalan di Vercel.", TELEGRAM_TOKEN);
      return res.status(200).send("OK");
    }

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" })
    });

    let data = null;
    let lastError = "";
    let percobaan = 0;

    // AUTO RETRY SAMPE BALAS - max 15x coba
    for (percobaan = 1; percobaan <= 15; percobaan++) {
      data = await callGemini(MODEL, text, GEMINI_API_KEY);

      // Kalau berhasil, langsung stop, jangan ngulang lagi
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        break;
      }

      lastError = data.error ? data.error.message : "Respon kosong";
      console.log(`Percobaan ${percobaan} gagal: ${lastError}`);

      // Kalau ini bukan percobaan terakhir, tunggu dulu baru coba lagi
      // Makin lama gagal, makin lama nunggunya: 2s, 3s, 4s, 5s...
      if (percobaan < 15) {
        const tunggu = 2000 + (percobaan * 1000);
        console.log(`Tunggu ${tunggu}ms lalu retry...`);
        await new Promise(r => setTimeout(r, tunggu));
      }
    }

    let reply = "Maaf error.";
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      reply = data.candidates[0].content.parts[0].text;
      if (percobaan > 1) {
        reply = `[Berhasil setelah ${percobaan}x coba]\n\n` + reply;
      }
    } else {
      reply = `Udah dicoba 15x tapi Gemma masih rame terus.\nCoba kirim lagi 1 menit lagi ya.\n\nError: ${lastError}`;
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

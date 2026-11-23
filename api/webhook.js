const MODEL = "gemma-4-31b-it";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("Bot Gemma 4 31B Jalan!");
  
  const update = req.body;
  try {
    if (!update.message || !update.message.text) return res.status(200).send("OK");
    
    const chatId = update.message.chat.id;
    const text = update.message.text;
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (text === "/start") {
      await kirim(chatId, "Halo! Saya Gemma 4 31B. Ada yang bisa dibantu?", TELEGRAM_TOKEN);
      return res.status(200).send("OK");
    }

    // Kirim status "typing..."
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" })
    });

    let data = null;
    let lastError = "";

    // Maksimal 3x percobaan saja agar webhook tidak timeout dan di-spam ulang oleh Telegram
    for (let percobaan = 1; percobaan <= 3; percobaan++) {
      data = await callGemini(MODEL, text, GEMINI_API_KEY);
      
      // Cek apakah ada teks jawaban (bukan thought)
      const parts = data.candidates?.[0]?.content?.parts || [];
      const jawabanValid = parts.find(p => !p.thought && p.text);
      
      if (jawabanValid) break;
      
      lastError = data.error ? data.error.message : "Respon kosong";
      if (percobaan < 3) await new Promise(r => setTimeout(r, 1500));
    }

    let reply = "Maaf, sistem sedang sibuk.";
    const parts = data?.candidates?.[0]?.content?.parts || [];
    
    // Ambil HANYA part yang bukan thought (pikiran internal)
    const jawabanUtama = parts
      .filter(part => !part.thought && part.text)
      .map(part => part.text)
      .join("\n")
      .trim();

    if (jawabanUtama) {
      reply = jawabanUtama;
    } else {
      reply = `Gagal mendapatkan jawaban. Coba lagi sebentar ya. (${lastError})`;
    }

    // Kirim balasan per 4096 karakter (batas maksimal Telegram)
    for (let i = 0; i < reply.length; i += 4096) {
      await kirim(chatId, reply.slice(i, i + 4096), TELEGRAM_TOKEN);
    }

    return res.status(200).send("OK");
  } catch (e) {
    console.error("Webhook Error:", e);
    return res.status(200).send("OK");
  }
}

async function callGemini(model, text, key) {
  const hariIni = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Makassar"
  });

  const body = {
    // Gunakan systemInstruction resmi agar tidak bercampur dengan chat user
    systemInstruction: {
      parts: [
        {
          text: `Kamu adalah asisten chat di Telegram. Gunakan bahasa Indonesia yang santai, ramah, dan langsung ke inti jawaban. Hari ini adalah ${hariIni}.`
        }
      ]
    },
    contents: [
      {
        role: "user",
        parts: [{ text: text }]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
      // Matikan mode thinking pada Gemma 4 agar cepat dan tidak bocor
      thinkingConfig: {
        thinkingLevel: "minimal"
      }
    }
  };

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

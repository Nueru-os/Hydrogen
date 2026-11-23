// Ganti ke 26b-a4b-it (MoE) agar jauh lebih cepat dari 31b-it
const MODEL = "gemma-4-31b-it";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("Bot Gemma 4 Cepat Jalan!");

  const update = req.body;
  try {
    if (!update.message || !update.message.text) return res.status(200).send("OK");

    const chatId = update.message.chat.id;
    const text = update.message.text;
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (text === "/start") {
      await kirim(chatId, "Halo! Saya Gemma 4. Ada yang bisa dibantu?", TELEGRAM_TOKEN);
      return res.status(200).send("OK");
    }

    // Jalankan typing tanpa await agar tidak menahan proses berikutnya
    fetch(`https://telegram.org{TELEGRAM_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" })
    }).catch(() => {});

    // Kirim pesan placeholder agar user langsung tahu bot merespons
    const msgAwal = await kirim(chatId, "⏳", TELEGRAM_TOKEN);
    const messageId = msgAwal?.result?.message_id;

    // Panggil API dengan mode STREAMING (alt=sse)
    const jawabanAkhir = await streamGemini(MODEL, text, GEMINI_API_KEY, async (teksSementara) => {
      if (messageId && teksSementara.trim()) {
        await editPesan(chatId, messageId, teksSementara.slice(0, 4096), TELEGRAM_TOKEN);
      }
    });

    // Pastikan hasil akhir ter-update sempurna
    if (messageId) {
      if (jawabanAkhir.length <= 4096) {
        await editPesan(chatId, messageId, jawabanAkhir, TELEGRAM_TOKEN);
      } else {
        // Jika lebih dari 4096 karakter, edit pesan pertama lalu kirim sisanya
        await editPesan(chatId, messageId, jawabanAkhir.slice(0, 4096), TELEGRAM_TOKEN);
        for (let i = 4096; i < jawabanAkhir.length; i += 4096) {
          await kirim(chatId, jawabanAkhir.slice(i, i + 4096), TELEGRAM_TOKEN);
        }
      }
    }

    return res.status(200).send("OK");
  } catch (e) {
    console.error("Webhook Error:", e);
    return res.status(200).send("OK");
  }
}

async function streamGemini(model, text, key, onUpdate) {
  const hariIni = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Makassar"
  });

  const body = {
    systemInstruction: {
      parts: [
        {
          text: `Kamu adalah asisten chat di Telegram. Gunakan bahasa Indonesia yang santai, ramah, singkat, dan langsung ke inti. Hari ini adalah ${hariIni}.`
        }
      ]
    },
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
      thinkingConfig: { thinkingLevel: "minimal" }
    }
  };

  // Gunakan endpoint streamGenerateContent?alt=sse
  const response = await fetch(
    `https://googleapis.com{model}:streamGenerateContent?alt=sse&key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  if (!response.ok || !response.body) {
    return "Maaf, sistem sedang sibuk. Coba lagi sebentar ya.";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let hasilTeks = "";
  let waktuUpdateTerakhir = Date.now();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr) continue;

      try {
        const parsed = JSON.parse(jsonStr);
        const parts = parsed.candidates?.?.content?.parts || [];
        for (const part of parts) {
          if (!part.thought && part.text) {
            hasilTeks += part.text;
          }
        }

        // Update ke Telegram setiap 1.2 detik agar tidak kena rate-limit Telegram
        if (Date.now() - waktuUpdateTerakhir > 1200 && hasilTeks.length > 5) {
          waktuUpdateTerakhir = Date.now();
          await onUpdate(hasilTeks + " ✍️");
        }
      } catch {}
    }
  }

  return hasilTeks.trim() || "Maaf, tidak ada jawaban yang dihasilkan.";
}

async function kirim(chatId, text, token) {
  const r = await fetch(`https://telegram.org{token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  return await r.json();
}

async function editPesan(chatId, messageId, text, token) {
  await fetch(`https://telegram.org{token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text })
  }).catch(() => {});
}

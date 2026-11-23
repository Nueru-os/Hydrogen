// Gunakan nama model resmi dari Google Gemini API (urut dari yang paling pintar ke paling hemat limit)
const MODELS = [
  "gemini-4-hydrogen",
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite"
];

// Penyimpanan riwayat chat sementara di memori berdasarkan chatId
const chatHistories = new Map();
const MAX_HISTORY = 10; // Simpan maksimal 10 pesan terakhir agar hemat token

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("Bot Gemini Jalan!");
  
  const update = req.body;
  try {
    if (!update.message || !update.message.text) return res.status(200).send("OK");
    
    const chatId = update.message.chat.id;
    const text = update.message.text;
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    // Perintah /start
    if (text === "/start") {
      chatHistories.delete(chatId);
      await kirim(chatId, "Halo! Saya Gemini. Ketik apa saja untuk mulai ngobrol, atau ketik /reset untuk menghapus ingatan chat.", TELEGRAM_TOKEN);
      return res.status(200).send("OK");
    }

    // Perintah /reset untuk membersihkan konteks obrolan
    if (text === "/reset") {
      chatHistories.delete(chatId);
      await kirim(chatId, "Ingatan percakapan sudah dihapus. Yuk mulai topik baru!", TELEGRAM_TOKEN);
      return res.status(200).send("OK");
    }

    // Tampilkan status "sedang mengetik..."
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" })
    });

    // Ambil riwayat chat pengguna saat ini (jika belum ada, buat array kosong)
    let history = chatHistories.get(chatId) || [];

    // Tambahkan pesan terbaru dari user ke dalam riwayat dengan role "user"
    const currentContents = [
      ...history,
      { role: "user", parts: [{ text: text }] }
    ];

    let data = null;
    let modelTerpakai = MODELS[0];
    let lastError = "";

    // Coba panggil model satu per satu jika terjadi limit (429) atau error
    for (let i = 0; i < MODELS.length; i++) {
      modelTerpakai = MODELS[i];
      data = await callGemini(modelTerpakai, currentContents, GEMINI_API_KEY);
      
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        break; // Berhasil mendapatkan jawaban, hentikan loop
      }
      
      lastError = data.error ? data.error.message : "Respon kosong";
      console.log(`${modelTerpakai} gagal: ${lastError}`);
      
      if (i < MODELS.length - 1) {
        await new Promise(r => setTimeout(r, 800)); // Jeda singkat sebelum pindah model
      }
    }

    let reply = "Maaf, terjadi gangguan pada sistem.";
    const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (aiText) {
      reply = aiText;

      // Simpan pesan user DAN balasan AI ke riwayat agar konteks tetap nyambung meski model berganti
      history.push({ role: "user", parts: [{ text: text }] });
      history.push({ role: "model", parts: [{ text: aiText }] });

      // Potong riwayat lama jika melebihi batas agar tidak membengkak
      if (history.length > MAX_HISTORY) {
        history = history.slice(history.length - MAX_HISTORY);
      }
      chatHistories.set(chatId, history);

    } else {
      reply = `Semua model Gemini sedang penuh/limit.\nDetail error: ${lastError}`;
    }

    // Kirim balasan (dipecah per 4096 karakter sesuai batas maksimal Telegram)
    for (let i = 0; i < reply.length; i += 4096) {
      await kirim(chatId, reply.slice(i, i + 4096), TELEGRAM_TOKEN);
    }

    return res.status(200).send("OK");
  } catch (e) {
    console.error("Webhook Error:", e);
    return res.status(200).send("OK");
  }
}

async function callGemini(model, contents, key) {
  const hariIni = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Makassar'
  });

  const body = {
    systemInstruction: {
      parts: [{
        text: `Kamu adalah teman chat Telegram, gunakan bahasa Indonesia yang santai, singkat, dan natural. Hari ini adalah ${hariIni}. Jawab langsung ke intinya tanpa menampilkan proses berpikir atau analisis panjang.`
      }]
    },
    contents: contents, // Mengirim seluruh riwayat percakapan
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048
    }
  };

  // Nonaktifkan thinking hanya pada model 2.5-flash / 2.5-flash-lite agar respon instan
  if (model.includes("2.5-flash")) {
    body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
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

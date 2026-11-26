// Gunakan nama model resmi dari Google Gemini API (urut dari yang paling pintar ke paling hemat limit)
const MODELS = [
  "gemini-4-hydrogen",
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite"
];

// Penyimpanan riwayat chat sementara di memori berdasarkan chatId
const chatHistories = new Map();
const MAX_HISTORY = 10;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("Bot Gemini Jalan!");
  
  const update = req.body;
  try {
    if (!update.message || !update.message.text) return res.status(200).send("OK");
    
    const chatId = update.message.chat.id;
    const text = update.message.text;
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (text === "/start") {
      chatHistories.delete(chatId);
      await kirim(chatId, "Halo! Saya Gemini. Ketik apa saja untuk mulai ngobrol, atau ketik /reset untuk menghapus ingatan chat.", TELEGRAM_TOKEN);
      return res.status(200).send("OK");
    }

    if (text === "/reset") {
      chatHistories.delete(chatId);
      await kirim(chatId, "Ingatan percakapan sudah dihapus. Yuk mulai topik baru!", TELEGRAM_TOKEN);
      return res.status(200).send("OK");
    }

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" })
    });

    let history = chatHistories.get(chatId) || [];
    const currentContents = [
      ...history,
      { role: "user", parts: [{ text: text }] }
    ];

    let data = null;
    let modelTerpakai = MODELS[0];
    let lastError = "";

    for (let i = 0; i < MODELS.length; i++) {
      modelTerpakai = MODELS[i];
      data = await callGemini(modelTerpakai, currentContents, GEMINI_API_KEY);
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) break;
      lastError = data.error ? data.error.message : "Respon kosong";
      console.log(`${modelTerpakai} gagal: ${lastError}`);
      if (i < MODELS.length - 1) await new Promise(r => setTimeout(r, 800));
    }

    let reply = "Maaf, terjadi gangguan pada sistem.";
    const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (aiText) {
      reply = aiText;
      history.push({ role: "user", parts: [{ text: text }] });
      history.push({ role: "model", parts: [{ text: aiText }] });
      if (history.length > MAX_HISTORY) history = history.slice(history.length - MAX_HISTORY);
      chatHistories.set(chatId, history);
    } else {
      reply = `Semua model Gemini sedang penuh/limit.\nDetail error: ${lastError}`;
    }

    // Pecah teks ASLI dulu, baru diformat per potongan
    const maxLen = 3500;
    let sisa = reply;
    let lagiDiDalamKode = false;
    let bahasaKode = "text";

    while (sisa.length > 0) {
      let batas = maxLen;
      if (sisa.length > maxLen) {
        let potong = sisa.lastIndexOf('\n', maxLen);
        if (potong === -1) potong = sisa.lastIndexOf(' ', maxLen);
        if (potong > 0) batas = potong;
      }
      let potongan = sisa.slice(0, batas);
      sisa = sisa.slice(batas).trimStart();

      const backticks = potongan.match(/```(\w*)/g) || [];
      for (let b of backticks) {
        if (!lagiDiDalamKode) {
          lagiDiDalamKode = true;
          bahasaKode = b.replace(/```/, "") || "text";
        } else {
          lagiDiDalamKode = false;
        }
      }

      if (lagiDiDalamKode) {
        potongan += '\n```';
        sisa = '```' + bahasaKode + '\n' + sisa;
      }

      let siapKirim = aiToTelegram(potongan);
      await kirim(chatId, siapKirim, TELEGRAM_TOKEN);
    }

    return res.status(200).send("OK");
  } catch (e) {
    console.error("Webhook Error:", e);
    return res.status(200).send("OK");
  }
} // <-- PENUTUP HANDLER, INI YANG TADI HILANG

async function callGemini(model, contents, key) {
  const hariIni = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Makassar'
  });
  const body = {
    systemInstruction: {
      parts: [{ text: `Kamu adalah teman chat Telegram, gunakan bahasa Indonesia yang santai, singkat, dan natural. Hari ini adalah ${hariIni}. Jawab langsung ke intinya tanpa menampilkan proses berpikir atau analisis panjang. Setiap kode HARUS dibungkus dengan \`\`\`bahasa. Contoh: \`\`\`javascript ... \`\`\`.` }]
    },
    contents: contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
  };
  if (model.includes("2.5-flash")) {
    body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  return await r.json();
}

function aiToTelegram(text) {
  let blocks = [];
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (m, lang, code) => {
    blocks.push(`<pre language="${lang || 'text'}">${code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`);
    return `__BLOCK${blocks.length - 1}__`;
  });
  text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  blocks.forEach((b, i) => { text = text.replace(`__BLOCK${i}__`, b); });
  return text;
}

async function kirim(chatId, text, token) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" })
  });
}

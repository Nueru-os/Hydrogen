// Daftar model prioritas utama
const PRIMARY_MODELS = [
  "gemini-4-hydrogen",
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite"
];

// Menyimpan ID interaksi terakhir per chatId agar konteks nyambung di server Google
const lastInteractionIds = new Map();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("Bot Gemini Jalan!");

  const update = req.body;
  try {
    if (!update.message || !update.message.text) return res.status(200).send("OK");

    const chatId = update.message.chat.id;
    const text = update.message.text;
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    // Perintah /start atau /reset untuk memulai topik obrolan baru
    if (text === "/start" || text === "/reset") {
      lastInteractionIds.delete(chatId);
      const msg = text === "/start"
        ? "Halo! Saya siap ngobrol. Ketik /reset kapan saja untuk menghapus ingatan topik sebelumnya."
        : "Ingatan percakapan sudah di-reset. Yuk mulai topik baru!";
      await kirim(chatId, msg, TELEGRAM_TOKEN);
      return res.status(200).send("OK");
    }

    await fetch(`https://telegram.org{TELEGRAM_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" })
    });

    const prevId = lastInteractionIds.get(chatId) || null;
    let replyText = null;
    let newInteractionId = null;

    // 1. Coba daftar model utama secara berurutan
    for (const model of PRIMARY_MODELS) {
      const result = await callInteractionsAPI(model, text, prevId, GEMINI_API_KEY);
      if (result.text) {
        replyText = result.text;
        newInteractionId = result.id;
        break;
      }
      console.log(`[Skip] ${model}: ${result.error}`);
    }

    // 2. Jika semua model utama gagal/limit, otomatis cari model lain yang tersedia di akun Anda
    if (!replyText) {
      const fallbackModels = await getAvailableModels(GEMINI_API_KEY);
      for (const model of fallbackModels) {
        if (PRIMARY_MODELS.includes(model)) continue; // Lewati yang sudah dicoba
        const result = await callInteractionsAPI(model, text, prevId, GEMINI_API_KEY);
        if (result.text) {
          replyText = result.text;
          newInteractionId = result.id;
          break;
        }
      }
    }

    // 3. Jika berhasil, simpan ID interaksi terbaru agar chat berikutnya tetap nyambung
    if (replyText) {
      if (newInteractionId) {
        lastInteractionIds.set(chatId, newInteractionId);
      }
      for (let i = 0; i < replyText.length; i += 4096) {
        await kirim(chatId, replyText.slice(i, i + 4096), TELEGRAM_TOKEN);
      }
    } else {
      // Pesan ramah tanpa menampilkan kode error teknis ke pengguna
      await kirim(
        chatId,
        "Waduh, server AI lagi padat banget nih. Coba kirim ulang pesanmu beberapa saat lagi ya!",
        TELEGRAM_TOKEN
      );
    }

    return res.status(200).send("OK");
  } catch (e) {
    console.error("Webhook Error:", e);
    return res.status(200).send("OK");
  }
}

// Fungsi memanggil Interactions API (mendukung perpindahan model tanpa kehilangan konteks)
async function callInteractionsAPI(model, text, previousInteractionId, apiKey) {
  const hariIni = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Makassar'
  });

  const payload = {
    model: model,
    input: text,
    system_instruction: `Kamu adalah teman chat Telegram, bahasa Indonesia santai, singkat, dan natural. Hari ini ${hariIni}. Jawab langsung ke intinya tanpa menampilkan analisis atau proses berpikir.`
  };

  // Sambungkan dengan percakapan sebelumnya di server Google
  if (previousInteractionId) {
    payload.previous_interaction_id = previousInteractionId;
  }

  try {
    const response = await fetch(
      "https://googleapis.com",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
          "Api-Revision": "2026-05-20"
        },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();

    if (!response.ok || data.error) {
      return { error: data.error?.message || `HTTP ${response.status}` };
    }

    // Ambil teks jawaban dari step model_output
    let outputText = "";
    if (Array.isArray(data.steps)) {
      for (const step of data.steps) {
        if (step.type === "model_output" && Array.isArray(step.content)) {
          for (const item of step.content) {
            if (item.type === "text" && item.text) {
              outputText += item.text;
            }
          }
        }
      }
    }

    if (outputText.trim()) {
      return { text: outputText.trim(), id: data.id };
    }

    return { error: "Output teks kosong" };
  } catch (err) {
    return { error: err.message };
  }
}

// Otomatis mengambil daftar model teks terbaru yang didukung oleh API Key Anda
async function getAvailableModels(apiKey) {
  try {
    const res = await fetch(
      `https://googleapis.com{apiKey}`
    );
    const data = await res.json();
    if (!Array.isArray(data.models)) return [];

    return data.models
      .filter(m =>
        m.name.includes("gemini") &&
        !m.name.includes("image") &&
        !m.name.includes("tts") &&
        !m.name.includes("embedding")
      )
      .map(m => m.name.replace("models/", ""))
      .reverse(); // Urutkan dari versi terbaru
  } catch {
    return [];
  }
}

async function kirim(chatId, text, token) {
  await fetch(`https://telegram.org{token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

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
      await kirim(chatId, "Halo! Saya Gemma 4 31B.", TELEGRAM_TOKEN);
      return res.status(200).send("OK");
    }

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendChatAction`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" })
    });

    let data = null;
    let lastError = "";
    let percobaan = 0;

    for (percobaan = 1; percobaan <= 15; percobaan++) {
      data = await callGemini(MODEL, text, GEMINI_API_KEY);
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) break;
      lastError = data.error ? data.error.message : "Respon kosong";
      if (percobaan < 15) await new Promise(r => setTimeout(r, 2000 + percobaan * 1000));
    }

    let reply = "Maaf error.";
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      reply = data.candidates[0].content.parts[0].text;
      // INI KUNCINYA: BERSIHIN OTAK GEMMA YANG BOCOR
      reply = bersihinJawaban(reply);
    } else {
      reply = `Udah dicoba 15x tapi Gemma masih rame. Coba lagi 1 menit ya. Error: ${lastError}`;
    }

    for (let i = 0; i < reply.length; i += 4096) {
      await kirim(chatId, reply.slice(i, i + 4096), TELEGRAM_TOKEN);
    }
    return res.status(200).send("OK");
  } catch (e) { console.log(e); return res.status(200).send("OK"); }
}

async function callGemini(model, text, key) {
  const hariIni = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Makassar' });
  
  // JANGAN pakai systemInstruction! Selipin perintahnya di sini aja
  const promptLengkap = `Kamu adalah teman chat Telegram, bahasa Indonesia santai. Hari ini ${hariIni}. Jawab langsung saja, jangan tampilkan analisamu. Jangan tulis "User says", "Role", "Constraints", atau "Example". Langsung jawab pertanyaan ini saja:\n\nPertanyaan: ${text}\nJawaban:`;

  const body = {
    contents: [{ parts: [{ text: promptLengkap }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
  };
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  return await r.json();
}

// Fungsi buat motong bagian "User says:", "Role:", "Constraints:" dll
function bersihinJawaban(teks) {
  let bersih = teks;

  // Kalau ada kata "Jawaban:" ambil yang setelahnya aja
  if (bersih.includes("Jawaban:")) {
    const parts = bersih.split("Jawaban:");
    bersih = parts[parts.length - 1];
  }
  // Kalau masih ada "Example:" buang yang sebelum Example, ambil contoh jawabannya
  // Contoh: 'Example: "Halo juga!"' -> jadi 'Halo juga!'
  if (bersih.includes("Example:")) {
    const match = bersih.match(/Example:\s*["']?([^"'\n]+)["']?/);
    if (match) bersih = match[1];
  }
  // Buang semua baris yang diawali * User, * Role, * Constraints, * Casual, dll
  const baris = bersih.split("\n").filter(b => {
    const bLower = b.toLowerCase().trim();
    return !bLower.startsWith("* user") && !bLower.startsWith("* role") && !bLower.startsWith("* constraint") && !bLower.startsWith("* casual") && !bLower.startsWith("* direct") && !bLower.startsWith("* language") && !bLower.startsWith("* current date") && !bLower.startsWith("* today") && !bLower.startsWith("* tomorrow");
  });
  bersih = baris.join("\n").trim();

  // Buang sisa markdown * yang nyangkut di awal baris
  bersih = bersih.replace(/^\s*\*\s+/gm, "");

  return bersih || teks;
}

async function kirim(chatId, text, token) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

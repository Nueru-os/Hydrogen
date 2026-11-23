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

  // STRATEGI BARU: Paksa jawab di dalam <<<JAWABAN>>> ... <<<SELESAI>>>
  const promptLengkap = `Kamu adalah teman chat Telegram, bahasa Indonesia santai. Hari ini ${hariIni}.

Tugasmu: Jawab pertanyaan user.
ATURAN KERAS: Kamu DILARANG menulis Persona, Language, Constraint, Input Question, Since, Considering, analisis, atau penjelasan apapun. Langsung tulis jawabanmu saja di dalam tanda ini.

Format wajib:
<<<JAWABAN>>>
(tulis jawabanmu di sini saja)
<<<SELESAI>>>

Pertanyaan user: ${text}
<<<JAWABAN>>>`;

  const body = {
    contents: [{ parts: [{ text: promptLengkap }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192 }
  };
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  return await r.json();
}

function bersihinJawaban(teks) {
  let bersih = teks;

  // 1. Cara paling ampuh: Ambil yang ada di dalam <<<JAWABAN>>> ... <<<SELESAI>>>
  if (bersih.includes("<<<JAWABAN>>>")) {
    let potong = bersih.split("<<<JAWABAN>>>").pop();
    if (potong.includes("<<<SELESAI>>>")) potong = potong.split("<<<SELESAI>>>")[0];
    bersih = potong.trim();
    // Kalau masih ada sisa ">>>" di depan, buang
    bersih = bersih.replace(/^>>>/, "").trim();
    if (bersih) return bersih;
    bersih = teks; // kalau kosong, balik ke cara lama
  }

  // 2. Cara cadangan: Kalau dia masih nulis "Halo juga!" di dalam petik "..." di akhir, ambil petik terakhir itu
  const semuaPetik = [...bersih.matchAll(/"([^"\n]{2,200})"/g)];
  if (semuaPetik.length > 0) {
    const terakhir = semuaPetik[semuaPetik.length - 1][1];
    // Cuma ambil kalau petik terakhir itu kelihatan kayak jawaban, bukan kayak "halo?"
    if (terakhir.toLowerCase() !== "halo?" && !terakhir.toLowerCase().includes("user says")) {
      return terakhir;
    }
  }

  // 3. Cara terakhir: Buang semua baris bocor
  const baris = bersih.split("\n").filter(b => {
    const l = b.toLowerCase().trim();
    return !l.startsWith("persona:") && !l.startsWith("language:") && !l.startsWith("current date:") && !l.startsWith("constraint:") && !l.startsWith("input question:") && !l.startsWith("since") && !l.startsWith("considering") && !l.startsWith("* user") && !l.startsWith("* role") && !l.startsWith("* constraint") && !l.startsWith("jawaban:") && !l.startsWith("<<<");
  });
  bersih = baris.join("\n").trim().replace(/^\s*\*\s+/gm, "");
  return bersih || teks;
}

async function kirim(chatId, text, token) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

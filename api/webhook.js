const MODEL = "gemma-4-26b-a4b-it"; // PINDAH KE YANG JAGO NGOBROL

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("Bot Gemma Jalan!");
  const update = req.body;
  try {
    if (!update.message || !update.message.text) return res.status(200).send("OK");
    const chatId = update.message.chat.id;
    const text = update.message.text;
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (text === "/start") {
      await kirim(chatId, "Halo! Saya Gemma.", TELEGRAM_TOKEN);
      return res.status(200).send("OK");
    }

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendChatAction`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" })
    });

    let replyBersih = "";
    let lastError = "";

    // RETRY SAMPE DAPET JAWABAN YANG BENER, BUKAN CUMA "and"
    for (let percobaan = 1; percobaan <= 5; percobaan++) {
      const data = await callGemini(MODEL, text, GEMINI_API_KEY);
      const mentah = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (data.error) lastError = data.error.message;

      replyBersih = bersihinJawaban(mentah);

      // Validasi: Kalau jawaban cuma "and", "Nu:", "hydrogen", atau kosong -> anggap GAGAL, coba lagi
      const jelek = ["and", "nu:", "hydrogen", "```", ""];
      const isJelek = replyBersih.length < 3 || jelek.includes(replyBersih.toLowerCase().trim());
      console.log(`Percobaan ${percobaan}: "${replyBersih}" | jelek? ${isJelek}`);

      if (!isJelek) break; // Kalau udah bagus, stop
      if (percobaan < 5) await new Promise(r => setTimeout(r, 2000));
    }

    let reply = replyBersih || `Maaf, Gemma lagi ngaco. Coba kirim lagi ya. Error: ${lastError}`;

    for (let i = 0; i < reply.length; i += 4096) {
      await kirim(chatId, reply.slice(i, i + 4096), TELEGRAM_TOKEN);
    }
    return res.status(200).send("OK");
  } catch (e) { console.log(e); return res.status(200).send("OK"); }
}

async function callGemini(model, text, key) {
  const hariIni = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Makassar' });
  // Prompt super simple, jangan dikasih aturan ribet lagi
  const promptLengkap = `Hari ini ${hariIni}. Kamu adalah teman chat. Jawab dengan bahasa Indonesia santai, singkat, tanpa markdown, tanpa tanda *, tanpa kode, tanpa kata "hydrogen", tanpa kata "Nu:". Pertanyaan: ${text}`;

  const body = {
    contents: [{ parts: [{ text: promptLengkap }] }],
    generationConfig: { temperature: 0.5, maxOutputTokens: 2048 }
  };
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  return await r.json();
}

function bersihinJawaban(teks) {
  let b = teks || "";
  // Buang semua yang bikin ngawur
  b = b.replace(/```/g, ""); // buang tanda kode ```
  b = b.replace(/hydrogen gen 4:/gi, "");
  b = b.replace(/hydrogen:/gi, "");
  b = b.replace(/^Nu:/gim, "");
  b = b.replace(/^\s*\*\s+/gm, ""); // buang * di awal baris
  b = b.replace(/^\s*-\s+/gm, "");
  b = b.replace(/<<<JAWABAN>>>/g, "").replace(/<<<SELESAI>>>/g, "");
  b = b.replace(/Persona:.*$/gim, "").replace(/Language:.*$/gim, "").replace(/Constraint:.*$/gim, "").replace(/Input Question:.*$/gim, "").replace(/Current Date:.*$/gim, "");
  b = b.trim();

  // Kalau sisa tinggal kata "and" doang, buang
  if (b.toLowerCase() === "and" || b.toLowerCase() === "and `") return "";

  // Kalau ada baris "Since..." / "Considering..." buang
  const baris = b.split("\n").filter(x => {
    const l = x.toLowerCase().trim();
    return !l.startsWith("since ") && !l.startsWith("considering ") && l !== "and" && l !== "and `";
  });
  return baris.join("\n").trim();
}

async function kirim(chatId, text, token) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

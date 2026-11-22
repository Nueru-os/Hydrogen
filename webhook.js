const MODEL = "gemini-4-hydrogen";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Bot Gemini 4 Hydrogen Jalan di Vercel!");
  }

  const update = req.body;

  // Biar Vercel tidak timeout, bales dulu "OK"
  res.status(200).send("OK");

  try {
    if (!update.message || !update.message.text) return;
    const chatId = update.message.chat.id;
    const text = update.message.text;
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (text === "/start") {
      await kirim(chatId, "Halo! Saya Gemini 4 Hydrogen (Thinking HIGH) jalan di Vercel.", TELEGRAM_TOKEN);
      return;
    }

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" })
    });

    // Panggil Gemini 4 Hydrogen
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: text }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
          thinkingConfig: { thinkingLevel: "high", includeThoughts: false }
        })
      }
    );

    const data = await geminiRes.json();
    let reply = "Maaf error.";
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      reply = data.candidates[0].content.parts[0].text;
    } else if (data.error) {
      reply = "Error: " + data.error.message;
    }

    for (let i = 0; i < reply.length; i += 4096) {
      await kirim(chatId, reply.slice(i, i + 4096), TELEGRAM_TOKEN);
    }

  } catch (e) {
    console.log(e);
  }
}

async function kirim(chatId, text, token) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

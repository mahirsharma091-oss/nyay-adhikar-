// nyay-adhikar-voice-server.js
// यह backend keypad/साधारण फ़ोन से आने वाली कॉल को Twilio Voice के ज़रिए
// Claude AI से जोड़ता है। भाषा चुनने के लिए keypad (1/2/3) इस्तेमाल होता है।

const express = require("express");
const app = express();
app.use(express.urlencoded({ extended: false })); // Twilio form-data भेजता है

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3000;

// भाषा कोड से नाम (TTS आवाज़ अभी सिर्फ हिन्दी वाली उपलब्ध है,
// पर AI जवाब उसी बोली के हिसाब से अंदाज़ में देने की कोशिश करेगा)
const LANGUAGES = {
  "1": "हिन्दी",
  "2": "हरियाणवी",
  "3": "भोजपुरी",
};

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function askClaude(userText, languageName) {
  const systemPrompt = `आप भारत के आम नागरिकों के लिए एक कानूनी अधिकार सहायक हैं, फ़ोन कॉल पर बात कर रहे हैं। उपयोगकर्ता ने ${languageName} में अपनी भाषा चुनी है — जवाब सरल, बोलचाल की ${languageName} मिश्रित हिन्दी में दें, जैसे कोई व्यक्ति फ़ोन पर बोलकर समझाता है।

जवाब छोटा रखें (ज़्यादा से ज़्यादा 80-100 शब्द, क्योंकि यह सुना जाएगा, पढ़ा नहीं जाएगा)। पहले अधिकार बताएं, फिर बिना रिश्वत सही तरीके से आवेदन कैसे करें। कभी यह न कहें कि यह पक्की कानूनी सलाह है।`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: "user", content: userText }],
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.content.map((b) => b.text || "").join("");
}

// STEP 1 — जब कोई कॉल करे, Twilio यहां हिट करता है
app.post("/voice", (req, res) => {
  res.set("Content-Type", "text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="/listen" method="POST" timeout="10">
    <Say language="hi-IN">नमस्ते, न्याय सहायक में आपका स्वागत है। हिन्दी के लिए 1 दबाएं। हरियाणवी के लिए 2 दबाएं। भोजपुरी के लिए 3 दबाएं।</Say>
  </Gather>
  <Say language="hi-IN">कोई बटन नहीं दबाया गया। धन्यवाद।</Say>
</Response>`);
});

// STEP 2 — भाषा चुनने के बाद, अब समस्या बोलने को कहें
app.post("/listen", (req, res) => {
  const digit = req.body.Digits || "1";
  const languageName = LANGUAGES[digit] || "हिन्दी";

  res.set("Content-Type", "text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" language="hi-IN" speechTimeout="auto" action="/process?lang=${encodeURIComponent(languageName)}" method="POST">
    <Say language="hi-IN">अब अपनी समस्या बोलिए, पूरा बोलने के बाद थोड़ा रुक जाएं।</Say>
  </Gather>
  <Say language="hi-IN">कुछ सुनाई नहीं दिया। धन्यवाद।</Say>
</Response>`);
});

// STEP 3 — बोली हुई समस्या टेक्स्ट में आती है (Twilio अपने आप कर देता है), AI को भेजें
app.post("/process", async (req, res) => {
  const spokenText = req.body.SpeechResult;
  const languageName = decodeURIComponent(req.query.lang || "हिन्दी");

  res.set("Content-Type", "text/xml");

  if (!spokenText) {
    return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say language="hi-IN">माफ़ करें, समझ नहीं आया। कृपया दोबारा कॉल करें।</Say></Response>`);
  }

  try {
    const reply = await askClaude(spokenText, languageName);
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN">${escapeXml(reply)}</Say>
  <Say language="hi-IN">धन्यवाद, कॉल समाप्त हो रही है।</Say>
</Response>`);
  } catch (err) {
    console.error(err);
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say language="hi-IN">माफ़ करें, अभी जवाब नहीं मिल सका। कृपया बाद में कोशिश करें।</Say></Response>`);
  }
});

app.get("/", (req, res) => res.send("Nyay Adhikar Voice server चल रहा है ✅"));

app.listen(PORT, () => console.log(`Server chal raha hai: http://localhost:${PORT}`));

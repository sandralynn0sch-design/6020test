exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "POST only" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(500, { error: "Missing GEMINI_API_KEY" });
  }

  try {
    const { imageDataUrl, targetText } = JSON.parse(event.body || "{}");
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageDataUrl || "");
    if (!match) {
      return json(400, { error: "imageDataUrl is required" });
    }

    const [, mimeType, data] = match;
    const prompt = [
      "초등학생 손글씨 사진을 판독해 주세요.",
      "정답 문장이 있으면 판독 결과와 비교해 주세요.",
      "JSON만 반환하세요. 마크다운 코드블록은 쓰지 마세요.",
      "필드: recognizedText(string), uncertainChars(string[]), readabilityScore(number 0-100), feedback(string[]).",
      `정답 문장: ${targetText || ""}`,
    ].join("\n");

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      }),
    });

    if (!response.ok) {
      return json(response.status, { error: await response.text() });
    }

    const gemini = await response.json();
    const text = gemini.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const parsed = JSON.parse(text);

    return json(200, {
      recognizedText: parsed.recognizedText || "",
      uncertainChars: Array.isArray(parsed.uncertainChars) ? parsed.uncertainChars : [],
      readabilityScore: Number.isFinite(Number(parsed.readabilityScore)) ? Number(parsed.readabilityScore) : 0,
      feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [parsed.feedback].filter(Boolean),
    });
  } catch (error) {
    return json(500, { error: error.message });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}

const BASE_URL = "https://voice-ai-banking-assistant-1.onrender.com";

export const sendText = async (text: string) => {
  const res = await fetch(
    `${BASE_URL}/process-text/?session_id=123&text=${encodeURIComponent(text)}`,
    {
      method: "POST"
    }
  );

  if (!res.ok) {
    throw new Error("API error");
  }

  return res.json();
};
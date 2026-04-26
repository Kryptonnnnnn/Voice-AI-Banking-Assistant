export const sendText = async (text: string) => {
  const res = await fetch("http://localhost:8000/process-text/?session_id=123&text=" + text, {
    method: "POST"
  });
  return res.json();
};
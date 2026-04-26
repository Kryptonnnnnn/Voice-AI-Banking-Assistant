import { useState } from "react";

export default function VoiceRecorder({ onResult }: any) {
  const [listening, setListening] = useState(false);

  const startRecording = () => {
    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.lang = "en-IN";

    setListening(true);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
      setListening(false);
    };

    recognition.onerror = () => setListening(false);

    recognition.start();
  };

  return (
    <button
      onClick={startRecording}
      style={{
        padding: "10px 20px",
        background: listening ? "red" : "black",
        color: "white",
        borderRadius: "8px",
      }}
    >
      {listening ? "Listening..." : "🎤 Speak"}
    </button>
  );
}
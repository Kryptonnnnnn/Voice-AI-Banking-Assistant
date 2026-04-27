import { useEffect, useRef, useState, useCallback } from "react";

const BASE_URL = "https://voice-ai-banking-assistant-1.onrender.com";

const getSpeechRecognition = () =>
  (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition || null;

const isVoiceSupported = (): boolean => {
  const SR = getSpeechRecognition();
  if (!SR) return false;
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isSafariOnly = /^((?!chrome|android).)*safari/i.test(ua);
  if (isIOS || isSafariOnly) return false;
  return true;
};

function App() {
  const [chat, setChat]               = useState<any[]>([]);
  const [input, setInput]             = useState("");
  const [sessionId]                   = useState(() => crypto.randomUUID());
  const [listening, setListening]     = useState(false);
  const [kycActive, setKycActive]     = useState(false);
  const [botSpeaking, setBotSpeaking] = useState(false);
  const [permDenied, setPermDenied]   = useState(false);
  const [awaitingCheque, setAwaitingCheque] = useState(false);
  const [started, setStarted]         = useState(false);
  const [voiceUnsupported]            = useState(() => !isVoiceSupported());
  const [networkBlocked, setNetworkBlocked] = useState(false);
  const [botTyping, setBotTyping]     = useState(false);

  const recognitionRef   = useRef<any>(null);
  const fileInputRef     = useRef<HTMLInputElement>(null);
  const videoRef         = useRef<HTMLVideoElement>(null);
  const chatEndRef       = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const listeningRef     = useRef(false);
  const pausedForSpeech  = useRef(false);
  const finishTimerRef   = useRef<any>(null);
  const voiceKilledRef   = useRef(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, botTyping]);

  useEffect(() => { listeningRef.current = listening; }, [listening]);

  const killVoice = useCallback(() => {
    voiceKilledRef.current = true;
    setListening(false);
    listeningRef.current = false;
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
  }, []);

  const resumeMic = useCallback(() => {
    pausedForSpeech.current = false;
    setBotSpeaking(false);
    if (listeningRef.current && recognitionRef.current && !voiceKilledRef.current) {
      try { recognitionRef.current.start(); } catch {}
    }
  }, []);

  const speak = useCallback((text: string, onDone?: () => void) => {
    if (!window.speechSynthesis) { onDone?.(); return; }
    speechSynthesis.cancel();
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);

    if (recognitionRef.current && listeningRef.current) {
      pausedForSpeech.current = true;
      try { recognitionRef.current.stop(); } catch {}
    }

    setBotSpeaking(true);

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.95;

    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
      resumeMic();
      onDone?.();
    };

    utter.onend   = finish;
    utter.onerror = finish;
    finishTimerRef.current = setTimeout(finish, Math.min(text.length * 60, 12000) + 1500);
    speechSynthesis.speak(utter);
  }, [resumeMic]);

  const addBotMsg = useCallback((text: string) => {
    setChat((prev) => [...prev, { bot: text }]);
    speak(text);
  }, [speak]);

  const startVoice = useCallback(() => {
    if (voiceUnsupported || voiceKilledRef.current) return;

    const SR = getSpeechRecognition();
    if (!SR) return;
    if (recognitionRef.current && listeningRef.current) return;

    const r = new SR();
    r.lang            = "en-US";
    r.continuous      = true;
    r.interimResults  = false;
    r.maxAlternatives = 1;

    r.onstart = () => {
      if (!pausedForSpeech.current) setListening(true);
    };

    r.onresult = async (event: any) => {
      const result     = event.results[event.results.length - 1];
      if (!result.isFinal) return;
      const text       = result[0].transcript.trim();
      const confidence = result[0].confidence;
      if (!text) return;
      if (typeof confidence === "number" && confidence < 0.35) return;
      await handleUser(text);
    };

    r.onerror = (event: any) => {
      if (event.error === "aborted" || event.error === "no-speech") return;

      if (event.error === "not-allowed") {
        killVoice();
        setPermDenied(true);
        return;
      }
      if (event.error === "audio-capture") {
        killVoice();
        return;
      }
      if (event.error === "network") {
        killVoice();
        setNetworkBlocked(true);
        return;
      }
    };

    r.onend = () => {
      if (listeningRef.current && !pausedForSpeech.current && !voiceKilledRef.current) {
        try { r.start(); } catch {}
      }
    };

    recognitionRef.current = r;
    voiceKilledRef.current = false;
    setListening(true);
    listeningRef.current = true;
    try { r.start(); } catch {}
  }, [voiceUnsupported, killVoice]);

  const handleStart = () => {
    setStarted(true);
    const msg = "Welcome to Kentiq AI Voice Banking. How can I help you?";
    setChat([{ bot: msg }]);
    speak(msg);
    if (!voiceUnsupported) startVoice();
  };

  const sendText = async (text: string) => {
    try {
      const res = await fetch(
        `${BASE_URL}/process-text/?session_id=${sessionId}&text=${encodeURIComponent(text)}`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error();
      return res.json();
    } catch {
      return { response: "Sorry, I'm having trouble connecting. Please try again." };
    }
  };

  const handleUser = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setChat((prev) => [...prev, { user: trimmed }]);
    const lower = trimmed.toLowerCase();

    if (
      lower.includes("upload cheque") || lower.includes("scan cheque") ||
      lower.includes("upload check")  || lower.includes("scan check")
    ) {
      setAwaitingCheque(true);
      addBotMsg("Please tap the button below to upload your cheque image.");
      return;
    }

    if (
      lower.includes("kyc")          || lower.includes("start kyc") ||
      lower.includes("complete kyc") || lower.includes("begin kyc")
    ) {
      startKYC();
      return;
    }

    setBotTyping(true);
    const res = await sendText(trimmed);
    setBotTyping(false);
    addBotMsg(res.response);
  };

  const stopVoice = () => {
    setListening(false);
    listeningRef.current = false;
    try { recognitionRef.current?.stop(); } catch {}
  };

  const triggerChequeUpload = () => fileInputRef.current?.click();

  const uploadCheque = async (file: File) => {
    setAwaitingCheque(false);
    if (!file.type.startsWith("image/")) {
      addBotMsg("Invalid file. Please upload a JPG or PNG image of the cheque.");
      return;
    }
    setChat((prev) => [...prev, { user: `📎 ${file.name}` }]);
    addBotMsg("Analysing your cheque…");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res  = await fetch(`${BASE_URL}/upload-cheque/`, { method: "POST", body: formData });
      const data = await res.json();
      addBotMsg(data.message);
    } catch {
      addBotMsg("Failed to process the cheque. Please try again.");
    }
  };

  const startKYC = async () => {
    addBotMsg("Starting KYC. Please look at the camera.");
    setKycActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.style.display = "block";
      }
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href = url; a.download = `kyc_${sessionId}.webm`; a.click();
        URL.revokeObjectURL(url);
      };
      recorder.start();
      setTimeout(() => {
        recorder.stop();
        stream.getTracks().forEach((t) => t.stop());
        if (videoRef.current) videoRef.current.style.display = "none";
        setKycActive(false);
        addBotMsg("KYC completed successfully. Your recording has been saved.");
      }, 5000);
    } catch {
      setKycActive(false);
      addBotMsg("Camera or microphone access is required for KYC. Please allow permissions.");
    }
  };

  const send = async () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput("");
    await handleUser(text);
  };

  const showVoiceUnavailable = voiceUnsupported || networkBlocked;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; background: #eef0f4; min-height: 100vh; }

        .app { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 16px; gap: 16px; }

        .brand { display: flex; align-items: center; gap: 13px; }
        .brand-logo { width: 44px; height: 44px; border-radius: 12px; background: #1b3060; display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 4px 12px rgba(27,48,96,0.25); }
        .brand-name { font-size: 20px; font-weight: 700; color: #1b3060; letter-spacing: -0.3px; }
        .brand-sub  { font-size: 11px; color: #94a3b8; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.06em; }

        .kyc-badge { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: #dc2626; background: #fff1f1; border: 1px solid #fecaca; padding: 6px 14px; border-radius: 20px; }
        .kyc-pulse { width: 7px; height: 7px; border-radius: 50%; background: #dc2626; animation: blink 0.75s infinite; }

        video { display: none; width: 100%; max-width: 700px; border-radius: 12px; border: 2px solid #1b3060; }

        .window { width: 100%; max-width: 700px; background: #fff; border-radius: 20px; box-shadow: 0 4px 32px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06); display: flex; flex-direction: column; height: 74vh; overflow: hidden; position: relative; }

        .topbar { padding: 14px 20px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between; background: #fff; }
        .session-status { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #475569; font-weight: 500; }
        .dot-live { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 2px #dcfce7; }

        .voice-area { display: flex; align-items: center; gap: 10px; }
        .voice-chip { display: flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; transition: all 0.2s; }
        .chip-idle     { background: #f8fafc; color: #94a3b8; border: 1px solid #e2e8f0; }
        .chip-on       { background: #f0fdf4; color: #16a34a; border: 1px solid #86efac; }
        .chip-speaking { background: #eff6ff; color: #2563eb; border: 1px solid #93c5fd; }
        .chip-denied   { background: #fff1f1; color: #dc2626; border: 1px solid #fca5a5; }
        .chip-unavail  { background: #fafafa; color: #94a3b8; border: 1px solid #e2e8f0; }

        .bars { display: flex; align-items: center; gap: 2px; height: 14px; }
        .bars span { display: block; width: 3px; border-radius: 3px; background: #16a34a; animation: wav 0.9s ease-in-out infinite; }
        .bars span:nth-child(2) { animation-delay: 0.15s; }
        .bars span:nth-child(3) { animation-delay: 0.3s; }
        @keyframes wav { 0%,100%{height:3px} 50%{height:13px} }

        .mic-toggle { padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; font-family: inherit; cursor: pointer; border: 1.5px solid #1b3060; background: transparent; color: #1b3060; transition: all 0.15s; }
        .mic-toggle:hover { background: #f0f4ff; }
        .mic-toggle.mute { border-color: #ef4444; color: #ef4444; }
        .mic-toggle.mute:hover { background: #fff1f1; }
        .mic-toggle:disabled { opacity: 0.4; cursor: not-allowed; }

        .banner { margin: 8px 18px 0; padding: 9px 14px; border-radius: 8px; font-size: 12px; display: flex; align-items: center; gap: 8px; }
        .banner-warn    { background: #fff7ed; border: 1px solid #fed7aa; color: #92400e; }
        .banner-network { background: #f0f9ff; border: 1px solid #bae6fd; color: #0369a1; }
        .banner-safari  { background: #fefce8; border: 1px solid #fde68a; color: #92400e; }

        .msgs { flex: 1; overflow-y: auto; padding: 20px 18px; display: flex; flex-direction: column; gap: 14px; background: #f8fafc; scroll-behavior: smooth; }
        .msgs::-webkit-scrollbar { width: 4px; }
        .msgs::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }

        .row { display: flex; }
        .row.user { justify-content: flex-end; }
        .row.bot  { justify-content: flex-start; align-items: flex-end; gap: 9px; }

        .av { width: 30px; height: 30px; border-radius: 50%; background: #1b3060; color: #fff; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-bottom: 2px; box-shadow: 0 2px 8px rgba(27,48,96,0.2); }

        .bubble { max-width: 66%; padding: 10px 15px; font-size: 14px; line-height: 1.55; border-radius: 18px; }
        .bubble.user { background: #1b3060; color: #fff; border-bottom-right-radius: 4px; box-shadow: 0 2px 8px rgba(27,48,96,0.2); }
        .bubble.bot  { background: #fff; color: #1e293b; border: 1px solid #e8edf3; border-bottom-left-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }

        .typing-bubble { display: flex; gap: 5px; align-items: center; padding: 14px 18px; }
        .dot { width: 7px; height: 7px; border-radius: 50%; background: #94a3b8; display: inline-block; animation: bounce 1.2s infinite; }
        .dot:nth-child(2) { animation-delay: 0.2s; }
        .dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }

        .upload-card { background: #fff; border: 2px dashed #93c5fd; border-radius: 14px; padding: 18px 20px; display: flex; flex-direction: column; align-items: center; gap: 10px; max-width: 280px; }
        .upload-card p { font-size: 13px; color: #475569; text-align: center; line-height: 1.4; }
        .upload-btn { display: flex; align-items: center; gap: 7px; padding: 9px 20px; border-radius: 22px; background: #1b3060; color: #fff; font-size: 13px; font-weight: 600; font-family: inherit; border: none; cursor: pointer; transition: opacity 0.15s; }
        .upload-btn:hover { opacity: 0.85; }

        .start-overlay { position: absolute; inset: 0; z-index: 10; background: rgba(248,250,252,0.97); display: flex; align-items: center; justify-content: center; border-radius: 20px; cursor: pointer; }
        .start-card { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 32px; text-align: center; }
        .start-icon { font-size: 52px; }
        .start-card h2 { font-size: 22px; font-weight: 700; color: #1b3060; }
        .start-card p  { font-size: 14px; color: #64748b; max-width: 260px; line-height: 1.6; }
        .start-btn { padding: 13px 36px; border-radius: 28px; background: #1b3060; color: #fff; font-size: 15px; font-weight: 700; font-family: inherit; border: none; cursor: pointer; box-shadow: 0 4px 16px rgba(27,48,96,0.3); transition: opacity 0.15s; }
        .start-btn:hover { opacity: 0.85; }
        .start-note { font-size: 11px; color: #94a3b8; max-width: 240px; }

        .inputbar { padding: 12px 16px; border-top: 1px solid #f1f5f9; display: flex; gap: 8px; align-items: center; background: #fff; }
        .fallback-label { font-size: 10px; font-weight: 700; color: #cbd5e1; letter-spacing: 0.08em; white-space: nowrap; }
        .chat-input { flex: 1; padding: 10px 16px; border: 1.5px solid #e8edf3; border-radius: 24px; font-family: inherit; font-size: 14px; color: #1e293b; outline: none; background: #f8fafc; transition: border-color 0.15s, background 0.15s; }
        .chat-input::placeholder { color: #94a3b8; }
        .chat-input:focus { border-color: #1b3060; background: #fff; }
        .send-btn { width: 40px; height: 40px; border-radius: 50%; background: #1b3060; color: #fff; border: none; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 2px 8px rgba(27,48,96,0.25); transition: opacity 0.15s; }
        .send-btn:hover { opacity: 0.82; }

        .footer-txt { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; }

        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
      `}</style>

      <div className="app">
        <div className="brand">
          <div className="brand-logo">🏦</div>
          <div>
            <div className="brand-name">Kentiq</div>
            <div className="brand-sub">AI Voice Banking · Dubai Bank</div>
          </div>
        </div>

        {kycActive && (
          <div className="kyc-badge">
            <div className="kyc-pulse" /> KYC recording in progress…
          </div>
        )}

        <video ref={videoRef} autoPlay muted />

        <div className="window">
          {!started && (
            <div className="start-overlay" onClick={handleStart}>
              <div className="start-card">
                <div className="start-icon">🏦</div>
                <h2>Kentiq AI Banking</h2>
                {voiceUnsupported ? (
                  <p>Voice is not supported on this browser. You can type all commands below — everything works via text.</p>
                ) : (
                  <p>Tap to start your voice banking session. Microphone access will be requested.</p>
                )}
                <button className="start-btn">
                  {voiceUnsupported ? "💬 Tap to Begin" : "🎤 Tap to Begin"}
                </button>
                {!voiceUnsupported && (
                  <span className="start-note">Works best on Chrome or Edge on desktop</span>
                )}
              </div>
            </div>
          )}

          <div className="topbar">
            <div className="session-status">
              <div className="dot-live" />
              Secure session active
            </div>
            <div className="voice-area">
              {listening && !botSpeaking && (
                <div className="voice-chip chip-on">
                  <div className="bars"><span /><span /><span /></div>
                  Listening
                </div>
              )}
              {botSpeaking && (
                <div className="voice-chip chip-speaking">🔊 Speaking…</div>
              )}
              {!listening && !botSpeaking && !permDenied && !showVoiceUnavailable && (
                <div className="voice-chip chip-idle">Mic off</div>
              )}
              {permDenied && (
                <div className="voice-chip chip-denied">🚫 Blocked</div>
              )}
              {showVoiceUnavailable && !permDenied && (
                <div className="voice-chip chip-unavail">⌨️ Type only</div>
              )}
              {!showVoiceUnavailable && !voiceUnsupported && (
                <button
                  className={`mic-toggle ${listening ? "mute" : ""}`}
                  onClick={listening ? stopVoice : startVoice}
                  disabled={permDenied}
                >
                  {listening ? "Mute" : "🎤 Start"}
                </button>
              )}
            </div>
          </div>

          {permDenied && (
            <div className="banner banner-warn">
              ⚠️ Mic blocked — click 🔒 in your browser bar, allow microphone, then refresh.
            </div>
          )}
          {networkBlocked && !permDenied && (
            <div className="banner banner-network">
              ℹ️ Voice unavailable on this network — type your messages below, all features work.
            </div>
          )}
          {voiceUnsupported && !networkBlocked && !permDenied && (
            <div className="banner banner-safari">
              ⚠️ Voice not supported on Safari/iOS — please use Chrome or Edge, or type below.
            </div>
          )}

          <div className="msgs">
            {chat.map((c, i) => (
              <div key={i}>
                {c.user && (
                  <div className="row user">
                    <div className="bubble user">{c.user}</div>
                  </div>
                )}
                {c.bot && (
                  <div className="row bot">
                    <div className="av">K</div>
                    <div className="bubble bot">{c.bot}</div>
                  </div>
                )}
              </div>
            ))}

            {botTyping && (
              <div className="row bot">
                <div className="av">K</div>
                <div className="bubble bot typing-bubble">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
              </div>
            )}

            {awaitingCheque && (
              <div className="row bot">
                <div className="av">K</div>
                <div className="upload-card">
                  <p>Tap below to select your cheque image (JPG or PNG)</p>
                  <button className="upload-btn" onClick={triggerChequeUpload}>
                    📎 Upload Cheque
                  </button>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          <div className="inputbar">
            <span className="fallback-label">TYPE</span>
            <input
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={showVoiceUnavailable ? "Type your message here…" : "Or type here as a fallback…"}
            />
            <button className="send-btn" onClick={send}>↑</button>
          </div>
        </div>

        <p className="footer-txt">256-bit encrypted · Powered by Kentiq AI</p>
      </div>

      <input
        type="file"
        accept="image/*"
        hidden
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files?.[0]) uploadCheque(e.target.files[0]);
          e.target.value = "";
        }}
      />
    </>
  );
}

export default App;
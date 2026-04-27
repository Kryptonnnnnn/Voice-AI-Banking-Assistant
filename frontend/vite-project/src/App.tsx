import { useEffect, useRef, useState, useCallback } from "react";

const BASE_URL = "https://voice-ai-banking-assistant-1.onrender.com";

const getSR = () =>
  (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition || null;

const isSafariOrIOS = () => {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  if (/^((?!chrome|android).)*safari/i.test(ua)) return true;
  return false;
};

function App() {
  const [chat, setChat]                     = useState<any[]>([]);
  const [input, setInput]                   = useState("");
  const [sessionId]                         = useState(() => crypto.randomUUID());
  const [listening, setListening]           = useState(false);
  const [kycActive, setKycActive]           = useState(false);
  const [botSpeaking, setBotSpeaking]       = useState(false);
  const [permDenied, setPermDenied]         = useState(false);
  const [awaitingCheque, setAwaitingCheque] = useState(false);
  const [started, setStarted]               = useState(false);
  const [botTyping, setBotTyping]           = useState(false);
  const [micMode, setMicMode]               = useState<"continuous"|"single"|"none">("continuous");
  const [singleActive, setSingleActive]     = useState(false);

  const recognitionRef = useRef<any>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const videoRef       = useRef<HTMLVideoElement>(null);
  const chatEndRef     = useRef<HTMLDivElement>(null);
  const kycRecRef      = useRef<MediaRecorder | null>(null);
  const listeningRef   = useRef(false);
  const pausedForTTS   = useRef(false);
  const finishTimer    = useRef<any>(null);
  const voiceKilled    = useRef(false);
  const speakQueue     = useRef<string[]>([]);
  const isSpeakingRef  = useRef(false);
  const cachedVoice    = useRef<SpeechSynthesisVoice | null>(null);
  const micModeRef     = useRef<"continuous"|"single"|"none">("continuous");

  useEffect(() => { micModeRef.current = micMode; }, [micMode]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, botTyping]);

  useEffect(() => { listeningRef.current = listening; }, [listening]);

  useEffect(() => {
    if (!window.speechSynthesis) return;
    const pickVoice = () => {
      if (cachedVoice.current) return;
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return;
      cachedVoice.current =
        voices.find(v => v.name === "Google US English") ||
        voices.find(v => v.name === "Samantha") ||
        voices.find(v => v.name.includes("Zira")) ||
        voices.find(v => v.lang === "en-US" && v.localService) ||
        voices.find(v => v.lang.startsWith("en") && v.localService) ||
        voices.find(v => v.lang.startsWith("en")) ||
        voices[0];
    };
    pickVoice();
    window.speechSynthesis.addEventListener("voiceschanged", pickVoice);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", pickVoice);
  }, []);

  const resumeMic = useCallback(() => {
    pausedForTTS.current = false;
    setBotSpeaking(false);
    if (micModeRef.current === "continuous" && listeningRef.current && recognitionRef.current && !voiceKilled.current) {
      try { recognitionRef.current.start(); } catch {}
    }
  }, []);

  const speakOne = useCallback((text: string) => {
    if (!window.speechSynthesis) { resumeMic(); return; }
    if (finishTimer.current) clearTimeout(finishTimer.current);
    window.speechSynthesis.cancel();
    setBotSpeaking(true);
    isSpeakingRef.current = true;

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate  = 1.05;
    utter.pitch = 1.0;
    utter.lang  = "en-US";
    if (cachedVoice.current) utter.voice = cachedVoice.current;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(finishTimer.current);
      isSpeakingRef.current = false;
      if (speakQueue.current.length > 0) {
        speakOne(speakQueue.current.shift()!);
      } else {
        resumeMic();
      }
    };
    utter.onend   = finish;
    utter.onerror = finish;
    finishTimer.current = setTimeout(finish, Math.min(text.length * 55, 10000) + 800);
    window.speechSynthesis.speak(utter);
  }, [resumeMic]);

  const speak = useCallback((text: string) => {
    if (!text.trim()) return;
    if (isSpeakingRef.current) { speakQueue.current.push(text); return; }
    if (micModeRef.current === "continuous" && recognitionRef.current && listeningRef.current) {
      pausedForTTS.current = true;
      try { recognitionRef.current.stop(); } catch {}
    }
    speakOne(text);
  }, [speakOne]);

  const addBotMsg = useCallback((text: string) => {
    setChat(prev => [...prev, { bot: text }]);
    speak(text);
  }, [speak]);

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
    setChat(prev => [...prev, { user: trimmed }]);
    const lower = trimmed.toLowerCase();

    if (lower.includes("upload cheque") || lower.includes("scan cheque") ||
        lower.includes("upload check")  || lower.includes("scan check")) {
      setAwaitingCheque(true);
      addBotMsg("Please tap the button below to upload your cheque image.");
      return;
    }
    if (lower.includes("kyc") || lower.includes("start kyc") ||
        lower.includes("complete kyc") || lower.includes("begin kyc")) {
      startKYC(); return;
    }

    setBotTyping(true);
    const res = await sendText(trimmed);
    setBotTyping(false);
    addBotMsg(res.response);
  };

  const killContinuous = useCallback(() => {
    voiceKilled.current  = true;
    setListening(false);
    listeningRef.current = false;
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
  }, []);

  const startContinuous = useCallback(() => {
    const SR = getSR();
    if (!SR || (recognitionRef.current && listeningRef.current)) return;

    const r = new SR();
    r.lang = "en-US"; r.continuous = true;
    r.interimResults = false; r.maxAlternatives = 1;

    r.onstart = () => { if (!pausedForTTS.current) setListening(true); };

    r.onresult = async (event: any) => {
      const result = event.results[event.results.length - 1];
      if (!result.isFinal) return;
      const text = result[0].transcript.trim();
      const conf = result[0].confidence;
      if (!text || (typeof conf === "number" && conf < 0.35)) return;
      await handleUser(text);
    };

    r.onerror = (event: any) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      if (event.error === "not-allowed") {
        killContinuous(); setPermDenied(true); return;
      }
      if (event.error === "network" || event.error === "audio-capture") {
        killContinuous();
        setMicMode("single");
        return;
      }
    };

    r.onend = () => {
      if (listeningRef.current && !pausedForTTS.current && !voiceKilled.current) {
        try { r.start(); } catch {}
      }
    };

    recognitionRef.current = r;
    voiceKilled.current    = false;
    setListening(true);
    listeningRef.current   = true;
    try { r.start(); } catch {}
  }, [killContinuous]);

  const startSingleShot = useCallback(() => {
    if (singleActive || isSpeakingRef.current || botTyping) return;
    const SR = getSR();
    if (!SR) { setMicMode("none"); return; }

    setSingleActive(true);
    const r = new SR();
    r.lang = "en-US";
    r.continuous      = false;
    r.interimResults  = false;
    r.maxAlternatives = 1;

    let gotResult = false;

    r.onresult = async (event: any) => {
      gotResult = true;
      const text = event.results[0]?.[0]?.transcript?.trim() || "";
      setSingleActive(false);
      if (text) await handleUser(text);
    };

    r.onerror = (event: any) => {
      setSingleActive(false);
      if (event.error === "not-allowed") { setPermDenied(true); return; }
      if (event.error === "network") { setMicMode("none"); return; }
    };

    r.onend = () => { if (!gotResult) setSingleActive(false); };

    try { r.start(); } catch { setSingleActive(false); }
  }, [singleActive, botTyping]);

  const handleStart = () => {
    setStarted(true);
    const msg = "Welcome to Kentiq AI Voice Banking. How can I help you?";
    setChat([{ bot: msg }]);
    speak(msg);
    if (isSafariOrIOS() || !getSR()) {
      setMicMode("none");
    } else {
      setMicMode("continuous");
      micModeRef.current = "continuous";
      startContinuous();
    }
  };

  const stopContinuous = () => {
    setListening(false);
    listeningRef.current = false;
    try { recognitionRef.current?.stop(); } catch {}
  };

  const triggerChequeUpload = () => fileInputRef.current?.click();

  const uploadCheque = async (file: File) => {
    setAwaitingCheque(false);
    if (!file.type.startsWith("image/")) { addBotMsg("Invalid file. Please upload a JPG or PNG."); return; }
    setChat(prev => [...prev, { user: `📎 ${file.name}` }]);
    addBotMsg("Analysing your cheque…");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res  = await fetch(`${BASE_URL}/upload-cheque/`, { method: "POST", body: fd });
      const data = await res.json();
      addBotMsg(data.message);
    } catch { addBotMsg("Failed to process the cheque. Please try again."); }
  };

  const startKYC = async () => {
    addBotMsg("Starting KYC. Please look at the camera.");
    setKycActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.style.display = "block"; }
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream);
      kycRecRef.current = recorder;
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
        stream.getTracks().forEach(t => t.stop());
        if (videoRef.current) videoRef.current.style.display = "none";
        setKycActive(false);
        addBotMsg("KYC completed successfully. Your recording has been saved.");
      }, 5000);
    } catch {
      setKycActive(false);
      addBotMsg("Camera or microphone access is required for KYC.");
    }
  };

  const send = async () => {
    if (!input.trim()) return;
    const t = input.trim(); setInput("");
    await handleUser(t);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; background: #eef0f4; min-height: 100vh; }
        .app { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 16px; gap: 16px; }
        .brand { display: flex; align-items: center; gap: 13px; }
        .brand-logo { width: 44px; height: 44px; border-radius: 12px; background: #1b3060; display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 4px 12px rgba(27,48,96,0.25); }
        .brand-name { font-size: 20px; font-weight: 700; color: #1b3060; }
        .brand-sub  { font-size: 11px; color: #94a3b8; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.06em; }
        .kyc-badge { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: #dc2626; background: #fff1f1; border: 1px solid #fecaca; padding: 6px 14px; border-radius: 20px; }
        .kyc-pulse { width: 7px; height: 7px; border-radius: 50%; background: #dc2626; animation: blink 0.75s infinite; }
        video { display: none; width: 100%; max-width: 700px; border-radius: 12px; border: 2px solid #1b3060; }
        .window { width: 100%; max-width: 700px; background: #fff; border-radius: 20px; box-shadow: 0 4px 32px rgba(0,0,0,0.1); display: flex; flex-direction: column; height: 74vh; overflow: hidden; position: relative; }
        .topbar { padding: 14px 20px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between; background: #fff; gap: 8px; flex-wrap: wrap; }
        .session-status { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #475569; font-weight: 500; }
        .dot-live { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 2px #dcfce7; }
        .voice-area { display: flex; align-items: center; gap: 8px; }
        .voice-chip { display: flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
        .chip-idle     { background: #f8fafc; color: #94a3b8; border: 1px solid #e2e8f0; }
        .chip-on       { background: #f0fdf4; color: #16a34a; border: 1px solid #86efac; }
        .chip-speaking { background: #eff6ff; color: #2563eb; border: 1px solid #93c5fd; }
        .chip-denied   { background: #fff1f1; color: #dc2626; border: 1px solid #fca5a5; }
        .chip-unavail  { background: #fafafa; color: #94a3b8; border: 1px solid #e2e8f0; }
        .chip-single   { background: #fdf4ff; color: #7e22ce; border: 1px solid #d8b4fe; }
        .bars { display: flex; align-items: center; gap: 2px; height: 14px; }
        .bars span { display: block; width: 3px; border-radius: 3px; background: #16a34a; animation: wav 0.9s ease-in-out infinite; }
        .bars span:nth-child(2) { animation-delay: 0.15s; }
        .bars span:nth-child(3) { animation-delay: 0.3s; }
        @keyframes wav { 0%,100%{height:3px} 50%{height:13px} }
        .btn-base { padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; font-family: inherit; cursor: pointer; transition: all 0.15s; border: 1.5px solid #1b3060; background: transparent; color: #1b3060; }
        .btn-base:hover { background: #f0f4ff; }
        .btn-base.mute { border-color: #ef4444; color: #ef4444; }
        .btn-base.mute:hover { background: #fff1f1; }
        .btn-base:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-single { padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 700; font-family: inherit; cursor: pointer; border: none; background: #7e22ce; color: #fff; transition: all 0.15s; display: flex; align-items: center; gap: 6px; }
        .btn-single:hover { opacity: 0.85; }
        .btn-single.active { background: #dc2626; animation: pulse 0.8s infinite; }
        .btn-single:disabled { opacity: 0.4; cursor: not-allowed; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.75} }
        .banner { margin: 8px 16px 0; padding: 9px 14px; border-radius: 8px; font-size: 12px; line-height: 1.5; }
        .banner-warn    { background: #fff7ed; border: 1px solid #fed7aa; color: #92400e; }
        .banner-network { background: #f0f9ff; border: 1px solid #bae6fd; color: #0369a1; }
        .banner-single  { background: #fdf4ff; border: 1px solid #d8b4fe; color: #6b21a8; }
        .banner-safari  { background: #fefce8; border: 1px solid #fde68a; color: #854d0e; }
        .msgs { flex: 1; overflow-y: auto; padding: 20px 18px; display: flex; flex-direction: column; gap: 14px; background: #f8fafc; scroll-behavior: smooth; }
        .msgs::-webkit-scrollbar { width: 4px; }
        .msgs::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
        .row { display: flex; }
        .row.user { justify-content: flex-end; }
        .row.bot  { justify-content: flex-start; align-items: flex-end; gap: 9px; }
        .av { width: 30px; height: 30px; border-radius: 50%; background: #1b3060; color: #fff; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-bottom: 2px; }
        .bubble { max-width: 66%; padding: 10px 15px; font-size: 14px; line-height: 1.55; border-radius: 18px; }
        .bubble.user { background: #1b3060; color: #fff; border-bottom-right-radius: 4px; }
        .bubble.bot  { background: #fff; color: #1e293b; border: 1px solid #e8edf3; border-bottom-left-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
        .typing-bubble { display: flex; gap: 5px; align-items: center; padding: 14px 18px; }
        .dot { width: 7px; height: 7px; border-radius: 50%; background: #94a3b8; display: inline-block; animation: bounce 1.2s infinite; }
        .dot:nth-child(2) { animation-delay: 0.2s; }
        .dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
        .upload-card { background: #fff; border: 2px dashed #93c5fd; border-radius: 14px; padding: 18px 20px; display: flex; flex-direction: column; align-items: center; gap: 10px; max-width: 280px; }
        .upload-card p { font-size: 13px; color: #475569; text-align: center; line-height: 1.4; }
        .upload-btn { display: flex; align-items: center; gap: 7px; padding: 9px 20px; border-radius: 22px; background: #1b3060; color: #fff; font-size: 13px; font-weight: 600; font-family: inherit; border: none; cursor: pointer; }
        .upload-btn:hover { opacity: 0.85; }
        .start-overlay { position: absolute; inset: 0; z-index: 10; background: rgba(248,250,252,0.97); display: flex; align-items: center; justify-content: center; border-radius: 20px; cursor: pointer; }
        .start-card { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 32px; text-align: center; }
        .start-icon { font-size: 52px; }
        .start-card h2 { font-size: 22px; font-weight: 700; color: #1b3060; }
        .start-card p  { font-size: 14px; color: #64748b; max-width: 280px; line-height: 1.6; }
        .start-btn { padding: 13px 36px; border-radius: 28px; background: #1b3060; color: #fff; font-size: 15px; font-weight: 700; font-family: inherit; border: none; cursor: pointer; box-shadow: 0 4px 16px rgba(27,48,96,0.3); }
        .start-note { font-size: 11px; color: #94a3b8; max-width: 260px; }
        .inputbar { padding: 12px 16px; border-top: 1px solid #f1f5f9; display: flex; gap: 8px; align-items: center; background: #fff; }
        .fallback-label { font-size: 10px; font-weight: 700; color: #cbd5e1; letter-spacing: 0.08em; white-space: nowrap; }
        .chat-input { flex: 1; padding: 10px 16px; border: 1.5px solid #e8edf3; border-radius: 24px; font-family: inherit; font-size: 14px; color: #1e293b; outline: none; background: #f8fafc; }
        .chat-input::placeholder { color: #94a3b8; }
        .chat-input:focus { border-color: #1b3060; background: #fff; }
        .send-btn { width: 40px; height: 40px; border-radius: 50%; background: #1b3060; color: #fff; border: none; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
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

        {kycActive && <div className="kyc-badge"><div className="kyc-pulse" /> KYC recording in progress…</div>}
        <video ref={videoRef} autoPlay muted />

        <div className="window">
          {!started && (
            <div className="start-overlay" onClick={handleStart}>
              <div className="start-card">
                <div className="start-icon">🏦</div>
                <h2>Kentiq AI Banking</h2>
                <p>Tap to start. Microphone access will be requested. All features also work via typing.</p>
                <button className="start-btn">🎤 Tap to Begin</button>
                <span className="start-note">Best on Chrome desktop</span>
              </div>
            </div>
          )}

          <div className="topbar">
            <div className="session-status">
              <div className="dot-live" /> Secure session active
            </div>
            <div className="voice-area">
              {micMode === "continuous" && listening && !botSpeaking && (
                <div className="voice-chip chip-on">
                  <div className="bars"><span /><span /><span /></div> Listening
                </div>
              )}
              {micMode === "single" && singleActive && (
                <div className="voice-chip chip-single">🎙 Listening…</div>
              )}
              {botSpeaking && <div className="voice-chip chip-speaking">🔊 Speaking…</div>}
              {micMode === "continuous" && !listening && !botSpeaking && !permDenied && (
                <div className="voice-chip chip-idle">Mic off</div>
              )}
              {permDenied && <div className="voice-chip chip-denied">🚫 Blocked</div>}
              {micMode === "none" && !permDenied && <div className="voice-chip chip-unavail">⌨️ Type only</div>}

              {micMode === "continuous" && (
                <button
                  className={`btn-base ${listening ? "mute" : ""}`}
                  onClick={listening ? stopContinuous : startContinuous}
                  disabled={permDenied}
                >
                  {listening ? "Mute" : "🎤 Start"}
                </button>
              )}
              {micMode === "single" && (
                <button
                  className={`btn-single ${singleActive ? "active" : ""}`}
                  onClick={startSingleShot}
                  disabled={singleActive || botSpeaking || botTyping || permDenied}
                >
                  {singleActive ? "🔴 Listening…" : "🎤 Tap to speak"}
                </button>
              )}
            </div>
          </div>

          {permDenied && (
            <div className="banner banner-warn">
              ⚠️ Mic blocked — click 🔒 in your browser bar → allow microphone → refresh.
            </div>
          )}
          {micMode === "single" && !permDenied && (
            <div className="banner banner-single">
              🎤 Tap the button and speak — result sends automatically when you stop.
            </div>
          )}
          {micMode === "none" && !permDenied && (
            <div className="banner banner-network">
              ℹ️ Voice unavailable on this network — type your messages below, all features work.
            </div>
          )}

          <div className="msgs">
            {chat.map((c, i) => (
              <div key={i}>
                {c.user && <div className="row user"><div className="bubble user">{c.user}</div></div>}
                {c.bot  && <div className="row bot"><div className="av">K</div><div className="bubble bot">{c.bot}</div></div>}
              </div>
            ))}
            {botTyping && (
              <div className="row bot">
                <div className="av">K</div>
                <div className="bubble bot typing-bubble">
                  <span className="dot"/><span className="dot"/><span className="dot"/>
                </div>
              </div>
            )}
            {awaitingCheque && (
              <div className="row bot">
                <div className="av">K</div>
                <div className="upload-card">
                  <p>Tap below to select your cheque image (JPG or PNG)</p>
                  <button className="upload-btn" onClick={triggerChequeUpload}>📎 Upload Cheque</button>
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
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}
              placeholder={micMode === "none" ? "Type your message here…" : "Or type here as a fallback…"}
            />
            <button className="send-btn" onClick={send}>↑</button>
          </div>
        </div>

        <p className="footer-txt">256-bit encrypted · Powered by Kentiq AI</p>
      </div>

      <input
        type="file" accept="image/*" hidden ref={fileInputRef}
        onChange={e => { if (e.target.files?.[0]) uploadCheque(e.target.files[0]); e.target.value = ""; }}
      />
    </>
  );
}

export default App;
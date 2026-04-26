# 🏦 Voice AI Banking Assistant

An end-to-end **AI-powered voice banking assistant** that enables users to interact with banking services using **natural voice and text**.

Built with **FastAPI + React + Web Speech API**, this project simulates real-world fintech experiences like fund transfer, cheque processing, and KYC verification.

---

## 🚀 Live Demo

* 🌐 Frontend (Vercel): https://voice-ai-banking-assistant.vercel.app/

---

## ✨ Features

### 🎤 Voice AI Interaction

* Continuous voice listening
* Speech-to-text using browser API
* Text-to-speech responses
* Smart pause while bot is speaking

### 💸 Banking Simulation

* Check account balance
* Transfer money (multi-step flow)
* Session-based conversation handling

### 🧾 Cheque Processing

* Upload cheque image
* Image validation (aspect ratio, clarity)
* Simulated cheque analysis

### 📷 KYC Recording

* Camera + mic recording
* Auto-download recorded video
* Real-time UI feedback

### 🧠 AI Integration

* LLM-powered responses using Groq (LLaMA models)
* Context-aware conversation memory

---

## 🏗️ Tech Stack

### Frontend

* React (Vite + TypeScript)
* Tailwind CSS
* Web Speech API

### Backend

* FastAPI
* Python
* Groq API (LLM)
* OpenCV (cheque validation)

---

## 📁 Project Structure

```
voice-ai-banking-assistant/
│
├── backend/
│   ├── app/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── models/
│   │   └── main.py
│   ├── requirements.txt
│
├── frontend/
│   ├── vite-project/
│   │   ├── src/
│   │   ├── components/
│   │   └── App.tsx
│
└── README.md
```

---

## ⚙️ Setup Instructions

### 1️⃣ Clone Repo

```bash
git clone https://github.com/kryptonnnnnn/voice-ai-banking-assistant.git
cd voice-ai-banking-assistant
```

---

### 2️⃣ Backend Setup

```bash
cd backend
source venv/bin/activate   # macOS/Linux
venv\Scripts\activate      # Windows

pip install -r requirements.txt
```

Create `.env` file:

```
GROQ_API_KEY=your_api_key_here
```

Run server:

```bash
uvicorn app.main:app --reload
```

---

### 3️⃣ Frontend Setup

```bash
cd frontend/vite-project
npm install
npm run dev
```

---

## ⚠️ Important Notes

* `.env` file is NOT pushed to GitHub (security)
* Microphone access requires HTTPS (works on Vercel)
* First user interaction is required to start voice (browser restriction)
* Whisper model removed for deployment (heavy memory usage)

---

## 🧠 Future Improvements

* Real bank API integration
* Voice biometrics authentication
* Fraud detection system
* Multilingual support
* Mobile app version

---

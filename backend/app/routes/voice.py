from fastapi import APIRouter
from app.services.llm import ask_llm
from app.models.session import get_session

router = APIRouter()

@router.post("/voice/")
async def process_voice(session_id: str, text: str):
    session = get_session(session_id)
    history = session["history"]

    reply = ask_llm(text, history)

    history.append({"role": "user", "content": text})
    history.append({"role": "assistant", "content": reply})

    return {
        "user_text": text,
        "bot_text": reply
    }
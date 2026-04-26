from fastapi import APIRouter
from app.services.intent import detect_intent
from app.services.transfer_flow import TransferFlow

router = APIRouter()

sessions = {}

@router.post("/process-text/")
def process_text(session_id: str, text: str):
    intent = detect_intent(text)

    if session_id not in sessions:
        sessions[session_id] = {
            "flow": None,
            "balance": 50000
        }

    if intent == "balance":
        return {"response": f"Your balance is ₹{sessions[session_id]['balance']}"}

    if intent == "transfer":
        sessions[session_id]["flow"] = TransferFlow(sessions[session_id]["balance"])
        return {"response": "Enter beneficiary name"}

    flow = sessions[session_id]["flow"]

    if flow:
        reply = flow.next(text)

        if flow.state == "done":
            sessions[session_id]["balance"] = flow.balance
            sessions[session_id]["flow"] = None

        if flow.state == "cancelled":
            sessions[session_id]["flow"] = None

        return {"response": reply}

    return {"response": "Sorry, I didn’t understand that. Please repeat."}
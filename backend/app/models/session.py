sessions = {}

def get_session(session_id):
    if session_id not in sessions:
        sessions[session_id] = {
            "history": [],
            "flow": None
        }
    return sessions[session_id]
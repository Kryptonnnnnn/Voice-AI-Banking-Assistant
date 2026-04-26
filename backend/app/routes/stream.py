from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import time

router = APIRouter()

def fake_stream(text):
    for word in text.split():
        yield word + " "
        time.sleep(0.1)

@router.get("/stream/")
def stream_response(text: str):
    return StreamingResponse(fake_stream(text), media_type="text/plain")
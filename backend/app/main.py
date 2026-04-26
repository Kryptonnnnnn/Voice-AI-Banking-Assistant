from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import voice, banking, cheque, kyc
from app.routes import stream


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # allow all (for dev)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(voice.router)
app.include_router(banking.router)
app.include_router(cheque.router)
app.include_router(kyc.router)
app.include_router(stream.router)

@app.get("/")
def root():
    return {"message": "Voice AI Banking Assistant Running"}
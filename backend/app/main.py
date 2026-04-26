from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    try:
        from app.routes import voice, banking, cheque, kyc
        app.include_router(voice.router)
        app.include_router(banking.router)
        app.include_router(cheque.router)
        app.include_router(kyc.router)
    except Exception as e:
        print("STARTUP ERROR:", str(e))
        raise e

@app.get("/")
def root():
    return {"message": "Voice AI Banking Assistant Running"}
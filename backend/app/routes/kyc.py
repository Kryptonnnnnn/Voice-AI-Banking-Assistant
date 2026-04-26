from fastapi import APIRouter

router = APIRouter()

@router.get("/start-kyc/")
def start_kyc():
    return {"message": "Recording started... KYC completed successfully"}
from fastapi import APIRouter, UploadFile, File
import cv2
import numpy as np

router = APIRouter()


def is_cheque(image: np.ndarray) -> tuple[bool, str]:
    """
    Multi-stage cheque validation.
    Returns (is_valid, reason).

    A bank cheque typically:
      - Has a landscape aspect ratio between 2.2 and 4.5 (width / height)
      - Is reasonably large (not a tiny thumbnail)
      - Has a dominant white/light background (paper)
      - Contains horizontal line structures (printed lines for signature, date, etc.)
      - Has text-like high-frequency regions (printed characters)
    """

    h, w = image.shape[:2]

    if w < 300 or h < 100:
        return False, "Image is too small to be a cheque"

    ratio = w / float(h)
    if not (2.2 < ratio < 4.5):
        return False, f"Aspect ratio {ratio:.2f} is not typical for a cheque (expected 2.2–4.5)"

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    mean_brightness = np.mean(gray)

    if mean_brightness < 100:
        return False, "Image is too dark to be a cheque (expected light paper background)"

    light_pixels = np.sum(gray > 160)
    light_ratio  = light_pixels / (w * h)
    if light_ratio < 0.40:
        return False, f"Only {light_ratio:.0%} light pixels — cheques have mostly white backgrounds"

    blur   = cv2.GaussianBlur(gray, (5, 5), 0)
    binary = cv2.adaptiveThreshold(
        blur, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, 15, 10
    )

    h_kernel_len = max(30, w // 8)
    h_kernel     = cv2.getStructuringElement(cv2.MORPH_RECT, (h_kernel_len, 1))
    h_lines      = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)
    h_line_px    = np.sum(h_lines > 0)


    if h_line_px < (w * 2):
        return False, "No significant horizontal lines found — cheques have printed line patterns"

    edges      = cv2.Canny(blur, 40, 120)
    edge_ratio = np.sum(edges > 0) / (w * h)
   
    if edge_ratio < 0.015:
        return False, "Too little detail — cheques contain printed text and graphics"
    if edge_ratio > 0.35:
        return False, "Too much visual complexity — does not look like a printed cheque"

    return True, "Valid cheque"


@router.post("/upload-cheque/")
async def upload_cheque(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        return {"message": "Invalid file type. Please upload a JPG or PNG image of the cheque."}

    contents = await file.read()
    np_arr   = np.frombuffer(contents, np.uint8)
    img      = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    if img is None:
        return {"message": "Could not read the image. Please upload a clear JPG or PNG file."}

    valid, reason = is_cheque(img)

    if valid:
        return {"message": "Valid cheque detected. You can proceed with the transaction."}

    return {"message": f"Invalid cheque image. {reason}. Please upload a clear photo of a bank cheque."}
def detect_intent(text):
    text = text.lower()

    if "balance" in text:
        return "balance"
    elif "transfer" in text:
        return "transfer"
    elif "kyc" in text:
        return "kyc"
    elif "cheque" in text:
        return "cheque"
    else:
        return "unknown"
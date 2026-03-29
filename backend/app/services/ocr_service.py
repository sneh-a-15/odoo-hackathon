"""
OCR Service for Receipt Processing
───────────────────────────────────
Extracts structured data from receipt images using pytesseract.
Falls back to regex-based extraction if Tesseract binary isn't installed.

Extracted fields:
  - amount: total amount from the receipt
  - currency: detected currency symbol/code
  - date: date found on receipt
  - vendor: merchant/vendor name (first line heuristic)
  - items: line items with amounts
"""

import re
import io
from datetime import datetime
from PIL import Image

# Try to import pytesseract; will gracefully handle if Tesseract binary is missing
try:
    import pytesseract
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False


# ─── Currency symbol → code mapping ──────────────────────────────────────────

CURRENCY_SYMBOLS = {
    "$": "USD", "€": "EUR", "£": "GBP", "₹": "INR", "¥": "JPY",
    "₩": "KRW", "₽": "RUB", "₿": "BTC", "C$": "CAD", "A$": "AUD",
    "S$": "SGD", "AED": "AED", "CHF": "CHF",
}


# ─── Regex patterns ──────────────────────────────────────────────────────────

# Amounts: $100.00, ₹500, 1,234.56, etc.
AMOUNT_PATTERN = re.compile(
    r'(?:(?:TOTAL|AMOUNT|DUE|GRAND\s*TOTAL|SUBTOTAL|NET|BALANCE)[:\s]*)'
    r'[₹$€£¥]?\s*'
    r'(\d{1,3}(?:[,]\d{3})*(?:\.\d{1,2})?)',
    re.IGNORECASE
)

# Fallback: any currency-prefixed number
CURRENCY_AMOUNT_PATTERN = re.compile(
    r'([₹$€£¥])\s*(\d{1,3}(?:[,]\d{3})*(?:\.\d{1,2})?)'
)

# Dates: various formats
DATE_PATTERNS = [
    re.compile(r'(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})'),           # DD/MM/YYYY or MM-DD-YYYY
    re.compile(r'(\d{4}[/-]\d{1,2}[/-]\d{1,2})'),             # YYYY-MM-DD
    re.compile(r'(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{2,4})', re.IGNORECASE),  # 15 March 2026
    re.compile(r'(?:Date)[:\s]*(\S+)', re.IGNORECASE),          # Date: <value>
]

# Category keywords for auto-detection
CATEGORY_KEYWORDS = {
    "travel": ["flight", "airline", "airport", "taxi", "uber", "lyft", "train", "bus", "fuel", "gas", "petrol"],
    "meals": ["restaurant", "cafe", "coffee", "food", "dining", "lunch", "dinner", "breakfast", "pizza", "burger", "starbucks", "mcdonald"],
    "accommodation": ["hotel", "inn", "resort", "airbnb", "hostel", "lodging", "stay", "room", "suite"],
    "equipment": ["electronics", "computer", "laptop", "phone", "printer", "software", "amazon", "best buy", "office"],
    "other": [],
}


def extract_text_from_image(image_bytes: bytes) -> str:
    """Extract text from image bytes using pytesseract or return empty string."""
    try:
        img = Image.open(io.BytesIO(image_bytes))
        # Convert to RGB if needed (handles RGBA, palette, etc.)
        if img.mode != "RGB":
            img = img.convert("RGB")

        if TESSERACT_AVAILABLE:
            try:
                text = pytesseract.image_to_string(img, config="--psm 6")
                return text.strip()
            except Exception:
                # Tesseract binary not found or other error
                return ""
        return ""
    except Exception:
        return ""


def parse_receipt_text(raw_text: str) -> dict:
    """
    Parse raw OCR text to extract structured receipt fields.
    Uses regex patterns to find amounts, dates, vendor info, and line items.
    """
    lines = [line.strip() for line in raw_text.split("\n") if line.strip()]

    result = {
        "amount": None,
        "currency": None,
        "date": None,
        "vendor": None,
        "category": None,
        "line_items": [],
        "confidence": "low",
    }

    if not lines:
        return result

    # ── Extract vendor (first non-trivial line, heuristic) ────────────────
    for line in lines[:5]:
        # Skip lines that are just numbers or dates
        if re.match(r'^[\d\s/\-.:]+$', line):
            continue
        if len(line) > 2:
            result["vendor"] = line
            break

    # ── Extract amounts ───────────────────────────────────────────────────
    all_amounts = []

    # Look for labeled amounts first (TOTAL, AMOUNT DUE, etc.)
    for match in AMOUNT_PATTERN.finditer(raw_text):
        amount_str = match.group(1).replace(",", "")
        try:
            all_amounts.append(float(amount_str))
        except ValueError:
            pass

    # Look for currency-prefixed amounts
    for match in CURRENCY_AMOUNT_PATTERN.finditer(raw_text):
        symbol = match.group(1)
        amount_str = match.group(2).replace(",", "")
        try:
            amount = float(amount_str)
            all_amounts.append(amount)
            if not result["currency"]:
                result["currency"] = CURRENCY_SYMBOLS.get(symbol, "USD")
        except ValueError:
            pass

    # Take the largest amount as the total (receipts usually have total as largest)
    if all_amounts:
        result["amount"] = max(all_amounts)
        result["confidence"] = "medium" if len(all_amounts) > 1 else "low"

    # ── Extract date ──────────────────────────────────────────────────────
    for pattern in DATE_PATTERNS:
        match = pattern.search(raw_text)
        if match:
            result["date"] = match.group(1)
            break

    # ── Extract line items (lines with amounts) ───────────────────────────
    item_pattern = re.compile(r'(.+?)\s+[₹$€£¥]?\s*(\d{1,3}(?:[,]\d{3})*(?:\.\d{1,2}))\s*$')
    for line in lines:
        match = item_pattern.match(line)
        if match:
            desc = match.group(1).strip()
            amt = match.group(2).replace(",", "")
            try:
                result["line_items"].append({
                    "description": desc,
                    "amount": float(amt),
                })
            except ValueError:
                pass

    # ── Auto-detect category ──────────────────────────────────────────────
    text_lower = raw_text.lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in text_lower for kw in keywords):
            result["category"] = category
            break

    # ── Set confidence ────────────────────────────────────────────────────
    filled = sum(1 for v in [result["amount"], result["date"], result["vendor"]] if v)
    if filled >= 3:
        result["confidence"] = "high"
    elif filled >= 2:
        result["confidence"] = "medium"

    return result


def process_receipt(image_bytes: bytes, filename: str = "") -> dict:
    """
    Full OCR pipeline: extract text → parse fields → return structured result.
    """
    raw_text = extract_text_from_image(image_bytes)

    parsed = parse_receipt_text(raw_text)

    return {
        "raw_text": raw_text,
        "parsed_fields": parsed,
        "filename": filename,
        "ocr_engine": "pytesseract" if TESSERACT_AVAILABLE else "none",
        "has_text": bool(raw_text.strip()),
    }

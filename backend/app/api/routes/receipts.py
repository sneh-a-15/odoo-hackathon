"""
Receipt OCR Endpoint
────────────────────
POST /api/v1/receipts/ocr — accept an image, run OCR, return structured fields.
Optionally links to an expense and stores the result.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from uuid import UUID
from typing import Optional

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.models import Receipt, Expense, User
from app.services.ocr_service import process_receipt

router = APIRouter(prefix="/receipts", tags=["receipts"])

# Max file size: 10 MB
MAX_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/tiff", "image/bmp"}


@router.post("/ocr")
async def ocr_receipt(
    file: UploadFile = File(...),
    expense_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a receipt image for OCR processing.

    1. Validates file type and size.
    2. Runs OCR via pytesseract → regex parser.
    3. Returns structured fields (amount, currency, date, vendor, category).
    4. If expense_id is provided, stores the result in the receipts table.
    """

    # ── Validate file type ────────────────────────────────────────────────
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type '{file.content_type}'. Allowed: {', '.join(ALLOWED_TYPES)}",
        )

    # ── Read and validate size ────────────────────────────────────────────
    image_bytes = await file.read()

    if len(image_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=422,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)} MB.",
        )

    if len(image_bytes) == 0:
        raise HTTPException(status_code=422, detail="Empty file uploaded.")

    # ── Run OCR ───────────────────────────────────────────────────────────
    result = process_receipt(image_bytes, filename=file.filename or "receipt")

    # ── Store in DB if expense_id provided ────────────────────────────────
    receipt_id = None
    if expense_id:
        try:
            exp_uuid = UUID(expense_id)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid expense_id format")

        expense = (
            db.query(Expense)
            .filter(
                Expense.id == exp_uuid,
                Expense.company_id == current_user.company_id,
                Expense.deleted_at.is_(None),
            )
            .first()
        )
        if not expense:
            raise HTTPException(status_code=404, detail="Expense not found")

        # Check if receipt already exists for this expense
        existing = db.query(Receipt).filter(Receipt.expense_id == exp_uuid).first()

        if existing:
            # Update existing receipt
            existing.ocr_raw = {
                "raw_text": result["raw_text"],
                "engine": result["ocr_engine"],
            }
            existing.ocr_parsed = result["parsed_fields"]
            existing.ocr_status = "done" if result["has_text"] else "failed"
            receipt_id = str(existing.id)
        else:
            # Create new receipt
            receipt = Receipt(
                expense_id=exp_uuid,
                file_url=file.filename or "uploaded_receipt",
                ocr_raw={
                    "raw_text": result["raw_text"],
                    "engine": result["ocr_engine"],
                },
                ocr_parsed=result["parsed_fields"],
                ocr_status="done" if result["has_text"] else "failed",
            )
            db.add(receipt)
            db.flush()
            receipt_id = str(receipt.id)

        db.commit()

    # ── Return response ───────────────────────────────────────────────────
    return {
        "success": True,
        "receipt_id": receipt_id,
        "filename": result["filename"],
        "ocr_engine": result["ocr_engine"],
        "has_text": result["has_text"],
        "raw_text": result["raw_text"],
        "parsed_fields": result["parsed_fields"],
    }

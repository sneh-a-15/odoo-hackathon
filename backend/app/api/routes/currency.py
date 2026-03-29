from fastapi import APIRouter, Depends, Query
from app.services.currency_service import convert_amount, get_currency_for_country
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/currencies", tags=["currencies"])

@router.get("/convert")
async def convert(
    from_currency: str = Query(..., alias="from"),
    to_currency: str = Query(..., alias="to"),
    amount: float = Query(...),
    current_user=Depends(get_current_user)
):
    return await convert_amount(amount, from_currency.upper(), to_currency.upper())

@router.get("/countries")
async def countries(current_user=Depends(get_current_user)):
    import httpx
    async with httpx.AsyncClient() as client:
        r = await client.get("https://restcountries.com/v3.1/all?fields=name,currencies,cca2")
        data = r.json()
    return [
        {
            "name": c["name"]["common"],
            "currency_code": list(c["currencies"].keys())[0] if c.get("currencies") else None,
            "currency_name": list(c["currencies"].values())[0]["name"] if c.get("currencies") else None,
            "country_code": c.get("cca2"),
        }
        for c in data if c.get("currencies")
    ]
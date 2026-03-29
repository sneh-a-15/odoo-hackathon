import httpx
from functools import lru_cache

COUNTRIES_URL = "https://restcountries.com/v3.1/all?fields=name,currencies,cca2"
EXCHANGE_URL = "https://api.exchangerate-api.com/v4/latest/{base}"

@lru_cache(maxsize=1)
def get_countries_cache():
    return {}

async def get_currency_for_country(country_code: str) -> str:
    async with httpx.AsyncClient() as client:
        r = await client.get(COUNTRIES_URL)
        countries = r.json()
        for c in countries:
            if c.get("cca2") == country_code.upper():
                currencies = c.get("currencies", {})
                if currencies:
                    return list(currencies.keys())[0]
    return "USD"

async def convert_amount(amount: float, from_currency: str, to_currency: str) -> dict:
    if from_currency == to_currency:
        return {
            "original_amount": amount,
            "converted_amount": amount,
            "rate": 1.0,
            "from": from_currency,
            "to": to_currency,
        }

    async with httpx.AsyncClient() as client:
        r = await client.get(EXCHANGE_URL.format(base=from_currency))
        data = r.json()

    rate = data["rates"].get(to_currency)
    if not rate:
        raise ValueError(f"Cannot convert {from_currency} to {to_currency}")

    return {
        "original_amount": amount,
        "converted_amount": round(amount * rate, 2),
        "rate": rate,
        "from": from_currency,
        "to": to_currency,
    }
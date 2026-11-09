#!/usr/bin/env python3
"""Cycle Terminal public-data collector.

Writes only source-validated dated observations. No extrapolation, synthetic rows,
or invented timestamps. Failed providers leave the previous published file intact.
"""
import datetime as dt
import json
import math
import os
import pathlib
import urllib.parse
import urllib.request
import urllib.error

ROOT = pathlib.Path(__file__).resolve().parents[1] / "docs" / "data"
ROOT.mkdir(parents=True, exist_ok=True)
HEADERS = {"User-Agent": "CycleTerminalResearch/9.4 (+public market data)", "Accept": "application/json"}
TODAY = dt.datetime.now(dt.timezone.utc).date()

def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=22) as response:
        if response.status != 200:
            raise RuntimeError("Upstream HTTP " + str(response.status))
        return json.load(response)

def numeric(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None

def iso_date(value):
    if not isinstance(value, str):
        return None
    value = value[:10]
    try:
        stamp = dt.date.fromisoformat(value)
        if dt.date(2018, 1, 1) <= stamp <= TODAY:
            return stamp.isoformat()
    except ValueError:
        pass
    return None

def load_existing(file):
    if not file.exists():
        return []
    try:
        raw = json.loads(file.read_text(encoding="utf-8"))
        return raw.get("rows", []) if isinstance(raw.get("rows"), list) else []
    except (ValueError, OSError, AttributeError):
        return []

def write_verified(file, source, rows, field, limit=4000, extra=None):
    # Never merge observations from different exchanges into a single series.
    previous = load_existing(file)
    if file.exists():
        try:
            prior = json.loads(file.read_text(encoding="utf-8"))
            if prior.get("source") != source:
                previous = []
        except (ValueError, OSError, AttributeError):
            previous = []
    merged = {}
    for item in previous + rows:
        if not isinstance(item, dict):
            continue
        date = iso_date(item.get("date"))
        value = numeric(item.get(field))
        if date and value is not None:
            merged[date] = {"date": date, field: round(value, 8)}
    data = [merged[date] for date in sorted(merged)][-limit:]
    if not data:
        raise ValueError("No valid dated observations")
    newest = data[-1]["date"]
    current = {"status": "ok", "source": source, "asOf": newest, "rows": data}
    if extra:
        current.update(extra)
    if file.exists():
        try:
            if json.loads(file.read_text(encoding="utf-8")) == current:
                print("Unchanged:", file.name, newest)
                return
        except ValueError:
            pass
    file.write_text(json.dumps(current, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print("Updated:", file.name, len(data), "last:", newest)

def nested_rows(payload):
    """Only accept a recognizable array of dated row objects; never infer totals."""
    if isinstance(payload, list):
        if payload and isinstance(payload[0], dict):
            return payload
        return []
    if isinstance(payload, dict):
        for key in ("rows", "daily", "days", "sessions", "dailyFlows", "dailyData", "records", "data", "history", "flows"):
            if key in payload:
                found = nested_rows(payload[key])
                if found:
                    return found
    return []

def collect_etf():
    url = "https://www.tftc.io/bitcoin-etf-flows/data.json"
    payload = fetch_json(url)
    records = nested_rows(payload)
    if not records:
        raise ValueError("TFTC JSON has no recognized dated rows; schema requires review")
    parsed = []
    for item in records:
        if not isinstance(item, dict):
            continue
        date = next((iso_date(item.get(k)) for k in ("date", "sessionDate", "tradingDate", "day") if iso_date(item.get(k))), None)
        flow_usd = next((numeric(item.get(k)) for k in ("netFlowUsd", "totalNetFlowUsd") if numeric(item.get(k)) is not None), None)
        if date is None or flow_usd is None or abs(flow_usd) > 30_000_000_000:
            continue
        parsed.append({"date": date, "netMillionUsd": flow_usd / 1_000_000})
    if len(parsed) < 30:
        raise ValueError("ETF JSON schema mismatch / fewer than 30 verified session totals")
    write_verified(ROOT / "etf-flows.json", "The Commoner Bitcoin ETF Tracker by TFTC (CC BY 4.0), https://www.tftc.io/bitcoin-etf-flows", parsed, "netMillionUsd", limit=1200,
                   extra={"license": "CC BY 4.0", "url": "https://www.tftc.io/bitcoin-etf-flows", "unit": "USD million"})


def bybit_rows(endpoint, params):
    """Public Bybit V5 endpoint. Validate success envelope and exact product."""
    query = urllib.parse.urlencode(params)
    payload = fetch_json("https://api.bybit.com/v5/market/" + endpoint + "?" + query)
    if not isinstance(payload, dict) or payload.get("retCode") != 0:
        raise ValueError("Bybit API returned nonzero retCode")
    result = payload.get("result")
    if not isinstance(result, dict) or result.get("category") != "linear":
        raise ValueError("Unexpected Bybit product category")
    rows = result.get("list")
    if not isinstance(rows, list):
        raise ValueError("Invalid Bybit market history")
    return rows

def collect_funding():
    source = "Binance USD-M BTCUSDT funding settlements (daily mean, % per settlement)"
    try:
        funding = fetch_json("https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1000")
        if not isinstance(funding, list):
            raise ValueError("Binance funding response is not a list")
        records = [(r.get("fundingTime"), r.get("fundingRate")) for r in funding
                   if isinstance(r, dict) and r.get("symbol") == "BTCUSDT"]
    except urllib.error.HTTPError as exc:
        if exc.code != 451:
            raise
        print("Binance funding blocked (HTTP 451); requesting Bybit history", flush=True)
        funding = bybit_rows("funding/history", {"category":"linear","symbol":"BTCUSDT","limit":200})
        records = [(r.get("fundingRateTimestamp"),r.get("fundingRate")) for r in funding
                   if isinstance(r,dict) and r.get("symbol")=="BTCUSDT"]
        source = "Bybit linear BTCUSDT funding settlements (daily mean, % per settlement)"
    daily = {}
    for stamp_raw, rate_raw in records:
        stamp, value = numeric(stamp_raw), numeric(rate_raw)
        if stamp is None or value is None or abs(value) > .2:
            continue
        day = dt.datetime.fromtimestamp(stamp / 1000, tz=dt.timezone.utc).date().isoformat()
        if iso_date(day):
            daily.setdefault(day, []).append(value * 100)
    series = [{"date": day, "fundingPct": sum(vals)/len(vals)} for day, vals in daily.items()]
    if len(series) < 5:
        raise ValueError("Funding history has insufficient verified dates")
    write_verified(ROOT / "funding-history.json", source, series, "fundingPct", limit=900,
                   extra={"unit":"percent per settlement","product":"BTCUSDT linear perpetual"})

def collect_oi():
    source = "Binance USD-M BTCUSDT daily open interest (BTC)"
    try:
        oi_data = fetch_json("https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1d&limit=60")
        if not isinstance(oi_data, list):
            raise ValueError("Binance open-interest response is not a list")
        records = [(r.get("timestamp"), r.get("sumOpenInterest")) for r in oi_data
                   if isinstance(r, dict) and r.get("symbol") == "BTCUSDT"]
    except urllib.error.HTTPError as exc:
        if exc.code != 451:
            raise
        print("Binance OI blocked (HTTP 451); requesting Bybit history", flush=True)
        oi_data = bybit_rows("open-interest", {"category":"linear","symbol":"BTCUSDT","intervalTime":"1d","limit":60})
        records = [(r.get("timestamp"), r.get("openInterest")) for r in oi_data if isinstance(r,dict)]
        source = "Bybit linear BTCUSDT daily open interest (BTC)"
    seen = []
    for stamp_raw, interest_raw in records:
        stamp, value = numeric(stamp_raw), numeric(interest_raw)
        if stamp is None or value is None or value <= 0:
            continue
        day = dt.datetime.fromtimestamp(stamp / 1000, tz=dt.timezone.utc).date().isoformat()
        if iso_date(day):
            seen.append({"date":day,"openInterestBtc":value})
    if len(seen) < 5:
        raise ValueError("Open-interest history has insufficient verified dates")
    write_verified(ROOT / "oi-history.json", source, seen, "openInterestBtc", limit=900,
                   extra={"unit":"BTC","product":"BTCUSDT linear perpetual"})

def main():
    for name, job in (("TFTC ETF flows", collect_etf), ("Binance funding rate", collect_funding), ("Binance open interest", collect_oi)):
        try:
            job()
        except Exception as exc:
            print("Provider unavailable:", name, str(exc)[:300], "— keeping prior published data")
    print("Market collector completed. Missing sources remain unavailable, not estimated.")

if __name__ == "__main__":
    main()

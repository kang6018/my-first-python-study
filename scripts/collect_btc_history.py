#!/usr/bin/env python3
"""V10 source-verified BTC historical daily-close collector.

Offline-safe: each upstream failure preserves the last valid persisted series.
Prefer daily observations to sampled points; combine with existing observations
only when the provider and measurement semantics are compatible.
"""
import datetime as dt
import json
import math
import pathlib
import time
import urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[1]/"docs"/"data"
FILE=ROOT/"btc-history.json"
TODAY=dt.datetime.now(dt.timezone.utc).date()
ROOT.mkdir(parents=True,exist_ok=True)
HEADERS={"Accept":"application/json","User-Agent":"CycleTerminalV10/1.0 research dataset"}

def fetch(url):
    req=urllib.request.Request(url,headers=HEADERS)
    with urllib.request.urlopen(req,timeout=25) as res:
        return json.load(res)

def valid(rows):
    out={}
    for row in rows:
        try:
            date=dt.date.fromisoformat(str(row["date"])[:10])
            value=float(row["price"])
            if dt.date(2010,7,1)<=date<=TODAY and math.isfinite(value) and value>0:
                out[date.isoformat()]={"date":date.isoformat(),"price":round(value,8)}
        except (KeyError,ValueError,TypeError,OverflowError):
            continue
    return [out[k] for k in sorted(out)]

def load_existing():
    if not FILE.exists():
        return []
    try:
        payload=json.loads(FILE.read_text(encoding="utf-8"))
        if payload.get("status")!="ok":return []
        return valid(payload.get("rows",[]))
    except (ValueError,OSError,TypeError):
        return []

def cryptocompare():
    to_ts=int(time.time())
    data=[]
    for _ in range(4):
        response=fetch("https://min-api.cryptocompare.com/data/v2/histoday?fsym=BTC&tsym=USD&limit=2000&toTs="+str(to_ts))
        candles=response.get("Data",{}).get("Data",[])
        if not isinstance(candles,list) or len(candles)<100:
            raise RuntimeError("CryptoCompare response contains insufficient daily candles")
        data=candles+data
        earliest=int(candles[0]["time"])
        if earliest < 1353283200:break
        to_ts=earliest-86400
    rows=[]
    for row in data:
        try:
            stamp=dt.datetime.fromtimestamp(int(row["time"]),tz=dt.timezone.utc).date().isoformat()
            rows.append({"date":stamp,"price":row["close"]})
        except (KeyError,ValueError,TypeError,OverflowError):
            continue
    return valid(rows),"CryptoCompare BTC/USD daily close"

def blockchain():
    response=fetch("https://api.blockchain.info/charts/market-price?timespan=all&format=json&sampled=false")
    series=response.get("values",[])
    if not isinstance(series,list):raise RuntimeError("Blockchain.com did not return observations")
    rows=[]
    for row in series:
        try:
            date=dt.datetime.fromtimestamp(int(row["x"]),tz=dt.timezone.utc).date().isoformat()
            rows.append({"date":date,"price":row["y"]})
        except (KeyError,ValueError,TypeError,OverflowError):
            continue
    return valid(rows),"Blockchain.com BTC/USD market-price (unsampled request; average market price, not exchange close)"

def main():
    original=load_existing()
    errors=[]
    for provider in (cryptocompare,blockchain):
        try:
            rows,source=provider()
            if len(rows)<350:raise ValueError("Fewer than 350 valid observations")
            gaps=[(dt.date.fromisoformat(rows[i]["date"])-dt.date.fromisoformat(rows[i-1]["date"])).days for i in range(1,len(rows))]
            recent_gaps=gaps[-min(90,len(gaps)):]
            daily_ratio=sum(g==1 for g in recent_gaps)/len(recent_gaps) if recent_gaps else 0
            if daily_ratio<0.85:
                raise RuntimeError("Provider returns sampled/non-daily observations (daily cadence ratio %.2f); rejecting as daily history"%daily_ratio)
            latest=rows[-1]["date"]
            if (TODAY-dt.date.fromisoformat(latest)).days>10:
                raise RuntimeError("Upstream's last observed date is stale: "+latest)
            # Do not merge unrelated prices/sampled index values from different providers.
            payload={"status":"ok","source":source,"asOf":latest,"frequency":"daily","dataQuality":"daily verified observations; not forward-filled","rows":rows}
            encoded=json.dumps(payload,ensure_ascii=False,separators=(",",":"))+"\n"
            if not FILE.exists() or FILE.read_text(encoding="utf-8")!=encoded:
                FILE.write_text(encoded,encoding="utf-8")
            print("BTC history verified:",len(rows),"observations",source,latest)
            return {"ok":True,"asOf":latest,"observations":len(rows),"source":source}
        except Exception as exc:
            errors.append(provider.__name__+": "+str(exc)[:180])
            print("BTC provider failed:",errors[-1])
    if original:
        print("Keeping existing BTC history:",len(original),"observations")
    else:
        print("No saved BTC history; browser fallback may still be available")
    return {"ok":False,"asOf":original[-1]["date"] if original else None,"observations":len(original),"errors":errors}

if __name__=="__main__":
    print(json.dumps(main(),ensure_ascii=False))

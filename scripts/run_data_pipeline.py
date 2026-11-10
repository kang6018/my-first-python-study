#!/usr/bin/env python3
"""Run independent V10 collectors and publish explicit per-source health.

This never turns API errors into successful fresh observations.
The static site can show the last saved observation and collection status.
"""
import datetime as dt
import json
import pathlib
import sys

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
import collect_market_data as market
import collect_btc_history as btc
import collect_fred as fred

ROOT=pathlib.Path(__file__).resolve().parents[1]/"docs"/"data"
ROOT.mkdir(parents=True,exist_ok=True)
NOW=dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
JOBS=(
    ("btcHistory",lambda:btc.main(),"btc-history.json"),
    ("etfFlows",market.collect_etf,"etf-flows.json"),
    *[( "fred"+code,lambda code=code:fred.collect_one(code),"fred-"+code.lower()+".json") for code in fred.SERIES],
)
result={}
for name,work,filename in JOBS:
    success=False
    error=None
    try:
        returned=work()
        success=returned.get("ok",True) if isinstance(returned,dict) else True
        if not success:
            error="No upstream source succeeded; previous verified data retained"
    except Exception as exc:
        error=str(exc)[:240]
        print("COLLECT ERROR",name,error,flush=True)
    file=ROOT/filename
    saved=None
    if file.exists():
        try:
            payload=json.loads(file.read_text(encoding="utf-8"))
            rows=payload.get("rows")
            if payload.get("status")=="ok" and isinstance(rows,list) and rows:
                saved={"asOf":payload.get("asOf"),"observations":len(rows),"source":payload.get("source")}
        except (OSError,ValueError,TypeError,AttributeError):
            pass
    result[name]={
        "lastAttemptAt":NOW,
        "lastAttemptSucceeded":bool(success),
        "lastSavedObservation":saved["asOf"] if saved else None,
        "observations":saved["observations"] if saved else 0,
        "source":saved["source"] if saved else None,
        "error":error,
    }
    print("COLLECT STATUS",name,"OK" if success else "FAILED","saved",result[name]["lastSavedObservation"],flush=True)
out={"version":"12.2","generatedAt":NOW,"sources":result}
file=ROOT/"collection-status.json"
file.write_text(json.dumps(out,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
print("Collection status written:",file)

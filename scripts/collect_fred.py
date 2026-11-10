#!/usr/bin/env python3
"""Validate and persist public FRED economic series as static dated observations.

FRED graph CSV is fetched during the GitHub Actions build, not from the browser.
No fabricated missing dates or cross-series interpolation.
"""
import csv
import datetime as dt
import io
import json
import math
import pathlib
import urllib.parse
import urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[1]/"docs"/"data"
ROOT.mkdir(parents=True,exist_ok=True)
TODAY=dt.datetime.now(dt.timezone.utc).date()
SERIES={
    "DGS10":("Daily","percent","U.S. Treasury 10-year nominal constant-maturity rate","Board of Governors of the Federal Reserve System (H.15) via FRED"),
    "DFII10":("Daily","percent","U.S. Treasury 10-year inflation-indexed constant-maturity real yield","Board of Governors of the Federal Reserve System (H.15) via FRED"),
    "M2SL":("Monthly","USD billions","U.S. M2 money stock, seasonally adjusted","Board of Governors of the Federal Reserve System (H.6) via FRED"),
    "WALCL":("Weekly","USD millions","Total assets of Federal Reserve Banks","Board of Governors of the Federal Reserve System (H.4.1) via FRED"),
}
HEADERS={"User-Agent":"CycleTerminalResearch/12.2 (FRED source-data validation)","Accept":"text/csv"}

def collect_one(series):
    frequency,unit,description,source=SERIES[series]
    target=ROOT/("fred-"+series.lower()+".json")
    url="https://fred.stlouisfed.org/graph/fredgraph.csv?"+urllib.parse.urlencode({"id":series,"cosd":"2018-01-01"})
    req=urllib.request.Request(url,headers=HEADERS)
    with urllib.request.urlopen(req,timeout=25) as response:
        if response.status!=200:
            raise RuntimeError("Upstream FRED HTTP "+str(response.status))
        raw=response.read(3000000).decode("utf-8-sig")
    reader=csv.DictReader(io.StringIO(raw))
    if not reader.fieldnames or series not in reader.fieldnames:
        raise ValueError("FRED CSV header mismatch for "+series)
    data={}
    for row in reader:
        try:
            day=dt.date.fromisoformat(row.get("DATE",row.get("observation_date",""))[:10])
            value=float(row[series])
            if not dt.date(2018,1,1)<=day<=TODAY or not math.isfinite(value):
                continue
            if series in ("DGS10","DFII10") and not (-5 < value < 25):
                continue
            if series in ("M2SL","WALCL") and value<=0:
                continue
            data[day.isoformat()]={"date":day.isoformat(),"value":round(value,6)}
        except (ValueError,TypeError,KeyError,OverflowError):
            continue
    rows=[data[k] for k in sorted(data)]
    floor=20 if frequency!="Daily" else 200
    if len(rows)<floor:
        raise ValueError("Insufficient authenticated FRED observations for "+series)
    last=dt.date.fromisoformat(rows[-1]["date"])
    max_age={"Daily":12,"Weekly":24,"Monthly":75}[frequency]
    if (TODAY-last).days>max_age:
        raise ValueError("Stale FRED "+series+" observations: "+str(last))
    payload={"status":"ok","id":series,"source":source,"provider":"FRED (Federal Reserve Bank of St. Louis)","sourceUrl":"https://fred.stlouisfed.org/series/"+series,"asOf":rows[-1]["date"],"frequency":frequency.lower(),"unit":unit,"description":description,"rows":rows}
    encoded=json.dumps(payload,ensure_ascii=False,separators=(",",":"))+"\n"
    if not target.exists() or target.read_text(encoding="utf-8")!=encoded:
        target.write_text(encoded,encoding="utf-8")
    print("FRED verified:",series,len(rows),"observations; last",rows[-1]["date"])
    return {"ok":True,"asOf":rows[-1]["date"],"observations":len(rows),"source":source}

def main():
    status={}
    for series in SERIES:
        try:
            status[series]=collect_one(series)
        except Exception as exc:
            status[series]={"ok":False,"error":str(exc)[:200]}
            print("FRED source unavailable:",series,str(exc)[:200],"— previous observations retained")
    return status

if __name__=="__main__":
    print(json.dumps(main(),ensure_ascii=False))

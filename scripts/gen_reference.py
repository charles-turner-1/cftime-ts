#!/usr/bin/env python3
"""Generate a JSON reference fixture from the real Python cftime library.

The TypeScript test suite loads test/fixtures/reference.json and asserts the port
reproduces these values exactly. Run with the venv that has cftime installed:

    ../.venv-cftime/bin/python scripts/gen_reference.py
"""
import json
import os
import warnings
from datetime import timedelta

import cftime
import numpy as np

warnings.simplefilter("ignore")  # ignore CFWarning noise for out-of-CF dates


def _json_default(o):
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.floating):
        return float(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    raise TypeError(f"Object of type {o.__class__.__name__} is not JSON serializable")

REAL_CALENDARS = ["standard", "proleptic_gregorian", "julian"]
IDEALIZED = ["noleap", "all_leap", "360_day"]
ALL_CALENDARS = [
    "standard",
    "gregorian",
    "proleptic_gregorian",
    "julian",
    "noleap",
    "365_day",
    "all_leap",
    "366_day",
    "360_day",
]

OUT = {}


def safe(fn):
    try:
        return fn()
    except Exception as e:  # noqa: BLE001
        return {"__error__": type(e).__name__}


# --- is_leap_year -----------------------------------------------------------
leap = []
for cal in ALL_CALENDARS:
    for year in [-5, -4, -1, 0, 1, 4, 100, 400, 1500, 1582, 1600, 1700, 1900, 2000, 2001, 2004]:
        try:
            val = cftime.is_leap_year(year, cal)
        except Exception as e:  # noqa: BLE001
            val = {"__error__": type(e).__name__}
        leap.append({"year": year, "calendar": cal, "leap": val})
OUT["is_leap_year"] = leap


# --- toordinal (integer Julian day) ----------------------------------------
ordinals = []
dates = [
    (1, 1, 1), (1582, 10, 4), (1582, 10, 15), (1858, 11, 17), (1970, 1, 1),
    (2000, 1, 1), (2000, 2, 29), (2000, 3, 1), (-1, 1, 1), (-4713, 1, 1),
    (2020, 12, 31), (100, 3, 1), (0, 1, 1),
]
for cal in ["standard", "proleptic_gregorian", "julian", "noleap", "all_leap", "360_day"]:
    for (y, m, d) in dates:
        def make(y=y, m=m, d=d, cal=cal):
            return cftime.datetime(y, m, d, calendar=cal).toordinal()
        val = safe(make)
        def makef(y=y, m=m, d=d, cal=cal):
            return cftime.datetime(y, m, d, calendar=cal).toordinal(fractional=True)
        valf = safe(makef)
        ordinals.append({"year": y, "month": m, "day": d, "calendar": cal,
                         "toordinal": val, "toordinal_fractional": valf})
OUT["toordinal"] = ordinals


# --- properties: dayofwk, dayofyr, daysinmonth ------------------------------
props = []
for cal in ["standard", "proleptic_gregorian", "julian", "noleap", "all_leap", "360_day"]:
    for (y, m, d) in [(2000, 1, 1), (2020, 3, 15), (1, 1, 1), (2021, 12, 31), (2000, 2, 28)]:
        def make(y=y, m=m, d=d, cal=cal):
            dt = cftime.datetime(y, m, d, calendar=cal)
            return {"dayofwk": dt.dayofwk, "dayofyr": dt.dayofyr, "daysinmonth": dt.daysinmonth}
        props.append({"year": y, "month": m, "day": d, "calendar": cal, "props": safe(make)})
OUT["properties"] = props


# --- isoformat / strftime / repr --------------------------------------------
fmt = []
cases = [
    (2000, 1, 1, 12, 30, 45, 123456, "standard"),
    (-4713, 1, 1, 12, 0, 0, 10, "julian"),
    (-713, 1, 1, 0, 0, 0, 0, "julian"),
    (1, 1, 1, 0, 0, 0, 0, "proleptic_gregorian"),
    (2020, 2, 30, 0, 0, 0, 0, "360_day"),
    (2000, 6, 15, 6, 0, 0, 0, "noleap"),
]
for (y, m, d, H, M, S, us, cal) in cases:
    def make(y=y, m=m, d=d, H=H, M=M, S=S, us=us, cal=cal):
        dt = cftime.datetime(y, m, d, H, M, S, us, calendar=cal)
        return {
            "isoformat_default": dt.isoformat(),
            "isoformat_space": dt.isoformat(" "),
            "isoformat_seconds": dt.isoformat(" ", "seconds"),
            "isoformat_days": dt.isoformat(" ", "days"),
            "isoformat_hours": dt.isoformat("T", "hours"),
            "isoformat_minutes": dt.isoformat("T", "minutes"),
            "isoformat_milliseconds": dt.isoformat("T", "milliseconds"),
            "str": str(dt),
            "strftime_default": dt.strftime(),
            "strftime_ymd": dt.strftime("%Y-%m-%d"),
        }
    fmt.append({"args": [y, m, d, H, M, S, us, cal], "out": safe(make)})
OUT["formatting"] = fmt


# --- date2num / num2date roundtrips -----------------------------------------
conv = []
unit_cases = [
    ("days since 2000-01-01", "standard"),
    ("hours since 0001-01-01", "standard"),
    ("seconds since 1970-01-01 00:00:00", "proleptic_gregorian"),
    ("days since 1600-02-28", "noleap"),
    ("days since 2000-01-01", "360_day"),
    ("months since 0000-01-01", "360_day"),
    ("common_years since 0001-01-01", "noleap"),
    ("microseconds since 2000-01-01", "standard"),
    ("hours since 2000-01-01 00:00:00 -06:00", "standard"),
    ("seconds since 2018-01-23 09:31:42.94", "standard"),
]
for (units, cal) in unit_cases:
    for val in [0, 1, 2, 10, 100, 1000, -1, -100, 0.5, 1.25, 365, 366]:
        def make(val=val, units=units, cal=cal):
            dt = cftime.num2date(val, units, calendar=cal)
            back = cftime.date2num(dt, units, calendar=cal)
            return {
                "iso": dt.isoformat(" "),
                "y": dt.year, "mo": dt.month, "d": dt.day,
                "H": dt.hour, "M": dt.minute, "S": dt.second, "us": dt.microsecond,
                "date2num": back,
            }
        conv.append({"units": units, "calendar": cal, "value": val, "out": safe(make)})
OUT["convert"] = conv


# --- date2num from explicit dates -------------------------------------------
d2n = []
d2n_cases = [
    (2000, 1, 2, 0, 0, 0, 0, "days since 2000-01-01", "standard"),
    (1582, 10, 15, 0, 0, 0, 0, "hours since 0001-01-01", "standard"),
    (2000, 2, 28, 0, 0, 0, 0, "days since 1600-02-28", "noleap"),
    (2001, 12, 30, 0, 0, 0, 0, "days since 0000-01-01", "360_day"),
    (2018, 1, 23, 9, 27, 10, 950000, "seconds since 2018-01-23 09:31:42.94", "standard"),
]
for (y, m, d, H, M, S, us, units, cal) in d2n_cases:
    def make(y=y, m=m, d=d, H=H, M=M, S=S, us=us, units=units, cal=cal):
        dt = cftime.datetime(y, m, d, H, M, S, us, calendar=cal)
        return cftime.date2num(dt, units, calendar=cal)
    d2n.append({"args": [y, m, d, H, M, S, us], "units": units, "calendar": cal, "out": safe(make)})
OUT["date2num"] = d2n


# --- arithmetic: datetime +/- timedelta, datetime - datetime ----------------
arith = []
for cal in ["standard", "proleptic_gregorian", "julian", "noleap", "all_leap", "360_day"]:
    base = (2000, 1, 1, 0, 0, 0, 0)
    for delta_kwargs in [
        {"days": 1}, {"days": -1}, {"days": 400}, {"hours": 25},
        {"seconds": 90}, {"microseconds": 5}, {"days": 365}, {"days": 366},
    ]:
        def make(cal=cal, base=base, dk=delta_kwargs):
            dt = cftime.datetime(*base, calendar=cal)
            res = dt + timedelta(**dk)
            return {"y": res.year, "mo": res.month, "d": res.day, "H": res.hour,
                    "M": res.minute, "S": res.second, "us": res.microsecond}
        arith.append({"calendar": cal, "base": list(base), "delta": delta_kwargs, "out": safe(make)})
OUT["add_timedelta"] = arith

# datetime - datetime -> timedelta (total microseconds)
sub = []
for cal in ["standard", "proleptic_gregorian", "julian", "noleap", "all_leap", "360_day"]:
    def make(cal=cal):
        a = cftime.datetime(2000, 1, 2, 0, 0, 0, 5, calendar=cal)
        b = cftime.datetime(2000, 1, 2, calendar=cal)
        td = a - b
        return int(td.days) * 86400 * 1000000 + int(td.seconds) * 1000000 + int(td.microseconds)
    sub.append({"calendar": cal, "micros": safe(make)})
OUT["sub_datetime"] = sub


# --- 1582 gap edge cases ----------------------------------------------------
gap = []
for (y, m, d, cal) in [
    (1582, 10, 5, "standard"), (1582, 10, 14, "standard"),
    (1582, 10, 5, "julian"), (1582, 10, 15, "standard"), (1582, 10, 4, "standard"),
]:
    def make(y=y, m=m, d=d, cal=cal):
        return cftime.datetime(y, m, d, calendar=cal).toordinal()
    gap.append({"year": y, "month": m, "day": d, "calendar": cal, "out": safe(make)})
OUT["gap"] = gap


# --- time2index / date2index -----------------------------------------------
class NcTime:
    def __init__(self, values, units, calendar):
        self._values = list(values)
        self.units = units
        self.calendar = calendar
        self.shape = (len(self._values),)

    def __len__(self):
        return len(self._values)

    def __getitem__(self, key):
        import numpy as _np
        return _np.array(self._values)[key]


idx = []
# A uniformly-spaced daily time axis and an irregular one.
axes = {
    "uniform": ([0, 1, 2, 3, 4, 5], "days since 2000-01-01", "standard"),
    "irregular": ([0, 2, 5, 9, 14], "days since 2000-01-01", "standard"),
}
for axis_name, (vals, units, cal) in axes.items():
    nctime = NcTime(vals, units, cal)
    for select in ["exact", "before", "after", "nearest"]:
        for t in [0, 1, 2, 2.5, 3, 4.9, 5]:
            def make(t=t, nctime=nctime, cal=cal, select=select):
                return int(cftime.time2index(t, nctime, calendar=cal, select=select))
            idx.append({"axis": axis_name, "values": vals, "units": units, "calendar": cal,
                        "select": select, "time": t, "out": safe(make)})
OUT["time2index"] = idx

d2i = []
for axis_name, (vals, units, cal) in axes.items():
    nctime = NcTime(vals, units, cal)
    for select in ["exact", "before", "after", "nearest"]:
        for (y, m, d) in [(2000, 1, 1), (2000, 1, 3), (2000, 1, 6), (2000, 1, 4)]:
            def make(y=y, m=m, d=d, nctime=nctime, cal=cal, select=select):
                dt = cftime.datetime(y, m, d, calendar=cal)
                return int(cftime.date2index(dt, nctime, calendar=cal, select=select))
            d2i.append({"axis": axis_name, "values": vals, "units": units, "calendar": cal,
                        "select": select, "date": [y, m, d], "out": safe(make)})
OUT["date2index"] = d2i


out_path = os.path.join(os.path.dirname(__file__), "..", "test", "fixtures", "reference.json")
with open(out_path, "w") as f:
    json.dump({"cftime_version": cftime.__version__, "data": OUT}, f, indent=1, default=_json_default)
print("wrote", os.path.relpath(out_path), "with", sum(len(v) for v in OUT.values()), "cases")

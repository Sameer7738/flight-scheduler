"use client";
import { useState, useMemo, useEffect } from "react";
import { Plus, Trash2, Copy, Plane, Check, Loader2 } from "lucide-react";

// In the real Next.js project, put your full database at /public/airports.json
// and it gets fetched at runtime below — nothing to bundle, nothing to import.
// This small sample is only a fallback in case the fetch fails in this preview.
const FALLBACK_DATA = {
  FCBB: { icao: "FCBB", name: "Maya-Maya Airport", city: "Brazzaville", country: "CG", tz: "Africa/Brazzaville" },
  FCPP: { icao: "FCPP", name: "Pointe Noire Airport", city: "Pointe Noire", country: "CG", tz: "Africa/Brazzaville" },
  LICD: { icao: "LICD", iata: "LMP", name: "Lampedusa Airport", city: "Lampedusa", country: "IT", tz: "Europe/Rome" },
  LICJ: { icao: "LICJ", iata: "PMO", name: "Palermo / Punta Raisi Airport", city: "Palermo", country: "IT", tz: "Europe/Rome" },
  LPFR: { icao: "LPFR", iata: "FAO", name: "Faro Airport", city: "Faro", country: "PT", tz: "Europe/Lisbon" },
  GMMX: { icao: "GMMX", iata: "RAK", name: "Marrakesh Menara Airport", city: "Marrakesh", country: "MA", tz: "Africa/Casablanca" },
  LIML: { icao: "LIML", iata: "LIN", name: "Milan Linate Airport", city: "Milan", country: "IT", tz: "Europe/Rome" },
  "00AK": { icao: "00AK", name: "Lowell Field", city: "Anchor Point", country: "US", tz: "America/Anchorage" },
};

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

// ---- Timezone-correct helpers (uses Intl, so DST is handled by the tz database itself) ----

function pad(n) { return String(n).padStart(2, "0"); }

// Returns {y,m,d,h,min} of a UTC epoch ms value, in a given IANA timezone
function getLocalParts(epochMs, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = dtf.formatToParts(new Date(epochMs));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  let hour = get("hour");
  if (hour === "24") hour = "00"; // some locales report midnight as 24
  return {
    y: parseInt(get("year"), 10),
    m: parseInt(get("month"), 10),
    d: parseInt(get("day"), 10),
    h: parseInt(hour, 10),
    min: parseInt(get("minute"), 10),
  };
}

// Day-diff between two Y-M-D calendar dates (b - a), in whole days
function dayDiff(a, b) {
  const da = Date.UTC(a.y, a.m - 1, a.d);
  const db = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((db - da) / 86400000);
}

function dayMarker(diff) {
  if (diff === 0) return "";
  return diff > 0 ? `(+${diff})` : `(${diff})`;
}

function formatDDMon(y, m, d) {
  return `${pad(d)}.${MONTHS[m - 1]}`;
}

function buildLegOutput(leg, airportData) {
  const dep = airportData[leg.depIcao?.toUpperCase()];
  const arr = airportData[leg.arrIcao?.toUpperCase()];
  if (!dep || !arr || !leg.date || !leg.time || !leg.eet) return null;

  const [Y, M, D] = leg.date.split("-").map(Number); // yyyy-mm-dd from <input type="date">
  const [depH, depMin] = leg.time.split(":").map(Number);
  const [eetH, eetMin] = leg.eet.split(":").map(Number);

  const depEpoch = Date.UTC(Y, M - 1, D, depH, depMin);
  const eetMs = (eetH * 60 + eetMin) * 60000;
  const arrEpoch = depEpoch + eetMs;

  const zuluDepDate = { y: Y, m: M, d: D };
  const zuluArrDate = getLocalParts(arrEpoch, "UTC");

  const localDep = getLocalParts(depEpoch, dep.tz);
  const localArr = getLocalParts(arrEpoch, arr.tz);

  const zArrDiff = dayDiff(zuluDepDate, zuluArrDate);
  const ltDepDiff = dayDiff(zuluDepDate, localDep);
  const ltArrDiff = dayDiff(zuluDepDate, localArr);

  const etd = `${pad(depH)}${pad(depMin)}Z`;
  const etdLt = `${pad(localDep.h)}${pad(localDep.min)}LT${dayMarker(ltDepDiff)}`;
  const eta = `${pad(zuluArrDate.h)}${pad(zuluArrDate.min)}Z${dayMarker(zArrDiff)}`;
  const etaLt = `${pad(localArr.h)}${pad(localArr.min)}LT${dayMarker(ltArrDiff)}`;

  const header = formatDDMon(Y, M, D);
  const pax = leg.pax ? `${pad(Number(leg.pax))} PAX` : "PAX";

  return `${header} | ETD ${etd}/${etdLt} ${dep.icao} | ETA ${eta}/${etaLt} ${arr.icao} | EET ${leg.eet} | ${pax}`;
}

function emptyLeg() {
  return { id: crypto.randomUUID(), date: "", time: "", depIcao: "", arrIcao: "", eet: "", pax: "" };
}

export default function FlightScheduler() {
  const [legs, setLegs] = useState([emptyLeg()]);
  const [copied, setCopied] = useState(false);
  const [airportData, setAirportData] = useState(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    // In the real app this fetches /airports.json from the public/ folder,
    // e.g. fetch("/airports.json").then(r => r.json())
    fetch("/airports.json")
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((data) => setAirportData(data))
      .catch(() => {
        setLoadError(true);
        setAirportData(FALLBACK_DATA);
      });
  }, []);

  const outputs = useMemo(() => legs.map((l) => buildLegOutput(l, airportData || {})), [legs, airportData]);
  const validCount = outputs.filter(Boolean).length;

  if (!airportData) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center gap-2">
        <Loader2 className="animate-spin text-sky-400" size={20} />
        <span className="text-slate-400 text-sm">Loading airport database...</span>
      </div>
    );
  }

  function updateLeg(id, field, value) {
    setLegs((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }
  function addLeg() { setLegs((prev) => [...prev, emptyLeg()]); }
  function removeLeg(id) { setLegs((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev)); }

  function copyAll() {
    const text = outputs.filter(Boolean).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function icaoStatus(code) {
    if (!code) return null;
    return airportData[code.toUpperCase()] ? "ok" : "unknown";
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <Plane className="text-sky-400" size={28} />
          <h1 className="text-2xl font-semibold tracking-tight">Flight Schedule Generator</h1>
        </div>
        <p className="text-slate-400 text-sm mb-1">
          Times entered in Zulu. Local time and date shifts are calculated automatically per airport timezone.
        </p>
        {loadError && (
          <p className="text-amber-500 text-xs mb-6">
            Couldn't load /airports.json — using a small fallback list for this preview.
          </p>
        )}
        {!loadError && <div className="mb-6" />}

        <div className="space-y-4">
          {legs.map((leg, idx) => {
            const depStatus = icaoStatus(leg.depIcao);
            const arrStatus = icaoStatus(leg.arrIcao);
            return (
              <div key={leg.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Leg {idx + 1}</span>
                  <button onClick={() => removeLeg(leg.id)} className="text-slate-500 hover:text-red-400 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Date (Zulu)</label>
                    <input type="date" value={leg.date} onChange={(e) => updateLeg(leg.id, "date", e.target.value)}
                      className="w-full bg-slate-800 rounded-lg px-2 py-1.5 text-sm border border-slate-700 focus:border-sky-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">ETD (HH:MM Z)</label>
                    <input type="time" value={leg.time} onChange={(e) => updateLeg(leg.id, "time", e.target.value)}
                      className="w-full bg-slate-800 rounded-lg px-2 py-1.5 text-sm border border-slate-700 focus:border-sky-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Dep ICAO</label>
                    <input type="text" maxLength={4} value={leg.depIcao}
                      onChange={(e) => updateLeg(leg.id, "depIcao", e.target.value.toUpperCase())}
                      placeholder="FCBB"
                      className={`w-full bg-slate-800 rounded-lg px-2 py-1.5 text-sm border outline-none uppercase ${
                        depStatus === "unknown" ? "border-amber-600" : "border-slate-700 focus:border-sky-500"
                      }`} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Arr ICAO</label>
                    <input type="text" maxLength={4} value={leg.arrIcao}
                      onChange={(e) => updateLeg(leg.id, "arrIcao", e.target.value.toUpperCase())}
                      placeholder="FCPP"
                      className={`w-full bg-slate-800 rounded-lg px-2 py-1.5 text-sm border outline-none uppercase ${
                        arrStatus === "unknown" ? "border-amber-600" : "border-slate-700 focus:border-sky-500"
                      }`} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">EET (HH:MM)</label>
                    <input type="time" placeholder="00:50" value={leg.eet}
                      onChange={(e) => updateLeg(leg.id, "eet", e.target.value)}
                      className="w-full bg-slate-800 rounded-lg px-2 py-1.5 text-sm border border-slate-700 focus:border-sky-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">PAX</label>
                    <input type="number" min="0" value={leg.pax}
                      onChange={(e) => updateLeg(leg.id, "pax", e.target.value)}
                      className="w-full bg-slate-800 rounded-lg px-2 py-1.5 text-sm border border-slate-700 focus:border-sky-500 outline-none" />
                  </div>
                </div>
                {(depStatus === "unknown" || arrStatus === "unknown") && (
                  <p className="text-amber-500 text-xs mt-2">
                    ICAO code not found in database — check spelling or add it to data/airports.json.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <button onClick={addLeg}
          className="mt-3 flex items-center gap-1.5 text-sm text-sky-400 hover:text-sky-300 transition-colors">
          <Plus size={16} /> Add leg
        </button>

        <div className="mt-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide">Output</h2>
            {validCount > 0 && (
              <button onClick={copyAll}
                className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors">
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy all"}
              </button>
            )}
          </div>
          <div className="bg-black rounded-xl border border-slate-800 p-4 font-mono text-sm space-y-1 min-h-[80px]">
            {validCount === 0 && (
              <span className="text-slate-600">Fill in a leg's date, times, ICAO codes and EET to see output here.</span>
            )}
            {outputs.map((line, i) => line && <div key={i} className="text-emerald-400">{line}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

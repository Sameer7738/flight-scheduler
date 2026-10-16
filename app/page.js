"use client";
import { useState, useMemo, useEffect } from "react";
import { Plus, Trash2, Copy, Plane, Check, Loader2, Link2 } from "lucide-react";

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
  return diff > 0 ? ` (+${diff})` : ` (${diff})`;
}

function formatDDMon(y, m, d) {
  return `${pad(d)}.${MONTHS[m - 1]}`;
}

function hhmm(h, min) {
  return `${pad(h)}${pad(min)}`;
}

/** Format a UTC epoch as yyyy-mm-dd and HH:MM for form inputs */
function epochToDateAndTime(epochMs) {
  const p = getLocalParts(epochMs, "UTC");
  return {
    date: `${p.y}-${pad(p.m)}-${pad(p.d)}`,
    time: `${pad(p.h)}:${pad(p.min)}`,
  };
}

/**
 * Given a fully filled leg, return the UTC epoch of its ETA (dep + EET).
 * Returns null if incomplete.
 */
function getLegEtaEpoch(leg) {
  if (!leg.date || !leg.time || !leg.eet) return null;
  const [Y, M, D] = leg.date.split("-").map(Number);
  const [depH, depMin] = leg.time.split(":").map(Number);
  const [eetH, eetMin] = leg.eet.split(":").map(Number);
  const depEpoch = Date.UTC(Y, M - 1, D, depH, depMin);
  const eetMs = (eetH * 60 + eetMin) * 60000;
  return depEpoch + eetMs;
}

/**
 * Original mixed format: ETD 1000Z/1100LT ... (kept as-is)
 */
function buildMixedLine(leg, airportData) {
  const dep = airportData[leg.depIcao?.toUpperCase()];
  const arr = airportData[leg.arrIcao?.toUpperCase()];
  if (!dep || !arr || !leg.date || !leg.time || !leg.eet) return null;

  const [Y, M, D] = leg.date.split("-").map(Number);
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

  const zMarker = zArrDiff === 0 ? "" : zArrDiff > 0 ? `(+${zArrDiff})` : `(${zArrDiff})`;
  const ltDepMarker = ltDepDiff === 0 ? "" : ltDepDiff > 0 ? `(+${ltDepDiff})` : `(${ltDepDiff})`;
  const ltArrMarker = ltArrDiff === 0 ? "" : ltArrDiff > 0 ? `(+${ltArrDiff})` : `(${ltArrDiff})`;

  const etd = `${pad(depH)}${pad(depMin)}Z`;
  const etdLt = `${pad(localDep.h)}${pad(localDep.min)}LT${ltDepMarker}`;
  const eta = `${pad(zuluArrDate.h)}${pad(zuluArrDate.min)}Z${zMarker}`;
  const etaLt = `${pad(localArr.h)}${pad(localArr.min)}LT${ltArrMarker}`;

  const header = formatDDMon(Y, M, D);
  const pax = leg.pax !== "" && leg.pax != null ? `${pad(Number(leg.pax))} PAX` : "PAX";

  return `${header} | ETD ${etd}/${etdLt} ${dep.icao} | ETA ${eta}/${etaLt} ${arr.icao} | EET ${leg.eet} | ${pax}`;
}

/**
 * Pure Local and pure UTC schedule lines
 */
function buildScheduleLines(leg, airportData) {
  const dep = airportData[leg.depIcao?.toUpperCase()];
  const arr = airportData[leg.arrIcao?.toUpperCase()];
  if (!dep || !arr || !leg.date || !leg.time || !leg.eet) return null;

  const [Y, M, D] = leg.date.split("-").map(Number);
  const [depH, depMin] = leg.time.split(":").map(Number);
  const [eetH, eetMin] = leg.eet.split(":").map(Number);

  const depEpoch = Date.UTC(Y, M - 1, D, depH, depMin);
  const eetMs = (eetH * 60 + eetMin) * 60000;
  const arrEpoch = depEpoch + eetMs;

  const utcDep = { y: Y, m: M, d: D, h: depH, min: depMin };
  const utcArr = getLocalParts(arrEpoch, "UTC");
  const localDep = getLocalParts(depEpoch, dep.tz);
  const localArr = getLocalParts(arrEpoch, arr.tz);

  const utcEtaMarker = dayMarker(dayDiff(utcDep, utcArr));
  const localEtaMarker = dayMarker(dayDiff(localDep, localArr));

  const pax = leg.pax !== "" && leg.pax != null
    ? `${pad(Number(leg.pax))} PAX`
    : "00 PAX";

  const localLine =
    `${formatDDMon(localDep.y, localDep.m, localDep.d)} | ETD ${pad(localDep.h)}${pad(localDep.min)}LT ${dep.icao} | ETA ${pad(localArr.h)}${pad(localArr.min)}LT${localEtaMarker} ${arr.icao} | EET ${leg.eet} | ${pax}`;

  const utcLine =
    `${formatDDMon(utcDep.y, utcDep.m, utcDep.d)} | ETD ${pad(utcDep.h)}${pad(utcDep.min)}Z ${dep.icao} | ETA ${pad(utcArr.h)}${pad(utcArr.min)}Z${utcEtaMarker} ${arr.icao} | EET ${leg.eet} | ${pax}`;

  return {
    localLine,
    utcLine,
    localDepDate: formatDDMon(localDep.y, localDep.m, localDep.d),
    utcDepDate: formatDDMon(utcDep.y, utcDep.m, utcDep.d),
  };
}

/**
 * Build MVT messages (UTC + Local) from actual times.
 * EA is calculated from Takeoff + ETE.
 */
function buildMvt(mvt, airportData, tail) {
  const dep = airportData[mvt.depIcao?.toUpperCase()];
  const arr = airportData[mvt.arrIcao?.toUpperCase()];
  if (!dep || !arr || !mvt.date || !mvt.chocks || !mvt.takeoff || !mvt.ete) return null;

  const callsign = (tail || "ACFT").trim().toUpperCase();
  const [Y, M, D] = mvt.date.split("-").map(Number);
  const [chH, chMin] = mvt.chocks.split(":").map(Number);
  const [toH, toMin] = mvt.takeoff.split(":").map(Number);
  const [eteH, eteMin] = mvt.ete.split(":").map(Number);

  // Epochs in UTC
  const chocksEpoch = Date.UTC(Y, M - 1, D, chH, chMin);
  const takeoffEpoch = Date.UTC(Y, M - 1, D, toH, toMin);
  // If takeoff appears earlier than chocks on the clock, assume next day
  const toEpochAdj = takeoffEpoch < chocksEpoch ? takeoffEpoch + 86400000 : takeoffEpoch;
  const eteMs = (eteH * 60 + eteMin) * 60000;
  const eaEpoch = toEpochAdj + eteMs;

  // UTC parts
  const utcChocks = { h: chH, min: chMin, d: D };
  const utcTakeoff = getLocalParts(toEpochAdj, "UTC");
  const utcEa = getLocalParts(eaEpoch, "UTC");

  // Local parts
  const localChocks = getLocalParts(chocksEpoch, dep.tz);
  const localTakeoff = getLocalParts(toEpochAdj, dep.tz);
  const localEa = getLocalParts(eaEpoch, arr.tz);

  const crew = mvt.crew ? pad(Number(mvt.crew)) : "03";
  const paxLine = mvt.paxText?.trim() || "NO PAX";

  const utcMsg = [
    "MVT",
    `${callsign}/${pad(D)}.${callsign}.${dep.icao}`,
    `AD ${hhmm(utcChocks.h, utcChocks.min)}/${hhmm(utcTakeoff.h, utcTakeoff.min)} EA ${hhmm(utcEa.h, utcEa.min)} ${arr.icao}`,
    `CREW${crew}/ ${paxLine}`,
  ].join("\n");

  const localMsg = [
    "MVT",
    `${callsign}/${pad(localChocks.d)}.${callsign}.${dep.icao}`,
    `AD ${hhmm(localChocks.h, localChocks.min)}/${hhmm(localTakeoff.h, localTakeoff.min)} EA ${hhmm(localEa.h, localEa.min)} ${arr.icao}`,
    `CREW${crew}/ ${paxLine}`,
  ].join("\n");

  return { utcMsg, localMsg };
}

function emptyLeg() {
  return { id: crypto.randomUUID(), date: "", time: "", depIcao: "", arrIcao: "", eet: "", pax: "" };
}

function emptyMvt() {
  return {
    date: "",
    depIcao: "",
    arrIcao: "",
    chocks: "",
    takeoff: "",
    ete: "",
    crew: "3",
    paxText: "NO PAX",
  };
}

export default function FlightScheduler() {
  const [legs, setLegs] = useState([emptyLeg()]);
  const [tail, setTail] = useState("");
  const [turnaroundMin, setTurnaroundMin] = useState(60); // default 1 hour
  const [copiedMixed, setCopiedMixed] = useState(false);
  const [copiedSeparate, setCopiedSeparate] = useState(false);
  const [copiedMvt, setCopiedMvt] = useState(false);
  const [airportData, setAirportData] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [mvt, setMvt] = useState(emptyMvt());

  useEffect(() => {
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

  const mixedOutputs = useMemo(
    () => legs.map((l) => buildMixedLine(l, airportData || {})),
    [legs, airportData]
  );

  const schedule = useMemo(
    () => legs.map((l) => buildScheduleLines(l, airportData || {})),
    [legs, airportData]
  );

  const validCount = mixedOutputs.filter(Boolean).length;

  const separateText = useMemo(() => {
    if (validCount === 0) return "";
    const label = (tail || "ACFT").trim().toUpperCase();

    const localLines = schedule.filter(Boolean).map((s) => s.localLine);
    const utcLines = schedule.filter(Boolean).map((s) => s.utcLine);

    function withDayBreaks(lines, dates) {
      const out = [];
      let prev = null;
      lines.forEach((line, i) => {
        const d = dates[i];
        if (prev !== null && d !== prev) out.push("");
        out.push(line);
        prev = d;
      });
      return out;
    }

    const localDates = schedule.filter(Boolean).map((s) => s.localDepDate);
    const utcDates = schedule.filter(Boolean).map((s) => s.utcDepDate);

    const localBlock = [
      `*${label} UPDATED SCHEDULE IN LOCAL TIME*`,
      "",
      ...withDayBreaks(localLines, localDates),
    ].join("\n");

    const utcBlock = [
      `*${label} UPDATED SCHEDULE IN UTC TIME*`,
      "",
      ...withDayBreaks(utcLines, utcDates),
    ].join("\n");

    return `${localBlock}\n\n${utcBlock}`;
  }, [schedule, validCount, tail]);

  const mvtResult = useMemo(
    () => buildMvt(mvt, airportData || {}, tail),
    [mvt, airportData, tail]
  );

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

  /** Auto-chain: create next leg from this one using turnaround */
  function chainNextLeg(fromLeg) {
    const etaEpoch = getLegEtaEpoch(fromLeg);
    if (etaEpoch == null || !fromLeg.arrIcao) return;

    const turnMs = (Number(turnaroundMin) || 60) * 60 * 1000;
    const nextEtdEpoch = etaEpoch + turnMs;
    const { date, time } = epochToDateAndTime(nextEtdEpoch);

    const next = {
      ...emptyLeg(),
      date,
      time,
      depIcao: fromLeg.arrIcao.toUpperCase(),
      // arrIcao, eet, pax left blank for the user to fill
    };

    setLegs((prev) => {
      const idx = prev.findIndex((l) => l.id === fromLeg.id);
      if (idx === -1) return [...prev, next];
      // Insert right after the current leg
      const copy = [...prev];
      copy.splice(idx + 1, 0, next);
      return copy;
    });
  }

  function updateMvt(field, value) {
    setMvt((prev) => ({ ...prev, [field]: value }));
  }

  function copyMixed() {
    const text = mixedOutputs.filter(Boolean).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMixed(true);
      setTimeout(() => setCopiedMixed(false), 1500);
    });
  }

  function copySeparate() {
    if (!separateText) return;
    navigator.clipboard.writeText(separateText).then(() => {
      setCopiedSeparate(true);
      setTimeout(() => setCopiedSeparate(false), 1500);
    });
  }

  function copyMvt() {
    if (!mvtResult) return;
    const text = [
      "// UTC",
      mvtResult.utcMsg,
      "",
      "// LOCAL",
      mvtResult.localMsg,
    ].join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMvt(true);
      setTimeout(() => setCopiedMvt(false), 1500);
    });
  }

  function icaoStatus(code) {
    if (!code) return null;
    return airportData[code.toUpperCase()] ? "ok" : "unknown";
  }

  const mvtDepStatus = icaoStatus(mvt.depIcao);
  const mvtArrStatus = icaoStatus(mvt.arrIcao);

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
          <p className="text-amber-500 text-xs mb-4">
            Couldn't load /airports.json — using a small fallback list for this preview.
          </p>
        )}

        {/* Tail + Turnaround settings */}
        <div className="mb-6 flex flex-wrap gap-4 items-end">
          <div className="max-w-xs flex-1 min-w-[160px]">
            <label className="text-xs text-slate-500 block mb-1">Aircraft / Tail (used in schedule headers & MVT)</label>
            <input
              type="text"
              value={tail}
              onChange={(e) => setTail(e.target.value.toUpperCase())}
              placeholder="N291VK"
              className="w-full bg-slate-800 rounded-lg px-3 py-1.5 text-sm border border-slate-700 focus:border-sky-500 outline-none uppercase font-mono"
            />
          </div>
          <div className="w-36">
            <label className="text-xs text-slate-500 block mb-1">Turnaround (min)</label>
            <input
              type="number"
              min="0"
              step="5"
              value={turnaroundMin}
              onChange={(e) => setTurnaroundMin(e.target.value === "" ? 60 : Number(e.target.value))}
              className="w-full bg-slate-800 rounded-lg px-3 py-1.5 text-sm border border-slate-700 focus:border-sky-500 outline-none"
            />
          </div>
          <p className="text-xs text-slate-600 pb-1.5">
            Default 60 min. Used by “Chain next leg”.
          </p>
        </div>

        {/* ===== LEGS ===== */}
        <div className="space-y-4">
          {legs.map((leg, idx) => {
            const depStatus = icaoStatus(leg.depIcao);
            const arrStatus = icaoStatus(leg.arrIcao);
            const canChain = !!(leg.date && leg.time && leg.eet && leg.arrIcao);
            return (
              <div key={leg.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Leg {idx + 1}</span>
                  <div className="flex items-center gap-2">
                    {canChain && (
                      <button
                        onClick={() => chainNextLeg(leg)}
                        title={`Add next leg from ${leg.arrIcao} after ${turnaroundMin || 60} min turnaround`}
                        className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition-colors px-2 py-1 rounded-md hover:bg-slate-800"
                      >
                        <Link2 size={14} />
                        Chain next leg
                      </button>
                    )}
                    <button onClick={() => removeLeg(leg.id)} className="text-slate-500 hover:text-red-400 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
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
                      placeholder="KCHA"
                      className={`w-full bg-slate-800 rounded-lg px-2 py-1.5 text-sm border outline-none uppercase ${
                        depStatus === "unknown" ? "border-amber-600" : "border-slate-700 focus:border-sky-500"
                      }`} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Arr ICAO</label>
                    <input type="text" maxLength={4} value={leg.arrIcao}
                      onChange={(e) => updateLeg(leg.id, "arrIcao", e.target.value.toUpperCase())}
                      placeholder="KTEB"
                      className={`w-full bg-slate-800 rounded-lg px-2 py-1.5 text-sm border outline-none uppercase ${
                        arrStatus === "unknown" ? "border-amber-600" : "border-slate-700 focus:border-sky-500"
                      }`} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">EET (HH:MM)</label>
                    <input type="time" placeholder="01:50" value={leg.eet}
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
                    ICAO code not found in database — check spelling or add it to public/airports.json.
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

        {/* ===== 1. Original mixed Output ===== */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide">Output (Zulu + Local together)</h2>
            {validCount > 0 && (
              <button onClick={copyMixed}
                className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors">
                {copiedMixed ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {copiedMixed ? "Copied" : "Copy all"}
              </button>
            )}
          </div>
          <div className="bg-black rounded-xl border border-slate-800 p-4 font-mono text-sm space-y-1 min-h-[80px]">
            {validCount === 0 ? (
              <span className="text-slate-600">Fill in a leg's date, times, ICAO codes and EET to see output here.</span>
            ) : (
              mixedOutputs.map((line, i) => line && <div key={i} className="text-emerald-400">{line}</div>)
            )}
          </div>
        </div>

        {/* ===== 2. Separate pure Local + pure UTC blocks ===== */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide">Separate Schedules (Local + UTC)</h2>
            {validCount > 0 && (
              <button onClick={copySeparate}
                className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors">
                {copiedSeparate ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {copiedSeparate ? "Copied" : "Copy all"}
              </button>
            )}
          </div>
          <div className="bg-black rounded-xl border border-slate-800 p-4 font-mono text-sm min-h-[120px] whitespace-pre-wrap">
            {validCount === 0 ? (
              <span className="text-slate-600">
                Fill in legs (and optionally a tail number) to generate the Local and UTC schedules.
              </span>
            ) : (
              <div className="text-emerald-400">{separateText}</div>
            )}
          </div>
        </div>

        {/* ===== 3. MVT Report Generator ===== */}
        <div className="mt-12 pt-8 border-t border-slate-800">
          <h2 className="text-lg font-semibold text-slate-200 mb-1">MVT Report</h2>
          <p className="text-slate-500 text-sm mb-4">
            Enter actual chocks-off, takeoff and ETE (all in UTC). EA is calculated from takeoff + ETE. Both UTC and Local MVT messages are generated.
          </p>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Date (UTC)</label>
                <input type="date" value={mvt.date}
                  onChange={(e) => updateMvt("date", e.target.value)}
                  className="w-full bg-slate-800 rounded-lg px-2 py-1.5 text-sm border border-slate-700 focus:border-sky-500 outline-none" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Dep ICAO</label>
                <input type="text" maxLength={4} value={mvt.depIcao}
                  onChange={(e) => updateMvt("depIcao", e.target.value.toUpperCase())}
                  placeholder="KVNY"
                  className={`w-full bg-slate-800 rounded-lg px-2 py-1.5 text-sm border outline-none uppercase ${
                    mvtDepStatus === "unknown" ? "border-amber-600" : "border-slate-700 focus:border-sky-500"
                  }`} />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Arr ICAO</label>
                <input type="text" maxLength={4} value={mvt.arrIcao}
                  onChange={(e) => updateMvt("arrIcao", e.target.value.toUpperCase())}
                  placeholder="KFAT"
                  className={`w-full bg-slate-800 rounded-lg px-2 py-1.5 text-sm border outline-none uppercase ${
                    mvtArrStatus === "unknown" ? "border-amber-600" : "border-slate-700 focus:border-sky-500"
                  }`} />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Crew</label>
                <input type="number" min="1" value={mvt.crew}
                  onChange={(e) => updateMvt("crew", e.target.value)}
                  className="w-full bg-slate-800 rounded-lg px-2 py-1.5 text-sm border border-slate-700 focus:border-sky-500 outline-none" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Chocks-off (UTC)</label>
                <input type="time" value={mvt.chocks}
                  onChange={(e) => updateMvt("chocks", e.target.value)}
                  className="w-full bg-slate-800 rounded-lg px-2 py-1.5 text-sm border border-slate-700 focus:border-sky-500 outline-none" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Takeoff (UTC)</label>
                <input type="time" value={mvt.takeoff}
                  onChange={(e) => updateMvt("takeoff", e.target.value)}
                  className="w-full bg-slate-800 rounded-lg px-2 py-1.5 text-sm border border-slate-700 focus:border-sky-500 outline-none" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">ETE (HH:MM)</label>
                <input type="time" value={mvt.ete}
                  onChange={(e) => updateMvt("ete", e.target.value)}
                  placeholder="00:30"
                  className="w-full bg-slate-800 rounded-lg px-2 py-1.5 text-sm border border-slate-700 focus:border-sky-500 outline-none" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">PAX text</label>
                <input type="text" value={mvt.paxText}
                  onChange={(e) => updateMvt("paxText", e.target.value.toUpperCase())}
                  placeholder="NO PAX"
                  className="w-full bg-slate-800 rounded-lg px-2 py-1.5 text-sm border border-slate-700 focus:border-sky-500 outline-none uppercase" />
              </div>
            </div>
            {(mvtDepStatus === "unknown" || mvtArrStatus === "unknown") && (
              <p className="text-amber-500 text-xs mt-2">
                ICAO code not found in database — check spelling.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide">MVT Output</h3>
            {mvtResult && (
              <button onClick={copyMvt}
                className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors">
                {copiedMvt ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {copiedMvt ? "Copied" : "Copy both"}
              </button>
            )}
          </div>

          <div className="bg-black rounded-xl border border-slate-800 p-4 font-mono text-sm min-h-[140px] whitespace-pre-wrap">
            {!mvtResult ? (
              <span className="text-slate-600">
                Fill date, airports, chocks-off, takeoff and ETE to generate MVT messages.
              </span>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">UTC</div>
                  <div className="text-emerald-400">{mvtResult.utcMsg}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Local</div>
                  <div className="text-sky-300">{mvtResult.localMsg}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

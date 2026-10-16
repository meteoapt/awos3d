import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Value = string | number | null;

type SiteData = {
  wind?: {
    wd?: Value;
    ws?: Value;
    wgd?: Value;
    wgs?: Value;
  };
  temperature?: {
    temp?: Value;
    dew?: Value;
    rh?: Value;
  };
  qnh?: Value;
  da?: Value;
  extra?: Record<string, unknown>;
};

type AwosRow = {
  id: number;
  station: string;
  tanggal: string;
  jam: number;
  menit: number;
  raw_line: string;
  received_at: string;
  parsed_data?: {
    sites?: {
      "04"?: SiteData;
      M?: SiteData;
      "22"?: SiteData;
    };
    format?: string;
  };
};

const POINTS = {
  RWY04: {
    name: "RWY 04",
    lat: -0.380938,
    lon: 117.243473,
  },
  MIDDLE: {
    name: "MIDDLE",
    lat: -0.37377,
    lon: 117.250481,
  },
  RWY22: {
    name: "RWY 22",
    lat: -0.366803,
    lon: 117.255974,
  },
};

function num(value: unknown): number | null {
  if (value == null || value === "") return null;

  const text = String(value).trim();

  if (!text || ["///", "////", "/////", "XXX", "-"].includes(text)) {
    return null;
  }

  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function temperature(value: unknown): number | null {
  const n = num(value);
  return n === null ? null : n;
}

function pressure(value: unknown): number | null {
  const n = num(value);
  if (n === null) return null;

  return n > 2000 ? n / 10 : n;
}

function getSite(row: AwosRow, siteKey: "04" | "M" | "22"): SiteData {
  return row.parsed_data?.sites?.[siteKey] ?? {};
}

function mapPoint(site: SiteData) {
  return {
    windSpeedKt: num(site.wind?.ws),
    windDirectionDeg: num(site.wind?.wd),
    windGustKt: num(site.wind?.wgs),
    windGustDirectionDeg: num(site.wind?.wgd),

    // Nilai suhu dan dew point tetap dalam skala
    // persepuluhan derajat agar sesuai dengan frontend.
    airTempC: temperature(site.temperature?.temp),
    dewPointC: temperature(site.temperature?.dew),

    rhPct: num(site.temperature?.rh),
    qnhHpa: pressure(site.qnh),
    densityAltitudeFt: num(site.da),
  };
}

function extraNumber(site: SiteData, key: string): number | null {
  return num(site.extra?.[key]);
}

function extraText(site: SiteData, key: string): string | null {
  const value = site.extra?.[key];

  if (value == null) return null;

  const text = String(value).trim();

  return text && !["///", "////", "/////", "XXX", "-"].includes(text)
    ? text
    : null;
}

function mapCommon(row: AwosRow) {
  const rwy04 = getSite(row, "04");
  const middle = getSite(row, "M");
  const rwy22 = getSite(row, "22");

  return {
    visibility04M: extraNumber(rwy04, "VIS"),
    visibility22M: extraNumber(rwy22, "VIS"),

    rvr04M: extraNumber(rwy04, "RVR"),
    rvr22M: extraNumber(rwy22, "RVR"),

    sky04: extraText(rwy04, "SKY"),
    sky22: extraText(rwy22, "SKY"),

    // RA pada baris terbaru adalah nilai penghitung
    // mentah. Ini belum tentu akumulasi hujan 24 jam.
    rain04Mm: extraNumber(rwy04, "RA"),
    rainMiddleMm: extraNumber(middle, "RA"),
    rain22Mm: extraNumber(rwy22, "RA"),

    presentWeather04: extraText(rwy04, "PW"),
    presentWeather22: extraText(rwy22, "PW"),

    solarRadiationWm2: extraNumber(middle, "SOL"),
    lightning: extraText(middle, "LTX"),

    qnhMiddleHpa: pressure(middle.qnh),
    qnh22Hpa: pressure(rwy22.qnh),
  };
}

export async function GET() {
  const fetchedAt = new Date().toISOString();

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "SUPABASE_URL dan SUPABASE_PUBLISHABLE_KEY harus diatur di .env.local.",
      );
    }

    const url = new URL("/rest/v1/awi_data", supabaseUrl);

    url.searchParams.set("select", "*");
    url.searchParams.set("order", "tanggal.desc,jam.desc,menit.desc,id.desc");
    url.searchParams.set("limit", "1");

    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    if (!response.ok) {
      const detail = await response.text();

      throw new Error(`Supabase HTTP ${response.status}: ${detail}`);
    }

    const rows = (await response.json()) as AwosRow[];

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("Tidak ada data pada tabel awi_data.");
    }

    const latest = rows[0];

    if (!latest.parsed_data?.sites) {
      throw new Error(
        "Kolom parsed_data.sites tidak ditemukan pada data terbaru.",
      );
    }

    const data = {
      timestamp: `${latest.tanggal} ${String(latest.jam).padStart(2, "0")}:${String(latest.menit).padStart(2, "0")} UTC`,
      points: {
        RWY04: mapPoint(getSite(latest, "04")),
        MIDDLE: mapPoint(getSite(latest, "M")),
        RWY22: mapPoint(getSite(latest, "22")),
      },
      common: mapCommon(latest),
      raw: latest.raw_line ?? "",
    };

    return NextResponse.json(
      {
        ok: true,
        fetchedAt,
        source: "Supabase awi_data",
        points: POINTS,
        data,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Kesalahan tidak diketahui.";

    console.error("[AWOS SUPABASE]", message);

    return NextResponse.json(
      {
        ok: false,
        fetchedAt,
        source: "Supabase awi_data",
        error: message,
        points: POINTS,
      },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }
}

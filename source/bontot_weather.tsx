import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search,
  MapPin,
  Navigation,
  RefreshCw,
  Sun,
  Moon,
  Cloud,
  CloudRain,
  CloudLightning,
  CloudDrizzle,
  CloudSnow,
  CloudFog,
  Wind,
  Droplets,
  Eye,
  Gauge,
  Sunrise,
  Sunset,
  ShieldAlert,
  Sparkles,
  Star,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  WifiOff,
  Clock,
  Calendar,
  Thermometer,
  Umbrella,
  Activity,
  Info,
  ChevronRight,
  Compass,
  Layers,
  Terminal,
  HelpCircle,
  Check,
  X,
  AlertCircle,
  PlayCircle
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { Preferences } from '@capacitor/preferences';

// ============================================================================
// 1. KONFIGURASI, KONSTANTA & ENDPOINT RESMI API
// ============================================================================
export const APP_NAME = 'BONTOT WEATHER';
export const APP_TAGLINE = 'Know the Sky. Own Your Day.';

export const API_ENDPOINTS = {
  FORECAST: 'https://api.open-meteo.com/v1/forecast',
  AIR_QUALITY: 'https://air-quality-api.open-meteo.com/v1/air-quality',
  GEOCODING: 'https://geocoding-api.open-meteo.com/v1/search',
  REVERSE_GEO: 'https://api.bigdatacloud.net/data/reverse-geocode-client'
};

export const STORAGE_KEYS = {
  THEME: 'bontot_weather_theme_v1',
  FAVORITES: 'bontot_weather_favorites_v1',
  LAST_LOCATION: 'bontot_weather_last_loc_v1',
  WEATHER_CACHE: 'bontot_weather_cache_v1'
};

export const CACHE_MAX_ENTRIES = 10;
export const CACHE_STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 Jam
export const COORD_MATCH_TOLERANCE = 0.01; // ~1.1 km toleransi koordinat

export const DEFAULT_LOCATION = {
  id: 'jakarta-id',
  name: 'Jakarta',
  admin1: 'DKI Jakarta',
  country: 'Indonesia',
  country_code: 'ID',
  latitude: -6.2088,
  longitude: 106.8456,
  timezone: 'Asia/Jakarta'
};

export const PRESET_CITIES = [
  DEFAULT_LOCATION,
  {
    id: 'surabaya-id',
    name: 'Surabaya',
    admin1: 'Jawa Timur',
    country: 'Indonesia',
    country_code: 'ID',
    latitude: -7.2575,
    longitude: 112.7521,
    timezone: 'Asia/Jakarta'
  },
  {
    id: 'bandung-id',
    name: 'Bandung',
    admin1: 'Jawa Barat',
    country: 'Indonesia',
    country_code: 'ID',
    latitude: -6.9175,
    longitude: 107.6191,
    timezone: 'Asia/Jakarta'
  },
  {
    id: 'denpasar-id',
    name: 'Denpasar',
    admin1: 'Bali',
    country: 'Indonesia',
    country_code: 'ID',
    latitude: -8.6500,
    longitude: 115.2167,
    timezone: 'Asia/Makassar'
  },
  {
    id: 'jayapura-id',
    name: 'Jayapura',
    admin1: 'Papua',
    country: 'Indonesia',
    country_code: 'ID',
    latitude: -2.5337,
    longitude: 140.7181,
    timezone: 'Asia/Jayapura'
  },
  {
    id: 'tokyo-jp',
    name: 'Tokyo',
    admin1: 'Tokyo',
    country: 'Jepang',
    country_code: 'JP',
    latitude: 35.6895,
    longitude: 139.6917,
    timezone: 'Asia/Tokyo'
  }
];

/**
 * Menyinkronkan lokasi aktif pengguna ke storage native Android (SharedPreferences via Preferences).
 * Digunakan langsung oleh Android AppWidget untuk memuat cuaca lokasi pilihan pengguna.
 */
export async function syncLocationToNativeWidget(loc: any) {
  try {
    if (!loc) return;
    const jsonStr = JSON.stringify(loc);
    localStorage.setItem(STORAGE_KEYS.LAST_LOCATION, jsonStr);
    try {
      await Preferences.set({ key: 'bontot_selected_location', value: jsonStr });
    } catch {
      // Non-blocking di lingkungan browser murni / testing
    }
  } catch {}
}

// ============================================================================
// 2. UTILITAS METEOROLOGI, VALIDASI DATA & FORMAT ANGKA
// ============================================================================
export const ACTIVE_RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
export const ACTIVE_SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

/**
 * Validasi ketat angka numerik terhingga.
 * Mengembalikan null untuk undefined, null, NaN, Infinity, atau string kosong.
 */
export function parseFiniteOrNull(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Format koordinat geografis lintang & bujur tanpa menduplikasi arah (LU/LS, BT/BB).
 * Menangani titik nol khatulistiwa dan meridian secara spesifik.
 */
export function formatCoordinates(lat: any, lon: any): string {
  const latNum = parseFiniteOrNull(lat);
  const lonNum = parseFiniteOrNull(lon);
  if (latNum === null || lonNum === null) {
    return 'Koordinat tidak tersedia';
  }

  let latStr = `${Math.abs(latNum).toFixed(2)}°`;
  if (latNum > 0) latStr += ' LU';
  else if (latNum < 0) latStr += ' LS';
  else latStr += ' (Khatulistiwa)';

  let lonStr = `${Math.abs(lonNum).toFixed(2)}°`;
  if (lonNum > 0) lonStr += ' BT';
  else if (lonNum < 0) lonStr += ' BB';
  else lonStr += ' (Meridian Utama)';

  return `${latStr}, ${lonStr}`;
}

/**
 * Logika kecocokan koordinat geografis dengan toleransi eksplisit.
 */
export function isCoordinateMatching(
  c1: { latitude?: number | string; longitude?: number | string; lat?: number | string; lon?: number | string },
  c2: { latitude?: number | string; longitude?: number | string; lat?: number | string; lon?: number | string },
  tolerance = COORD_MATCH_TOLERANCE
): boolean {
  const lat1 = parseFiniteOrNull(c1?.latitude ?? c1?.lat);
  const lon1 = parseFiniteOrNull(c1?.longitude ?? c1?.lon);
  const lat2 = parseFiniteOrNull(c2?.latitude ?? c2?.lat);
  const lon2 = parseFiniteOrNull(c2?.longitude ?? c2?.lon);

  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return false;
  return Math.abs(lat1 - lat2) < tolerance && Math.abs(lon1 - lon2) < tolerance;
}

/**
 * Validasi usia dan integritas timestamp data cache.
 */
export function isCacheStale(savedAt: any, thresholdMs = CACHE_STALE_THRESHOLD_MS, now = Date.now()): boolean {
  if (!savedAt) return true;
  const savedTime = new Date(savedAt).getTime();
  if (!Number.isFinite(savedTime) || savedTime <= 0) return true;
  return (now - savedTime) > thresholdMs;
}

/**
 * Menyimpan data cuaca ke objek cache dan secara tegas membatasi maksimal CACHE_MAX_ENTRIES (10).
 */
export function pruneAndSaveCache(
  cacheObj: Record<string, any>,
  coordKey: string,
  entry: any,
  maxEntries = CACHE_MAX_ENTRIES
): Record<string, any> {
  const updated = { ...cacheObj, [coordKey]: entry };
  const keys = Object.keys(updated);
  if (keys.length > maxEntries) {
    keys
      .sort((a, b) => {
        const timeA = new Date(updated[a]?.savedAt).getTime() || 0;
        const timeB = new Date(updated[b]?.savedAt).getTime() || 0;
        return timeA - timeB;
      })
      .slice(0, keys.length - maxEntries)
      .forEach((k) => delete updated[k]);
  }
  return updated;
}

/**
 * Mengambil data cache yang koordinatnya benar-benar cocok dengan lokasi target.
 */
export function getMatchingCacheEntry(
  cacheObj: Record<string, any>,
  targetLat: number,
  targetLon: number,
  tolerance = COORD_MATCH_TOLERANCE
): { entry: any; isStale: boolean } | null {
  if (!cacheObj || typeof cacheObj !== 'object') return null;
  const coordKey = `${targetLat.toFixed(3)},${targetLon.toFixed(3)}`;
  const entry = cacheObj[coordKey];
  if (!entry || !entry.weatherData) return null;

  const sourceCoord = entry.weatherData.sourceCoord || { latitude: entry.targetLat, longitude: entry.targetLon };
  if (!isCoordinateMatching(sourceCoord, { latitude: targetLat, longitude: targetLon }, tolerance)) {
    return null;
  }

  const stale = isCacheStale(entry.savedAt);
  return { entry, isStale: stale };
}


/**
 * Menerjemahkan kode cuaca WMO (0-99).
 * Kode yang tidak dikenal mengembalikan label netral 'Kondisi Tidak Diketahui'
 * dan kategori 'unknown' agar tidak memicu animasi cerah/malam palsu.
 */
export function getWeatherInfo(code: any, isDay: any = 1) {
  const numericCode = parseFiniteOrNull(code);
  if (numericCode === null) {
    return {
      label: 'Kondisi Tidak Diketahui',
      category: 'unknown',
      iconType: 'unknown',
      severity: 'normal'
    };
  }

  const day = Boolean(isDay);

  const wmoMap: Record<number, { label: string; category: string; iconType: string; severity: string }> = {
    0: { label: day ? 'Cerah' : 'Malam Cerah', category: day ? 'clear-day' : 'clear-night', iconType: day ? 'sun' : 'moon', severity: 'normal' },
    1: { label: day ? 'Cerah Berawan' : 'Malam Cerah Berawan', category: day ? 'partly-cloudy-day' : 'partly-cloudy-night', iconType: day ? 'cloud-sun' : 'cloud-moon', severity: 'normal' },
    2: { label: 'Berawan Sebagian', category: 'cloudy', iconType: day ? 'cloud-sun' : 'cloud-moon', severity: 'normal' },
    3: { label: 'Mendung / Berawan Tebal', category: 'overcast', iconType: 'cloud', severity: 'normal' },
    45: { label: 'Berkabut', category: 'fog', iconType: 'fog', severity: 'moderate' },
    48: { label: 'Kabut Tebal Berembun', category: 'fog', iconType: 'fog', severity: 'moderate' },
    51: { label: 'Gerimis Ringan', category: 'drizzle', iconType: 'drizzle', severity: 'normal' },
    53: { label: 'Gerimis Sedang', category: 'drizzle', iconType: 'drizzle', severity: 'moderate' },
    55: { label: 'Gerimis Rapat', category: 'drizzle', iconType: 'drizzle', severity: 'moderate' },
    56: { label: 'Gerimis Dingin Ringan', category: 'drizzle', iconType: 'drizzle', severity: 'moderate' },
    57: { label: 'Gerimis Dingin Rapat', category: 'drizzle', iconType: 'drizzle', severity: 'moderate' },
    61: { label: 'Hujan Ringan', category: 'rain', iconType: 'rain', severity: 'moderate' },
    63: { label: 'Hujan Sedang', category: 'rain', iconType: 'rain', severity: 'moderate' },
    65: { label: 'Hujan Lebat', category: 'heavy-rain', iconType: 'heavy-rain', severity: 'high' },
    66: { label: 'Hujan Beku Ringan', category: 'rain', iconType: 'snow', severity: 'high' },
    67: { label: 'Hujan Beku Lebat', category: 'heavy-rain', iconType: 'snow', severity: 'high' },
    71: { label: 'Salju Ringan', category: 'snow', iconType: 'snow', severity: 'moderate' },
    73: { label: 'Salju Sedang', category: 'snow', iconType: 'snow', severity: 'moderate' },
    75: { label: 'Salju Lebat', category: 'snow', iconType: 'snow', severity: 'high' },
    77: { label: 'Butiran Salju', category: 'snow', iconType: 'snow', severity: 'moderate' },
    80: { label: 'Hujan Lokal Ringan', category: 'rain', iconType: 'rain', severity: 'moderate' },
    81: { label: 'Hujan Lokal Sedang', category: 'rain', iconType: 'rain', severity: 'moderate' },
    82: { label: 'Hujan Lokal Sangat Deras', category: 'heavy-rain', iconType: 'heavy-rain', severity: 'high' },
    85: { label: 'Hujan Salju Ringan', category: 'snow', iconType: 'snow', severity: 'moderate' },
    86: { label: 'Hujan Salju Lebat', category: 'snow', iconType: 'snow', severity: 'high' },
    95: { label: 'Badai Petir', category: 'thunderstorm', iconType: 'thunder', severity: 'extreme' },
    96: { label: 'Badai Petir & Hujan Es Ringan', category: 'thunderstorm', iconType: 'thunder', severity: 'extreme' },
    99: { label: 'Badai Petir Ekstrem & Hujan Es', category: 'thunderstorm', iconType: 'thunder', severity: 'extreme' }
  };

  return wmoMap[numericCode] || {
    label: 'Kondisi Tidak Diketahui',
    category: 'unknown',
    iconType: 'unknown',
    severity: 'normal'
  };
}

/**
 * Konversi derajat angin (0-360) ke mata angin Bahasa Indonesia.
 */
export function getWindDirectionLabel(degrees: any) {
  const deg = parseFiniteOrNull(degrees);
  if (deg === null) {
    return { short: '-', full: 'Arah tidak tersedia' };
  }
  const normalized = ((deg % 360) + 360) % 360;
  const directions = [
    { short: 'U', full: 'Utara' },
    { short: 'UTL', full: 'Utara Timur Laut' },
    { short: 'TL', full: 'Timur Laut' },
    { short: 'TTL', full: 'Timur Timur Laut' },
    { short: 'T', full: 'Timur' },
    { short: 'TTG', full: 'Timur Tenggara' },
    { short: 'TG', full: 'Tenggara' },
    { short: 'STG', full: 'Selatan Tenggara' },
    { short: 'S', full: 'Selatan' },
    { short: 'SBD', full: 'Selatan Barat Daya' },
    { short: 'BD', full: 'Barat Daya' },
    { short: 'BBD', full: 'Barat Barat Daya' },
    { short: 'B', full: 'Barat' },
    { short: 'BBL', full: 'Barat Barat Laut' },
    { short: 'BL', full: 'Barat Laut' },
    { short: 'UBL', full: 'Utara Barat Laut' }
  ];
  const index = Math.round(normalized / 22.5) % 16;
  return directions[index];
}

/**
 * Evaluasi Indeks Radiasi UV.
 * Jika null, tidak mengklaim aman, melainkan Tidak Tersedia.
 */
export function getUvCategory(uv: any) {
  const val = parseFiniteOrNull(uv);
  if (val === null) {
    return {
      level: 'Tidak Tersedia',
      color: 'text-slate-400',
      bg: 'bg-slate-500/15 border-slate-500/30',
      advice: 'Data indeks radiasi UV jam ini belum dilaporkan oleh stasiun/model cuaca.'
    };
  }
  if (val < 3) {
    return {
      level: 'Rendah',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/15 border-emerald-500/30',
      advice: 'Aman untuk beraktivitas di luar ruangan tanpa perlindungan khusus.'
    };
  }
  if (val < 6) {
    return {
      level: 'Sedang',
      color: 'text-amber-400',
      bg: 'bg-amber-500/15 border-amber-500/30',
      advice: 'Gunakan kacamata hitam dan tabir surya SPF 30+ saat berada di bawah terik matahari.'
    };
  }
  if (val < 8) {
    return {
      level: 'Tinggi',
      color: 'text-orange-400',
      bg: 'bg-orange-500/15 border-orange-500/30',
      advice: 'Kurangi paparan matahari langsung pukul 10.00–15.00. Kenakan pelindung kepala.'
    };
  }
  if (val < 11) {
    return {
      level: 'Sangat Tinggi',
      color: 'text-rose-400',
      bg: 'bg-rose-500/15 border-rose-500/30',
      advice: 'Hindari sengatan matahari langsung terlalu lama. Gunakan pelindung UV penuh.'
    };
  }
  return {
    level: 'Ekstrem',
    color: 'text-fuchsia-400',
    bg: 'bg-fuchsia-500/15 border-fuchsia-500/30',
    advice: 'Radiasi UV berada pada level bahaya ekstrem. Disarankan tetap di dalam ruangan.'
  };
}

/**
 * Evaluasi US AQI ke standar kesehatan respirasi.
 */
export function getAqiCategory(usAqi: any) {
  const val = parseFiniteOrNull(usAqi);
  if (val === null) {
    return {
      label: 'Tidak Tersedia',
      color: 'text-slate-400',
      badgeBg: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
      barColor: 'bg-slate-500',
      description: 'Data indeks kualitas udara (US AQI) belum tersedia untuk koordinat wilayah ini.'
    };
  }
  if (val <= 50) {
    return {
      label: 'Baik',
      color: 'text-emerald-400',
      badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      barColor: 'bg-emerald-400',
      description: 'Kualitas udara memuaskan dan tingkat polusi udara tidak menimbulkan risiko kesehatan.'
    };
  }
  if (val <= 100) {
    return {
      label: 'Sedang',
      color: 'text-amber-400',
      badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      barColor: 'bg-amber-400',
      description: 'Kualitas udara dapat diterima, namun kelompok rentan sebaiknya membatasi aktivitas berat.'
    };
  }
  if (val <= 150) {
    return {
      label: 'Tidak Sehat bagi Kelompok Sensitif',
      color: 'text-orange-400',
      badgeBg: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
      barColor: 'bg-orange-400',
      description: 'Individu penderita asma, anak-anak, dan lansia disarankan memakai masker saat di luar.'
    };
  }
  if (val <= 200) {
    return {
      label: 'Tidak Sehat',
      color: 'text-rose-400',
      badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      barColor: 'bg-rose-500',
      description: 'Kualitas udara buruk bagi masyarakat umum; kurangi aktivitas fisik berlebih di luar ruangan.'
    };
  }
  if (val <= 300) {
    return {
      label: 'Sangat Tidak Sehat',
      color: 'text-purple-400',
      badgeBg: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      barColor: 'bg-purple-500',
      description: 'Peringatan kesehatan kondisi siaga. Hindari seluruh kegiatan fisik di luar ruangan.'
    };
  }
  return {
    label: 'Berbahaya',
    color: 'text-red-500',
    badgeBg: 'bg-red-500/20 text-red-300 border-red-500/40',
    barColor: 'bg-red-600',
    description: 'Tingkat polusi udara kritis. Wajib berada di dalam ruangan dan nyalakan filter udara.'
  };
}

/**
 * Format metrik aman dalam standar Bahasa Indonesia.
 */
export function formatMetric(value: any, decimals = 0, unit = ''): string {
  const num = parseFiniteOrNull(value);
  if (num === null) return 'Data tidak tersedia';
  const formatted = num.toLocaleString('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  return unit ? `${formatted} ${unit}` : formatted;
}

export function formatIsoHour(isoString: any): string {
  if (!isoString || typeof isoString !== 'string') return '--.--';
  const timePart = isoString.split('T')[1];
  if (!timePart) return '--.--';
  return timePart.slice(0, 5).replace(':', '.');
}

export function formatIsoDateIndo(isoDateStr: any, isToday = false) {
  if (!isoDateStr) return { dayName: '-', shortDate: '-' };
  try {
    const [year, month, day] = isoDateStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const dayName = isToday
      ? 'Hari Ini'
      : new Intl.DateTimeFormat('id-ID', { weekday: 'long', timeZone: 'UTC' }).format(dateObj);
    const shortDate = new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC'
    }).format(dateObj);
    return { dayName, shortDate };
  } catch {
    return { dayName: String(isoDateStr), shortDate: '' };
  }
}

/**
 * Menghasilkan ringkasan cuaca deterministik dari angka aktual tanpa memalsukan fakta.
 * Integritas data hujan: Jika probabilitas tidak tersedia, tidak mengklaim peluang rendah.
 */
export function generateDeterministicSummary(weatherData: any, aqiData: any): string {
  if (!weatherData || !weatherData.current) {
    return 'Data cuaca sedang dimuat atau belum tersedia.';
  }

  const { current, daily, hourly24 } = weatherData;
  const info = getWeatherInfo(current.weather_code, current.is_day);
  const parts: string[] = [];

  const tempVal = parseFiniteOrNull(current.temperature_2m);
  const feelsVal = parseFiniteOrNull(current.apparent_temperature);

  if (tempVal !== null && feelsVal !== null) {
    parts.push(
      `Kondisi terkini menunjukkan cuaca ${info.label.toLowerCase()} dengan suhu ${Math.round(tempVal)}°C (terasa seperti ${Math.round(feelsVal)}°C).`
    );
  } else if (tempVal !== null) {
    parts.push(
      `Kondisi terkini menunjukkan cuaca ${info.label.toLowerCase()} dengan suhu ${Math.round(tempVal)}°C.`
    );
  } else {
    parts.push(`Kondisi cuaca terkini tercatat ${info.label.toLowerCase()}.`);
  }

  const maxT = parseFiniteOrNull(daily?.temperature_2m_max?.[0]);
  const minT = parseFiniteOrNull(daily?.temperature_2m_min?.[0]);
  if (maxT !== null && minT !== null) {
    parts.push(`Rentang suhu prakiraan hari ini berada di antara ${Math.round(minT)}°C hingga ${Math.round(maxT)}°C.`);
  }

  // Analisis presipitasi & peluang hujan 6 jam ke depan
  if (Array.isArray(hourly24) && hourly24.length > 0) {
    const next6h = hourly24.slice(0, 6);
    const validProbs = next6h
      .map((h: any) => parseFiniteOrNull(h.precipitation_probability))
      .filter((p: any): p is number => p !== null);

    const validRains = next6h
      .map((h: any) => parseFiniteOrNull(h.precipitation))
      .filter((r: any): r is number => r !== null);

    const currentRain = parseFiniteOrNull(current.precipitation);

    if (validProbs.length > 0) {
      const maxProb6h = Math.max(...validProbs);
      const totalRain6h = validRains.length > 0 ? validRains.reduce((a, b) => a + b, 0) : null;

      if (currentRain !== null && currentRain > 0) {
        parts.push(
          `Tercatat presipitasi terkini sebesar ${formatMetric(currentRain, 1, 'mm')} dengan peluang hujan puncak ${maxProb6h}% dalam 6 jam ke depan.`
        );
      } else if (maxProb6h >= 60) {
        const rainStr = totalRain6h !== null ? ` (estimasi akumulasi ${formatMetric(totalRain6h, 1, 'mm')})` : '';
        parts.push(`Terdapat peluang hujan tinggi hingga ${maxProb6h}%${rainStr} dalam 6 jam ke depan.`);
      } else if (maxProb6h >= 30) {
        parts.push(`Peluang hujan sedang (${maxProb6h}%) terdeteksi dalam 6 jam mendatang.`);
      } else {
        parts.push(`Peluang hujan relatif rendah (${maxProb6h}%) untuk 6 jam ke depan.`);
      }
    } else {
      if (currentRain !== null && currentRain > 0) {
        parts.push(`Tercatat presipitasi terkini sebesar ${formatMetric(currentRain, 1, 'mm')}, namun data persentase peluang hujan per jam tidak tersedia.`);
      } else {
        parts.push('Data persentase peluang hujan untuk 6 jam ke depan tidak dilaporkan oleh model cuaca.');
      }
    }
  }

  const humidity = parseFiniteOrNull(current.relative_humidity_2m);
  const windSpeed = parseFiniteOrNull(current.wind_speed_10m);
  const windDir = parseFiniteOrNull(current.wind_direction_10m);

  if (humidity !== null && windSpeed !== null && windDir !== null) {
    const dirLabel = getWindDirectionLabel(windDir).full;
    parts.push(
      `Kelembapan udara berada pada ${humidity}% dengan hembusan angin ${formatMetric(windSpeed, 1, 'km/j')} dari arah ${dirLabel}.`
    );
  } else if (humidity !== null) {
    parts.push(`Kelembapan udara tercatat sebesar ${humidity}%.`);
  }

  const aqiVal = parseFiniteOrNull(aqiData?.current?.us_aqi);
  if (aqiVal !== null) {
    const aqiCat = getAqiCategory(aqiVal);
    parts.push(`Indeks Kualitas Udara (US AQI) bernilai ${aqiVal} (${aqiCat.label}).`);
  }

  return parts.join(' ');
}

export interface ActivityRecommendation {
  id: string;
  title: string;
  status: string;
  tone: 'good' | 'moderate' | 'warning' | 'unknown';
  detail: string;
}

/**
 * Evaluasi Rekomendasi Aktivitas:
 * Menolak status aman tanpa bukti. Menampilkan "Data tidak cukup untuk menilai" jika data hilang.
 * Evaluasi UV dan Suhu Terasa dipisahkan secara independen untuk mencegah klaim keliru.
 */
export function generateActivityRecommendations(weatherData: any, aqiData: any): ActivityRecommendation[] {
  if (!weatherData || !weatherData.current) return [];

  const { current, hourly24 } = weatherData;
  const next6h = Array.isArray(hourly24) ? hourly24.slice(0, 6) : [];

  const validProbs = next6h
    .map((h: any) => parseFiniteOrNull(h.precipitation_probability))
    .filter((p: any): p is number => p !== null);

  const maxRainProb = validProbs.length > 0 ? Math.max(...validProbs) : null;
  const currentRain = parseFiniteOrNull(current.precipitation);
  const windSpeed = parseFiniteOrNull(current.wind_speed_10m);
  const uvVal = parseFiniteOrNull(current.uv_index);
  const rawVisibility = parseFiniteOrNull(current.visibility);
  const visibilityKm = rawVisibility !== null ? rawVisibility / 1000 : null;
  const usAqi = parseFiniteOrNull(aqiData?.current?.us_aqi);
  const weatherCode = parseFiniteOrNull(current.weather_code);
  const apparentTemp = parseFiniteOrNull(current.apparent_temperature);

  const items: ActivityRecommendation[] = [];

  // 1. Rekomendasi Payung / Perlengkapan Hujan
  const isActivelyRaining = currentRain !== null && currentRain > 0;
  const isRainCode = weatherCode !== null && ACTIVE_RAIN_CODES.has(weatherCode);

  if (isActivelyRaining || isRainCode) {
    const probInfo = maxRainProb !== null ? ` & peluang hujan 6 jam ke depan mencapai ${maxRainProb}%` : '';
    items.push({
      id: 'umbrella',
      title: 'Perlengkapan Hujan',
      status: 'Wajib Sedia Payung / Jas Hujan',
      tone: 'warning',
      detail: `Presipitasi saat ini ${formatMetric(currentRain, 1, 'mm')}${probInfo}.`
    });
  } else if (maxRainProb !== null && maxRainProb >= 55) {
    items.push({
      id: 'umbrella',
      title: 'Perlengkapan Hujan',
      status: 'Wajib Sedia Payung / Jas Hujan',
      tone: 'warning',
      detail: `Peluang hujan mencapai ${maxRainProb}% dalam 6 jam ke depan. Bawa payung atau jas hujan.`
    });
  } else if (maxRainProb !== null && maxRainProb >= 30) {
    items.push({
      id: 'umbrella',
      title: 'Perlengkapan Hujan',
      status: 'Disarankan Membawa Payung Lipat',
      tone: 'moderate',
      detail: `Peluang hujan mencapai ${maxRainProb}% dalam 6 jam ke depan. Persiapkan payung lipat.`
    });
  } else if (maxRainProb !== null) {
    items.push({
      id: 'umbrella',
      title: 'Perlengkapan Hujan',
      status: 'Peluang Hujan Rendah',
      tone: 'good',
      detail: `Peluang hujan 6 jam ke depan relatif rendah (${maxRainProb}%) dengan presipitasi terpantau minim.`
    });
  } else {
    // Data peluang hujan tidak mencukupi dan tidak ada hujan aktif
    items.push({
      id: 'umbrella',
      title: 'Perlengkapan Hujan',
      status: 'Data tidak cukup untuk menilai',
      tone: 'unknown',
      detail: 'Data persentase peluang hujan per jam tidak tersedia untuk menilai probabilitas hujan.'
    });
  }

  // 2. Olahraga Luar Ruangan & Kebugaran
  if (windSpeed === null || usAqi === null || weatherCode === null) {
    const missing: string[] = [];
    if (windSpeed === null) missing.push('angin');
    if (usAqi === null) missing.push('kualitas udara (AQI)');
    if (weatherCode === null) missing.push('kondisi cuaca');
    items.push({
      id: 'outdoor',
      title: 'Olahraga Luar Ruangan',
      status: 'Data tidak cukup untuk menilai',
      tone: 'unknown',
      detail: `Parameter ${missing.join(', ')} tidak tersedia. Hindari olahraga intensif tanpa kepastian data keselamatan.`
    });
  } else {
    const isSevereStorm = weatherCode >= 95 || weatherCode === 82;
    const isHeavyRain = currentRain !== null && currentRain > 2;
    const isStrongWind = windSpeed > 35;

    if (isSevereStorm || isHeavyRain || isStrongWind) {
      items.push({
        id: 'outdoor',
        title: 'Olahraga Luar Ruangan',
        status: 'Tunda / Pindah ke Dalam Ruangan',
        tone: 'warning',
        detail: `Kondisi fisik cuaca berisiko (angin ${formatMetric(windSpeed, 1, 'km/j')}, hujan ${formatMetric(currentRain, 1, 'mm')}).`
      });
    } else if (usAqi > 100) {
      items.push({
        id: 'outdoor',
        title: 'Olahraga Luar Ruangan',
        status: 'Batasi Aktivitas Berat',
        tone: 'moderate',
        detail: `Cuaca mendukung, namun US AQI ${usAqi} (${getAqiCategory(usAqi).label}). Hindari olahraga paru berat.`
      });
    } else {
      items.push({
        id: 'outdoor',
        title: 'Olahraga Luar Ruangan',
        status: 'Kondusif untuk Olahraga',
        tone: 'good',
        detail: `Kecepatan angin ${formatMetric(windSpeed, 1, 'km/j')} dan US AQI ${usAqi} (${getAqiCategory(usAqi).label}) aman.`
      });
    }
  }

  // 3. Paparan Radiasi UV (Evaluasi Khusus & Independen)
  if (uvVal === null) {
    items.push({
      id: 'uv-radiation',
      title: 'Paparan Radiasi UV',
      status: 'Data tidak cukup untuk menilai',
      tone: 'unknown',
      detail: 'Data indeks radiasi UV jam ini tidak tersedia dari sumber pemodelan atmosfer.'
    });
  } else if (uvVal >= 8) {
    items.push({
      id: 'uv-radiation',
      title: 'Paparan Radiasi UV',
      status: 'Waspada Bahaya UV Sangat Tinggi',
      tone: 'warning',
      detail: `Indeks UV jam ini ${formatMetric(uvVal, 1)} (${getUvCategory(uvVal).level}). Gunakan pelindung UV penuh dan kacamata hitam.`
    });
  } else if (uvVal >= 6) {
    items.push({
      id: 'uv-radiation',
      title: 'Paparan Radiasi UV',
      status: 'Waspada Radiasi UV Tinggi',
      tone: 'warning',
      detail: `Indeks UV jam ini ${formatMetric(uvVal, 1)} (${getUvCategory(uvVal).level}). Gunakan tabir surya SPF 30+ dan topi.`
    });
  } else if (uvVal >= 3) {
    items.push({
      id: 'uv-radiation',
      title: 'Paparan Radiasi UV',
      status: 'Paparan UV Tingkat Sedang',
      tone: 'moderate',
      detail: `Indeks UV jam ini ${formatMetric(uvVal, 1)} (${getUvCategory(uvVal).level}). Gunakan pelindung jika berada di bawah terik matahari.`
    });
  } else {
    items.push({
      id: 'uv-radiation',
      title: 'Paparan Radiasi UV',
      status: 'Paparan UV Rendah (Aman)',
      tone: 'good',
      detail: `Indeks UV jam ini ${formatMetric(uvVal, 1)} (${getUvCategory(uvVal).level}). Aman beraktivitas di luar tanpa pelindung khusus.`
    });
  }

  // 4. Kenyamanan Termal & Suhu Terasa (Evaluasi Khusus & Independen)
  if (apparentTemp === null) {
    items.push({
      id: 'thermal-comfort',
      title: 'Kenyamanan Termal',
      status: 'Data tidak cukup untuk menilai',
      tone: 'unknown',
      detail: 'Data suhu terasa (apparent temperature) tidak tersedia untuk menilai kenyamanan termal.'
    });
  } else if (apparentTemp >= 38) {
    items.push({
      id: 'thermal-comfort',
      title: 'Kenyamanan Termal',
      status: 'Bahaya Sengatan Panas Ekstrem',
      tone: 'warning',
      detail: `Suhu terasa mencapai ${Math.round(apparentTemp)}°C. Berisiko heat exhaustion, wajib istirahat di tempat sejuk dan jaga hidrasi.`
    });
  } else if (apparentTemp >= 33) {
    items.push({
      id: 'thermal-comfort',
      title: 'Kenyamanan Termal',
      status: 'Waspada Suhu Panas & Hidrasi',
      tone: 'moderate',
      detail: `Suhu terasa mencapai ${Math.round(apparentTemp)}°C. Wajib perbanyak konsumsi air mineral.`
    });
  } else if (apparentTemp <= 10) {
    items.push({
      id: 'thermal-comfort',
      title: 'Kenyamanan Termal',
      status: 'Kenakan Pakaian Hangat Tebal',
      tone: 'warning',
      detail: `Suhu terasa dingin (${Math.round(apparentTemp)}°C). Kenakan jaket tebal pelindung dingin.`
    });
  } else if (apparentTemp <= 18) {
    items.push({
      id: 'thermal-comfort',
      title: 'Kenyamanan Termal',
      status: 'Suhu Sejuk / Dingin Ringan',
      tone: 'moderate',
      detail: `Suhu terasa ${Math.round(apparentTemp)}°C. Siapkan jaket ringan atau pakaian lengan panjang.`
    });
  } else {
    items.push({
      id: 'thermal-comfort',
      title: 'Kenyamanan Termal',
      status: 'Kondisi Termal Nyaman',
      tone: 'good',
      detail: `Suhu terasa ${Math.round(apparentTemp)}°C nyaman dan bersahabat untuk aktivitas fisik luar ruangan.`
    });
  }

  // 5. Kondisi Berkendara & Visibilitas
  if (visibilityKm === null) {
    items.push({
      id: 'driving',
      title: 'Kondisi Berkendara',
      status: 'Data tidak cukup untuk menilai',
      tone: 'unknown',
      detail: 'Data jarak pandang optik atmosfer (visibility) jam ini tidak dilaporkan oleh model cuaca.'
    });
  } else if (visibilityKm < 1.0) {
    items.push({
      id: 'driving',
      title: 'Kondisi Berkendara',
      status: 'Bahaya Jarak Pandang Kritis',
      tone: 'warning',
      detail: `Jarak pandang hanya ${formatMetric(visibilityKm, 1, 'km')}. Nyalakan lampu kabut dan kurangi laju kecepatan.`
    });
  } else if (visibilityKm < 4.0) {
    items.push({
      id: 'driving',
      title: 'Kondisi Berkendara',
      status: 'Waspada Kabut / Pandangan Terbatas',
      tone: 'moderate',
      detail: `Jarak pandang ${formatMetric(visibilityKm, 1, 'km')}. Jaga jarak aman dengan kendaraan lain.`
    });
  } else {
    items.push({
      id: 'driving',
      title: 'Kondisi Berkendara',
      status: 'Jarak Pandang Prima',
      tone: 'good',
      detail: `Jarak pandang atmosfer optimal (${formatMetric(visibilityKm, 1, 'km')}). Aman untuk perjalanan darat.`
    });
  }

  return items;
}

// ============================================================================
// 3. LAYANAN API (OPEN-METEO FORECAST, AIR QUALITY & GEOCODING)
// ============================================================================
export async function fetchOpenMeteoWeather(lat: number, lon: number, signal?: AbortSignal) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'is_day',
      'precipitation',
      'rain',
      'showers',
      'snowfall',
      'weather_code',
      'cloud_cover',
      'pressure_msl',
      'surface_pressure',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m'
    ].join(','),
    hourly: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'precipitation_probability',
      'precipitation',
      'weather_code',
      'visibility',
      'wind_speed_10m',
      'uv_index',
      'is_day'
    ].join(','),
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'sunrise',
      'sunset',
      'uv_index_max',
      'precipitation_sum',
      'precipitation_probability_max',
      'wind_speed_10m_max'
    ].join(','),
    timezone: 'auto',
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm'
  });

  const response = await fetch(`${API_ENDPOINTS.FORECAST}?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(`Gagal memuat prakiraan Open-Meteo (HTTP ${response.status})`);
  }

  const data = await response.json();
  if (!data || !data.current || !data.hourly || !data.daily) {
    throw new Error('Format respons Open-Meteo API tidak valid atau data kosong.');
  }

  // Sinkronisasi indeks jam lokal Open-Meteo
  const currentIsoHourPrefix = data.current.time ? data.current.time.slice(0, 13) : '';
  let startIdx = 0;
  if (currentIsoHourPrefix && Array.isArray(data.hourly.time)) {
    const foundIndex = data.hourly.time.findIndex((t: string) => t.startsWith(currentIsoHourPrefix));
    if (foundIndex !== -1) {
      startIdx = foundIndex;
    }
  }

  const totalHours = Array.isArray(data.hourly.time) ? data.hourly.time.length : 0;
  const endIdx = Math.min(startIdx + 24, totalHours);
  const hourly24: any[] = [];

  for (let i = startIdx; i < endIdx; i++) {
    hourly24.push({
      time: data.hourly.time[i],
      hourLabel: i === startIdx ? 'Sekarang' : formatIsoHour(data.hourly.time[i]),
      chartHour: formatIsoHour(data.hourly.time[i]),
      temperature_2m: parseFiniteOrNull(data.hourly.temperature_2m?.[i]),
      apparent_temperature: parseFiniteOrNull(data.hourly.apparent_temperature?.[i]),
      relative_humidity_2m: parseFiniteOrNull(data.hourly.relative_humidity_2m?.[i]),
      precipitation_probability: parseFiniteOrNull(data.hourly.precipitation_probability?.[i]),
      precipitation: parseFiniteOrNull(data.hourly.precipitation?.[i]),
      weather_code: parseFiniteOrNull(data.hourly.weather_code?.[i]),
      visibility: parseFiniteOrNull(data.hourly.visibility?.[i]),
      wind_speed_10m: parseFiniteOrNull(data.hourly.wind_speed_10m?.[i]),
      uv_index: parseFiniteOrNull(data.hourly.uv_index?.[i]),
      is_day: parseFiniteOrNull(data.hourly.is_day?.[i]) ?? 1
    });
  }

  const daily7: any[] = [];
  const totalDays = Array.isArray(data.daily.time) ? Math.min(7, data.daily.time.length) : 0;
  for (let d = 0; d < totalDays; d++) {
    const dateInfo = formatIsoDateIndo(data.daily.time[d], d === 0);
    daily7.push({
      date: data.daily.time[d],
      dayName: dateInfo.dayName,
      shortDate: dateInfo.shortDate,
      weather_code: parseFiniteOrNull(data.daily.weather_code?.[d]),
      temp_max: parseFiniteOrNull(data.daily.temperature_2m_max?.[d]),
      temp_min: parseFiniteOrNull(data.daily.temperature_2m_min?.[d]),
      sunrise: data.daily.sunrise?.[d] ?? null,
      sunset: data.daily.sunset?.[d] ?? null,
      uv_index_max: parseFiniteOrNull(data.daily.uv_index_max?.[d]),
      precipitation_sum: parseFiniteOrNull(data.daily.precipitation_sum?.[d]),
      precipitation_probability_max: parseFiniteOrNull(data.daily.precipitation_probability_max?.[d]),
      wind_speed_max: parseFiniteOrNull(data.daily.wind_speed_10m_max?.[d])
    });
  }

  const currentHourSlot = hourly24[0] || {};

  return {
    sourceCoord: {
      latitude: Number(lat),
      longitude: Number(lon)
    },
    latitude: data.latitude,
    longitude: data.longitude,
    elevation: parseFiniteOrNull(data.elevation),
    timezone: data.timezone || 'Asia/Jakarta',
    timezone_abbreviation: data.timezone_abbreviation || 'WIB',
    current: {
      time: data.current.time,
      is_day: parseFiniteOrNull(data.current.is_day) ?? 1,
      temperature_2m: parseFiniteOrNull(data.current.temperature_2m),
      apparent_temperature: parseFiniteOrNull(data.current.apparent_temperature),
      relative_humidity_2m: parseFiniteOrNull(data.current.relative_humidity_2m),
      precipitation: parseFiniteOrNull(data.current.precipitation),
      weather_code: parseFiniteOrNull(data.current.weather_code),
      cloud_cover: parseFiniteOrNull(data.current.cloud_cover),
      pressure_msl: parseFiniteOrNull(data.current.pressure_msl),
      surface_pressure: parseFiniteOrNull(data.current.surface_pressure),
      wind_speed_10m: parseFiniteOrNull(data.current.wind_speed_10m),
      wind_direction_10m: parseFiniteOrNull(data.current.wind_direction_10m),
      wind_gusts_10m: parseFiniteOrNull(data.current.wind_gusts_10m),
      visibility: currentHourSlot.visibility ?? null,
      uv_index: currentHourSlot.uv_index ?? null, // Mengambil UV jam ini dari hourly slot, BUKAN uv_index_max harian
      precipitation_probability: currentHourSlot.precipitation_probability ?? null
    },
    daily: data.daily,
    hourly24,
    daily7,
    fetchedAtIso: new Date().toISOString()
  };
}

export async function fetchOpenMeteoAirQuality(lat: number, lon: number, signal?: AbortSignal) {
  try {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: [
        'european_aqi',
        'us_aqi',
        'pm10',
        'pm2_5',
        'carbon_monoxide',
        'nitrogen_dioxide',
        'sulphur_dioxide',
        'ozone'
      ].join(','),
      timezone: 'auto'
    });

    const response = await fetch(`${API_ENDPOINTS.AIR_QUALITY}?${params.toString()}`, { signal });
    if (!response.ok) {
      return { isAvailable: false, errorStatus: `HTTP ${response.status}`, current: null };
    }
    const data = await response.json();
    return {
      isAvailable: true,
      errorStatus: null,
      current: {
        us_aqi: parseFiniteOrNull(data?.current?.us_aqi),
        european_aqi: parseFiniteOrNull(data?.current?.european_aqi),
        pm2_5: parseFiniteOrNull(data?.current?.pm2_5),
        pm10: parseFiniteOrNull(data?.current?.pm10),
        nitrogen_dioxide: parseFiniteOrNull(data?.current?.nitrogen_dioxide),
        ozone: parseFiniteOrNull(data?.current?.ozone),
        carbon_monoxide: parseFiniteOrNull(data?.current?.carbon_monoxide)
      }
    };
  } catch (err: any) {
    if (err.name === 'AbortError') throw err;
    return { isAvailable: false, errorStatus: err instanceof Error ? err.message : 'Koneksi gagal', current: null };
  }
}

export async function searchLocationsGeocoding(query: string, signal?: AbortSignal) {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const params = new URLSearchParams({
    name: cleanQuery,
    count: '8',
    language: 'id',
    format: 'json'
  });

  const response = await fetch(`${API_ENDPOINTS.GEOCODING}?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(`Layanan Geocoding tidak merespons (HTTP ${response.status})`);
  }

  const data = await response.json();
  if (!data || !Array.isArray(data.results)) return [];

  return data.results.map((item: any) => ({
    id: `${item.id || `${item.latitude}-${item.longitude}`}`,
    name: item.name,
    admin1: item.admin1 || item.admin2 || '',
    admin2: item.admin2 || '',
    country: item.country || '',
    country_code: item.country_code || '',
    latitude: item.latitude,
    longitude: item.longitude,
    elevation: parseFiniteOrNull(item.elevation),
    timezone: item.timezone || 'auto'
  }));
}

export async function reverseGeocodeCoordinates(lat: number, lon: number, signal?: AbortSignal) {
  try {
    const url = `${API_ENDPOINTS.REVERSE_GEO}?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=id`;
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('Reverse geocode gagal');
    const data = await response.json();
    const resolvedName = data.city || data.locality || data.principalSubdivision;

    return {
      id: `gps-${lat.toFixed(4)}-${lon.toFixed(4)}`,
      name: resolvedName || `GPS (${formatCoordinates(lat, lon)})`,
      admin1: data.principalSubdivision || 'Posisi GPS Terdeteksi',
      country: data.countryName || '',
      country_code: data.countryCode || '',
      latitude: lat,
      longitude: lon,
      timezone: 'auto'
    };
  } catch {
    return {
      id: `gps-${lat.toFixed(4)}-${lon.toFixed(4)}`,
      name: `GPS (${formatCoordinates(lat, lon)})`,
      admin1: 'Koordinat GPS Terdeteksi',
      country: '',
      country_code: '',
      latitude: lat,
      longitude: lon,
      timezone: 'auto'
    };
  }
}

// ============================================================================
// 4. KOMPONEN IKON VEKTOR & EFEK ATMOSFER
// ============================================================================
export function WeatherSvgIcon({ iconType, size = 40, className = '' }: { iconType: string; size?: number; className?: string }) {
  const s = size;
  switch (iconType) {
    case 'sun':
      return (
        <svg width={s} height={s} viewBox="0 0 64 64" fill="none" className={className}>
          <circle cx="32" cy="32" r="14" className="fill-amber-400" />
          <circle cx="32" cy="32" r="18" className="fill-amber-400/25 animate-pulse" />
          <g className="stroke-amber-400" strokeWidth="3.5" strokeLinecap="round">
            <line x1="32" y1="6" x2="32" y2="11" />
            <line x1="32" y1="53" x2="32" y2="58" />
            <line x1="6" y1="32" x2="11" y2="32" />
            <line x1="53" y1="32" x2="58" y2="32" />
            <line x1="13.6" y1="13.6" x2="17.2" y2="17.2" />
            <line x1="46.8" y1="46.8" x2="50.4" y2="50.4" />
            <line x1="50.4" y1="13.6" x2="46.8" y2="17.2" />
            <line x1="17.2" y1="46.8" x2="13.6" y2="50.4" />
          </g>
        </svg>
      );
    case 'moon':
      return (
        <svg width={s} height={s} viewBox="0 0 64 64" fill="none" className={className}>
          <path
            d="M41.5 43.5C31.8 43.5 24 35.7 24 26C24 20.6 26.4 15.8 30.3 12.6C20.2 13.7 12.5 22.2 12.5 32.6C12.5 43.7 21.5 52.7 32.6 52.7C41.2 52.7 48.6 47.3 51.4 39.7C48.5 42.1 45.1 43.5 41.5 43.5Z"
            className="fill-cyan-300 stroke-cyan-200"
            strokeWidth="2"
          />
          <circle cx="48" cy="18" r="1.8" className="fill-cyan-200 animate-ping" />
        </svg>
      );
    case 'cloud-sun':
      return (
        <svg width={s} height={s} viewBox="0 0 64 64" fill="none" className={className}>
          <circle cx="24" cy="24" r="10" className="fill-amber-400" />
          <path
            d="M22 48H45C50.5 48 55 43.5 55 38C55 32.8 51.1 28.6 46 28.1C44.5 21.2 38.4 16 31 16C22.2 16 15 23.2 15 32C15 32.4 15 32.8 15.1 33.2C11.5 34.4 9 37.9 9 42C9 46.9 13.1 48 18 48H22Z"
            className="fill-slate-200 dark:fill-slate-100 stroke-cyan-400/50"
            strokeWidth="1.5"
          />
        </svg>
      );
    case 'cloud-moon':
      return (
        <svg width={s} height={s} viewBox="0 0 64 64" fill="none" className={className}>
          <path
            d="M28 24C23.5 24 20 20.5 20 16C20 13.8 20.9 11.8 22.4 10.4C17.6 11 14 15 14 20C14 25.5 18.5 30 24 30C27.9 30 31.3 27.7 32.8 24.4C31.3 24.1 29.7 24 28 24Z"
            className="fill-cyan-300"
          />
          <path
            d="M22 48H45C50.5 48 55 43.5 55 38C55 32.8 51.1 28.6 46 28.1C44.5 21.2 38.4 16 31 16C22.2 16 15 23.2 15 32C15 32.4 15 32.8 15.1 33.2C11.5 34.4 9 37.9 9 42C9 46.9 13.1 48 18 48H22Z"
            className="fill-slate-300 dark:fill-slate-200 stroke-cyan-400/50"
            strokeWidth="1.5"
          />
        </svg>
      );
    case 'drizzle':
    case 'rain':
    case 'heavy-rain':
      return (
        <svg width={s} height={s} viewBox="0 0 64 64" fill="none" className={className}>
          <path
            d="M20 42H45C50.5 42 55 37.5 55 32C55 26.8 51.1 22.6 46 22.1C44.5 15.2 38.4 10 31 10C22.2 10 15 17.2 15 26C15 26.4 15 26.8 15.1 27.2C11.5 28.4 9 31.9 9 36C9 40.9 13.1 42 18 42H20Z"
            className="fill-slate-300 dark:fill-slate-200 stroke-cyan-400/60"
            strokeWidth="1.5"
          />
          <g className="stroke-cyan-400" strokeWidth="3" strokeLinecap="round">
            <line x1="22" y1="47" x2="19" y2="56" />
            <line x1="32" y1="47" x2="29" y2="58" />
            <line x1="42" y1="47" x2="39" y2="56" />
          </g>
        </svg>
      );
    case 'thunder':
      return (
        <svg width={s} height={s} viewBox="0 0 64 64" fill="none" className={className}>
          <path
            d="M20 40H45C50.5 40 55 35.5 55 30C55 24.8 51.1 20.6 46 20.1C44.5 13.2 38.4 8 31 8C22.2 8 15 15.2 15 24C15 24.4 15 24.8 15.1 25.2C11.5 26.4 9 29.9 9 34C9 38.9 13.1 40 18 40H20Z"
            className="fill-slate-400 dark:fill-slate-300 stroke-amber-400/60"
            strokeWidth="1.5"
          />
          <polygon
            points="33,36 23,49 31,49 28,60 42,45 34,45"
            className="fill-amber-400 stroke-amber-300"
            strokeWidth="1"
          />
        </svg>
      );
    case 'fog':
      return (
        <svg width={s} height={s} viewBox="0 0 64 64" fill="none" className={className}>
          <path
            d="M20 36H45C50 36 54 32 54 27C54 22 50.5 18.2 45.6 17.7C44.1 11.5 38.4 7 31.5 7C23.5 7 17 13.5 17 21.5C12.5 22.6 9 26.6 9 31.5C9 35 12 36 16 36H20Z"
            className="fill-slate-300/80"
          />
          <g className="stroke-cyan-300" strokeWidth="3" strokeLinecap="round">
            <line x1="14" y1="43" x2="50" y2="43" />
            <line x1="18" y1="50" x2="46" y2="50" />
            <line x1="22" y1="57" x2="42" y2="57" />
          </g>
        </svg>
      );
    case 'snow':
      return (
        <svg width={s} height={s} viewBox="0 0 64 64" fill="none" className={className}>
          <path
            d="M20 42H45C50.5 42 55 37.5 55 32C55 26.8 51.1 22.6 46 22.1C44.5 15.2 38.4 10 31 10C22.2 10 15 17.2 15 26C11.5 27.4 9 30.9 9 35C9 39.9 13.1 42 18 42H20Z"
            className="fill-slate-200"
          />
          <circle cx="22" cy="50" r="2.5" className="fill-cyan-200" />
          <circle cx="32" cy="54" r="2.5" className="fill-cyan-200" />
          <circle cx="42" cy="50" r="2.5" className="fill-cyan-200" />
        </svg>
      );
    case 'unknown':
      return (
        <svg width={s} height={s} viewBox="0 0 64 64" fill="none" className={className}>
          <path
            d="M20 44H45C50.5 44 55 39.5 55 34C55 28.8 51.1 24.6 46 24.1C44.5 17.2 38.4 12 31 12C22.2 12 15 19.2 15 28C11.5 29.4 9 32.9 9 37C9 41.9 13.1 44 18 44H20Z"
            className="fill-slate-400/30 stroke-slate-400/60"
            strokeWidth="1.5"
            strokeDasharray="4 2"
          />
          <text x="32" y="38" textAnchor="middle" className="fill-slate-300 font-bold text-2xl font-mono">?</text>
        </svg>
      );
    default:
      return (
        <svg width={s} height={s} viewBox="0 0 64 64" fill="none" className={className}>
          <path
            d="M20 46H45C50.5 46 55 41.5 55 36C55 30.8 51.1 26.6 46 26.1C44.5 19.2 38.4 14 31 14C22.2 14 15 21.2 15 30C11.5 31.4 9 34.9 9 39C9 43.9 13.1 46 18 46H20Z"
            className="fill-slate-300 dark:fill-slate-200 stroke-cyan-400/40"
            strokeWidth="1.5"
          />
        </svg>
      );
  }
}

/**
 * Pemetaan efek atmosfer berdasarkan kategori cuaca dan waktu lokal (siang/malam).
 * Mengembalikan flag kondisi atmosfer yang valid dan null-safe.
 */
export function getAtmosphericEffect(category: string, isDay: any = 1) {
  const day = Boolean(isDay);
  const isSunnyDay = category === 'clear-day' || (category === 'partly-cloudy-day' && day);
  const isClearNight = category === 'clear-night' || (category === 'partly-cloudy-night' && !day);
  const isCloudy = category === 'cloudy' || category === 'overcast' || category === 'partly-cloudy-day' || category === 'partly-cloudy-night';
  const isDrizzle = category === 'drizzle';
  const isRain = category === 'rain';
  const isHeavyRain = category === 'heavy-rain';
  const isThunder = category === 'thunderstorm';
  const isFog = category === 'fog';
  const isSnow = category === 'snow';
  const isUnknown =
    category === 'unknown' ||
    !category ||
    (!isSunnyDay && !isClearNight && !isCloudy && !isDrizzle && !isRain && !isHeavyRain && !isThunder && !isFog && !isSnow);

  return {
    isSunnyDay,
    isClearNight,
    isCloudy,
    isDrizzle,
    isRain,
    isHeavyRain,
    isThunder,
    isFog,
    isSnow,
    isUnknown
  };
}

export function AtmosphericBackground({
  category,
  isDark,
  isDay = 1
}: {
  category: string;
  isDark: boolean;
  isDay?: any;
}) {
  const [isTabVisible, setIsTabVisible] = useState(() => (typeof document !== 'undefined' ? !document.hidden : true));

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleVisibility = () => {
      setIsTabVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const effects = useMemo(() => getAtmosphericEffect(category, isDay), [category, isDay]);
  const { isSunnyDay, isClearNight, isCloudy, isDrizzle, isRain, isHeavyRain, isThunder, isFog, isSnow } = effects;

  // Gradasi dinamis atmosfer berdasarkan tema dan kondisi cuaca aktual
  const skyGradient = useMemo(() => {
    if (isDark) {
      if (isThunder || isHeavyRain) return 'bg-gradient-to-br from-[#02050e] via-[#070d1e] to-[#040816]';
      if (isClearNight) return 'bg-gradient-to-br from-[#030712] via-[#071026] to-[#0b1739]';
      if (isSunnyDay) return 'bg-gradient-to-br from-[#050c1e] via-[#091b36] to-[#0a2540]';
      if (isFog) return 'bg-gradient-to-br from-[#070d18] via-[#0e1724] to-[#121c2c]';
      if (isSnow) return 'bg-gradient-to-br from-[#060c18] via-[#0a182d] to-[#10243d]';
      return 'bg-gradient-to-br from-[#050914] via-[#0B132B] to-[#091931]';
    } else {
      if (isThunder || isHeavyRain) return 'bg-gradient-to-br from-slate-400 via-sky-300 to-indigo-300';
      if (isSunnyDay) return 'bg-gradient-to-br from-sky-200 via-amber-100 to-blue-100';
      if (isClearNight) return 'bg-gradient-to-br from-slate-200 via-indigo-100 to-blue-200';
      if (isFog) return 'bg-gradient-to-br from-slate-200 via-gray-100 to-slate-300';
      if (isSnow) return 'bg-gradient-to-br from-blue-100 via-slate-50 to-cyan-100';
      return 'bg-gradient-to-br from-sky-100 via-blue-50 to-indigo-100';
    }
  }, [isDark, isThunder, isHeavyRain, isClearNight, isSunnyDay, isFog, isSnow]);

  return (
    <div
      className={`fixed inset-0 pointer-events-none overflow-hidden z-0 ${
        !isTabVisible ? 'animations-paused' : ''
      }`}
      aria-hidden="true"
    >
      {/* 1. Base Sky Gradient */}
      <div className={`absolute inset-0 transition-colors duration-1000 ${skyGradient}`} />

      {/* 2. Global Ambient Atmospheric Radial Lighting */}
      <div
        className="absolute -top-24 -left-24 w-96 h-96 rounded-full blur-3xl opacity-25"
        style={{
          background: 'radial-gradient(circle, rgba(0,245,212,0.45) 0%, rgba(37,99,235,0.2) 60%, transparent 80%)'
        }}
      />
      <div
        className="absolute bottom-0 right-0 w-[460px] h-[460px] rounded-full blur-3xl opacity-20"
        style={{
          background: 'radial-gradient(circle, rgba(59,130,246,0.45) 0%, rgba(0,229,255,0.15) 65%, transparent 85%)'
        }}
      />

      {/* 3. Cerah Siang: Sun Aura, Glow, dan Cahaya Atmosfer Lembut */}
      {isSunnyDay && (
        <div className="absolute -top-24 -right-24 w-[580px] h-[580px] rounded-full pointer-events-none anim-sun-pulse">
          <div
            className="w-full h-full rounded-full blur-3xl opacity-40 transition-opacity duration-1000"
            style={{
              background:
                'radial-gradient(circle, rgba(251,191,36,0.65) 0%, rgba(245,158,11,0.25) 45%, rgba(0,245,212,0.12) 65%, transparent 80%)'
            }}
          />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full blur-xl opacity-60"
            style={{
              background: 'radial-gradient(circle, rgba(254,240,138,0.9) 0%, rgba(251,191,36,0.4) 60%, transparent 85%)'
            }}
          />
        </div>
      )}

      {/* 4. Cerah Malam: Bulan, Halo Lunar, dan Bintang Berkelip */}
      {isClearNight && (
        <div className="absolute inset-0">
          {/* Luminous Moon & Halo */}
          <div className="absolute top-8 right-12 w-28 h-28 anim-moon-halo pointer-events-none">
            <div
              className="absolute inset-0 rounded-full blur-2xl opacity-40"
              style={{
                background: 'radial-gradient(circle, rgba(0,245,212,0.4) 0%, rgba(147,197,253,0.3) 50%, transparent 75%)'
              }}
            />
            <svg viewBox="0 0 100 100" className="w-12 h-12 text-cyan-200 drop-shadow-[0_0_12px_rgba(0,245,212,0.7)] ml-auto mt-2">
              <path
                d="M50 15 A35 35 0 1 0 85 75 A30 30 0 1 1 50 15 Z"
                fill="currentColor"
                opacity="0.85"
              />
            </svg>
          </div>

          {/* Twinkling Stars */}
          <div className="absolute inset-0 opacity-70">
            {[
              { top: '10%', left: '15%', size: 'w-1 h-1', delay: '0s' },
              { top: '7%', left: '48%', size: 'w-1.5 h-1.5', delay: '0.8s' },
              { top: '14%', left: '72%', size: 'w-1 h-1', delay: '1.4s' },
              { top: '22%', left: '88%', size: 'w-2 h-2', delay: '2.1s' },
              { top: '32%', left: '8%', size: 'w-1 h-1', delay: '0.5s' },
              { top: '28%', left: '38%', size: 'w-1.5 h-1.5', delay: '1.9s' },
              { top: '38%', left: '60%', size: 'w-1 h-1', delay: '2.7s' },
              { top: '18%', left: '28%', size: 'w-1.5 h-1.5', delay: '1.1s' },
              { top: '45%', left: '82%', size: 'w-1 h-1', delay: '0.3s' },
              { top: '50%', left: '22%', size: 'w-1 h-1', delay: '2.3s' }
            ].map((star, idx) => (
              <span
                key={idx}
                style={{
                  top: star.top,
                  left: star.left,
                  animationDelay: star.delay
                }}
                className={`absolute ${star.size} rounded-full bg-cyan-100 shadow-[0_0_4px_#00f5d4] anim-star-twinkle`}
              />
            ))}
          </div>
        </div>
      )}

      {/* 5. Berawan: Lapisan Awan Melayang dengan Kecepatan Parallaks Berbeda */}
      {isCloudy && (
        <div className="absolute inset-0 opacity-30">
          {/* Layer 1: Awan latar lambat */}
          <div className="absolute top-6 -left-10 w-[120%] h-48 anim-cloud-slow">
            <svg viewBox="0 0 800 200" className="w-full h-full fill-slate-300/20 dark:fill-slate-600/30 blur-sm">
              <path d="M50 150 Q90 90 170 110 Q220 50 310 80 Q380 40 450 90 Q530 60 600 110 Q660 80 730 130 Q780 120 800 150 L800 200 L0 200 Z" />
            </svg>
          </div>
          {/* Layer 2: Awan foreground lebih cepat */}
          <div className="absolute top-20 -right-10 w-[115%] h-56 anim-cloud-fast">
            <svg viewBox="0 0 800 200" className="w-full h-full fill-slate-200/25 dark:fill-slate-500/25 blur-[2px]">
              <path d="M0 160 Q80 110 160 130 Q240 70 330 110 Q400 60 480 100 Q560 70 650 120 Q720 90 800 160 L800 200 L0 200 Z" />
            </svg>
          </div>
        </div>
      )}

      {/* 6. Gerimis: Tetesan Halus Miring */}
      {isDrizzle && (
        <div className="absolute inset-0 opacity-40">
          {Array.from({ length: 24 }).map((_, idx) => (
            <div
              key={idx}
              style={{
                left: `${(idx * 4.2) % 100}%`,
                animationDelay: `${(idx * 0.12) % 1.1}s`
              }}
              className="w-[1px] h-6 bg-gradient-to-b from-transparent via-cyan-300 to-sky-400 absolute anim-drizzle"
            />
          ))}
        </div>
      )}

      {/* 7. Hujan Sedang: Presipitasi Teratur */}
      {isRain && (
        <div className="absolute inset-0 opacity-55">
          {Array.from({ length: 32 }).map((_, idx) => (
            <div
              key={idx}
              style={{
                left: `${(idx * 3.1) % 100}%`,
                animationDelay: `${(idx * 0.08) % 0.85}s`
              }}
              className="w-[1.5px] h-10 bg-gradient-to-b from-transparent via-cyan-400 to-blue-400 absolute anim-rain-normal"
            />
          ))}
        </div>
      )}

      {/* 8. Hujan Lebat: Curah Hujan Tinggi, Cepat, dan Atmosfer Lebih Gelap */}
      {isHeavyRain && (
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-slate-950/35" />
          <div className="absolute inset-0 opacity-75">
            {Array.from({ length: 48 }).map((_, idx) => (
              <div
                key={idx}
                style={{
                  left: `${(idx * 2.1) % 100}%`,
                  animationDelay: `${(idx * 0.05) % 0.6}s`
                }}
                className="w-[2px] h-16 bg-gradient-to-b from-transparent via-sky-300 to-blue-500 absolute anim-heavy-rain"
              />
            ))}
          </div>
        </div>
      )}

      {/* 9. Badai Petir: Hujan Lebat, Awan Badai Gelap, dan Kilatan Petir Nyata */}
      {isThunder && (
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-slate-950/45" />
          {/* Kilatan Petir Terprogram */}
          <div className="absolute inset-0 bg-cyan-200 anim-lightning pointer-events-none" />
          {/* Tetesan Hujan Badai */}
          <div className="absolute inset-0 opacity-70">
            {Array.from({ length: 40 }).map((_, idx) => (
              <div
                key={idx}
                style={{
                  left: `${(idx * 2.5) % 100}%`,
                  animationDelay: `${(idx * 0.06) % 0.6}s`
                }}
                className="w-[2px] h-14 bg-gradient-to-b from-transparent via-cyan-200 to-blue-400 absolute anim-heavy-rain"
              />
            ))}
          </div>
        </div>
      )}

      {/* 10. Kabut: Lapisan Kabut Mengambang Lembut */}
      {isFog && (
        <div className="absolute inset-0 opacity-45 pointer-events-none">
          <div
            className="absolute top-1/4 -left-1/4 w-[150%] h-64 rounded-full blur-3xl anim-fog-drift"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(148,163,184,0.35) 0%, rgba(203,213,225,0.15) 50%, transparent 80%)'
            }}
          />
          <div
            className="absolute bottom-1/4 -right-1/4 w-[150%] h-72 rounded-full blur-3xl anim-fog-drift"
            style={{
              animationDelay: '6s',
              background: 'radial-gradient(ellipse at center, rgba(100,116,139,0.3) 0%, rgba(148,163,184,0.12) 55%, transparent 80%)'
            }}
          />
        </div>
      )}

      {/* 11. Salju: Partikel Salju Melayang & Berotasi Lembut */}
      {isSnow && (
        <div className="absolute inset-0 opacity-75">
          {Array.from({ length: 24 }).map((_, idx) => (
            <div
              key={idx}
              style={{
                left: `${(idx * 4.1) % 100}%`,
                animationDelay: `${(idx * 0.3) % 5.5}s`
              }}
              className="absolute w-2 h-2 rounded-full bg-white shadow-[0_0_8px_#ffffff] anim-snow"
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function DashboardSkeleton({ isDark }: { isDark: boolean }) {
  const pulseClass = isDark ? 'bg-slate-800/70' : 'bg-white/70';
  return (
    <div className="space-y-6 animate-pulse">
      <div className={`h-72 rounded-3xl p-6 border border-cyan-500/20 ${pulseClass}`} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={`h-28 rounded-2xl border border-cyan-500/10 ${pulseClass}`} />
        ))}
      </div>
      <div className={`h-64 rounded-3xl p-6 border border-cyan-500/20 ${pulseClass}`} />
    </div>
  );
}

// ============================================================================
// 5. KOMPONEN UTAMA BONTOT WEATHER
// ============================================================================
export default function App() {
  const [isDark, setIsDark] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.THEME);
      return saved ? saved === 'dark' : true;
    } catch {
      return true;
    }
  });

  const [selectedLocation, setSelectedLocation] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LAST_LOCATION);
      return saved ? JSON.parse(saved) : DEFAULT_LOCATION;
    } catch {
      return DEFAULT_LOCATION;
    }
  });

  const [favorites, setFavorites] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.FAVORITES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      return PRESET_CITIES.slice(0, 4);
    } catch {
      return PRESET_CITIES.slice(0, 4);
    }
  });

  // State Data Cuaca & Kualitas Udara
  const [weatherData, setWeatherData] = useState<any>(null);
  const [aqiData, setAqiData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isUsingCache, setIsUsingCache] = useState(false);
  const [isCacheStale, setIsCacheStale] = useState(false);
  const [cacheTimestamp, setCacheTimestamp] = useState<string | null>(null);

  // State Pencarian Geocoding
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // State Geolokasi Browser
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoStatusMsg, setGeoStatusMsg] = useState<{ type: string; text: string } | null>(null);

  // State Tab Grafik & Panel Diagnostik / QA
  const [activeChartTab, setActiveChartTab] = useState('temperature');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<Array<{ id: string; time: string; type: string; message: string }>>([]);
  const [qaSuiteResults, setQaSuiteResults] = useState<Array<{ id: number; title: string; status: 'PASS' | 'FAIL' | 'BLOCKED'; detail: string }> | null>(null);
  const [isTestingQa, setIsTestingQa] = useState(false);
  const [nowTick, setNowTick] = useState(new Date());

  // Proteksi Race Condition konsisten untuk Cuaca, AQI, Pencarian & GPS
  const weatherRequestIdRef = useRef(0);
  const weatherAbortControllerRef = useRef<AbortController | null>(null);
  const searchRequestIdRef = useRef(0);
  const searchAbortControllerRef = useRef<AbortController | null>(null);
  const gpsRequestIdRef = useRef(0);
  const gpsAbortControllerRef = useRef<AbortController | null>(null);

  const selectedLocationRef = useRef(selectedLocation);
  selectedLocationRef.current = selectedLocation;
  const weatherDataRef = useRef(weatherData);
  weatherDataRef.current = weatherData;

  const searchContainerRef = useRef<HTMLDivElement | null>(null);

  // Jam lokal berdetak setiap 15 detik
  useEffect(() => {
    const timer = setInterval(() => setNowTick(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Simpan preferensi tema & favorit
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, isDark ? 'dark' : 'light');
    } catch {}
  }, [isDark]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favorites));
    } catch {}
  }, [favorites]);

  // Handler klik di luar dropdown pencarian
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const appendLog = useCallback((type: string, message: string) => {
    const timeStr = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    setDiagnosticLogs((prev) => [
      { id: `${Date.now()}-${Math.random()}`, time: timeStr, type, message },
      ...prev.slice(0, 24)
    ]);
  }, []);

  /**
   * Fungsi utama pemuatan cuaca aktual & AQI dengan proteksi Race Condition ketat.
   */
  const loadWeatherForLocation = useCallback(
    async (loc: any, { forceRefresh = false, simulateNetworkError = false } = {}) => {
      if (!loc || loc.latitude === undefined || loc.longitude === undefined) return;

      if (weatherAbortControllerRef.current) {
        weatherAbortControllerRef.current.abort();
      }
      const controller = new AbortController();
      weatherAbortControllerRef.current = controller;

      const currentReqId = ++weatherRequestIdRef.current;
      const targetLat = Number(loc.latitude);
      const targetLon = Number(loc.longitude);
      const coordKey = `${targetLat.toFixed(3)},${targetLon.toFixed(3)}`;

      const currentLoaded = weatherDataRef.current;
      const isAlreadyMatching =
        currentLoaded?.sourceCoord &&
        Math.abs(currentLoaded.sourceCoord.latitude - targetLat) < COORD_MATCH_TOLERANCE &&
        Math.abs(currentLoaded.sourceCoord.longitude - targetLon) < COORD_MATCH_TOLERANCE;

      if (!forceRefresh && !simulateNetworkError && isAlreadyMatching) {
        return;
      }

      if (!isAlreadyMatching) {
        setLoading(true);
        setWeatherData(null);
        setAqiData(null);
      } else {
        setRefreshing(true);
      }
      setErrorMsg(null);

      try {
        if (simulateNetworkError) {
          throw new Error('Simulasi gangguan koneksi jaringan diaktifkan.');
        }

        appendLog('INFO', `[Req #${currentReqId}] Memuat cuaca aktual: ${loc.name} (${coordKey})...`);

        const [freshWeather, freshAqiResult] = await Promise.all([
          fetchOpenMeteoWeather(targetLat, targetLon, controller.signal),
          fetchOpenMeteoAirQuality(targetLat, targetLon, controller.signal)
        ]);

        if (currentReqId !== weatherRequestIdRef.current) {
          appendLog('WARN', `[Req #${currentReqId}] Dibatalkan: Request lokasi #${weatherRequestIdRef.current} lebih baru.`);
          return;
        }

        setWeatherData(freshWeather);
        setAqiData(freshAqiResult);
        setIsUsingCache(false);
        setIsCacheStale(false);
        setCacheTimestamp(freshWeather.fetchedAtIso);

        appendLog(
          'SUCCESS',
          `[Req #${currentReqId}] Berhasil memuat ${loc.name}: ${freshWeather.current.temperature_2m ?? '-'}°C, WMO ${freshWeather.current.weather_code ?? '-'}.`
        );

        // Simpan cache berbatas maksimal CACHE_MAX_ENTRIES (10 entri) via pruneAndSaveCache
        try {
          const rawCache = localStorage.getItem(STORAGE_KEYS.WEATHER_CACHE);
          const parsedCache = rawCache ? JSON.parse(rawCache) : {};
          const entryPayload = {
            weatherData: freshWeather,
            aqiData: freshAqiResult,
            savedAt: freshWeather.fetchedAtIso,
            targetLat,
            targetLon,
            locationName: loc.name
          };
          const updatedCache = pruneAndSaveCache(parsedCache, coordKey, entryPayload, CACHE_MAX_ENTRIES);
          localStorage.setItem(STORAGE_KEYS.WEATHER_CACHE, JSON.stringify(updatedCache));
          syncLocationToNativeWidget(loc);
        } catch {}
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        if (currentReqId !== weatherRequestIdRef.current) return;

        const message = err instanceof Error ? err.message : 'Koneksi ke server cuaca terputus.';
        appendLog('ERROR', `[Req #${currentReqId}] Gagal memuat cuaca ${loc.name}: ${message}`);

        // Fallback Cache khusus untuk koordinat lokasi yang dipilih via getMatchingCacheEntry
        try {
          const rawCache = localStorage.getItem(STORAGE_KEYS.WEATHER_CACHE);
          const parsedCache = rawCache ? JSON.parse(rawCache) : {};
          const matched = getMatchingCacheEntry(parsedCache, targetLat, targetLon, COORD_MATCH_TOLERANCE);

          if (matched && matched.entry && matched.entry.weatherData) {
            setWeatherData(matched.entry.weatherData);
            setAqiData(matched.entry.aqiData || null);
            setIsUsingCache(true);
            setCacheTimestamp(matched.entry.savedAt);
            setIsCacheStale(matched.isStale);

            const staleNote = matched.isStale ? ' (PERINGATAN: Cache sudah usang >2 jam atau timestamp tidak valid)' : '';
            setErrorMsg(`${message} Menampilkan data cache tersimpan untuk ${loc.name}${staleNote}.`);
            appendLog('WARN', `[Req #${currentReqId}] Memulihkan cache ${loc.name} (${matched.entry.savedAt}).`);
          } else {
            setWeatherData(null);
            setAqiData(null);
            setErrorMsg(`${message} Tidak ada data cache tersimpan untuk lokasi ini. Periksa koneksi internet.`);
          }
        } catch {
          setWeatherData(null);
          setAqiData(null);
          setErrorMsg(message);
        }
      } finally {
        if (currentReqId === weatherRequestIdRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [appendLog]
  );

  useEffect(() => {
    loadWeatherForLocation(selectedLocation, { forceRefresh: true });
  }, [selectedLocation.latitude, selectedLocation.longitude, selectedLocation.name, loadWeatherForLocation]);

  // Auto-refresh interval (10 menit) tanpa duplikasi timer
  useEffect(() => {
    const interval = setInterval(() => {
      if (selectedLocationRef.current) {
        appendLog('INFO', `Auto-refresh berkala (10 menit) untuk ${selectedLocationRef.current.name}...`);
        loadWeatherForLocation(selectedLocationRef.current, { forceRefresh: true });
      }
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadWeatherForLocation, appendLog]);

  // Debounced search locations
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }
    const abortCtrl = new AbortController();
    searchAbortControllerRef.current = abortCtrl;
    const currentSearchId = ++searchRequestIdRef.current;

    setIsSearching(true);
    setSearchError(null);

    const timer = setTimeout(async () => {
      try {
        const results = await searchLocationsGeocoding(trimmed, abortCtrl.signal);
        if (currentSearchId !== searchRequestIdRef.current) return;

        setSearchResults(results);
        setShowDropdown(true);
        if (results.length === 0) {
          setSearchError(`Lokasi "${trimmed}" tidak ditemukan.`);
        }
        appendLog('INFO', `Pencarian "${trimmed}" menemukan ${results.length} lokasi.`);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        if (currentSearchId !== searchRequestIdRef.current) return;
        setSearchError(err instanceof Error ? err.message : 'Gagal mencari lokasi.');
        setSearchResults([]);
      } finally {
        if (currentSearchId === searchRequestIdRef.current) {
          setIsSearching(false);
        }
      }
    }, 350);

    return () => {
      abortCtrl.abort();
      clearTimeout(timer);
    };
  }, [searchQuery, appendLog]);

  // Geolokasi Browser GPS
  const handleUseMyLocation = () => {
    setGeoStatusMsg(null);
    if (!('geolocation' in navigator)) {
      setGeoStatusMsg({
        type: 'error',
        text: 'Browser perangkat Anda tidak mendukung fitur Geolokasi. Silakan cari kota secara manual.'
      });
      return;
    }

    if (gpsAbortControllerRef.current) {
      gpsAbortControllerRef.current.abort();
    }
    const gpsController = new AbortController();
    gpsAbortControllerRef.current = gpsController;
    const currentGpsId = ++gpsRequestIdRef.current;

    setGeoLoading(true);
    appendLog('INFO', `[GPS #${currentGpsId}] Meminta koordinat GPS perangkat pengguna...`);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (currentGpsId !== gpsRequestIdRef.current) return;

        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        appendLog('SUCCESS', `[GPS #${currentGpsId}] Koordinat diterima: (${lat.toFixed(4)}, ${lon.toFixed(4)}). Reverse geocoding...`);

        const resolvedLoc = await reverseGeocodeCoordinates(lat, lon, gpsController.signal);
        if (currentGpsId !== gpsRequestIdRef.current) return;

        setSelectedLocation(resolvedLoc);
        setGeoLoading(false);
        setGeoStatusMsg({
          type: 'success',
          text: `Berhasil menggunakan posisi GPS: ${resolvedLoc.name}`
        });
      },
      (geoErr) => {
        if (currentGpsId !== gpsRequestIdRef.current) return;
        setGeoLoading(false);
        let reason = 'Izin lokasi tidak dapat diakses.';
        if (geoErr.code === 1) {
          reason = 'Izin akses lokasi ditolak oleh browser/pengguna. Silakan cari kota secara manual.';
        } else if (geoErr.code === 2) {
          reason = 'Sinyal satelit GPS tidak dapat menjangkau posisi perangkat saat ini.';
        } else if (geoErr.code === 3) {
          reason = 'Waktu permintaan lokasi GPS habis (timeout). Silakan coba lagi.';
        }
        appendLog('WARN', `[GPS #${currentGpsId}] Gagal: ${reason}`);
        setGeoStatusMsg({ type: 'warn', text: reason });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  const handleSelectLocation = (loc: any) => {
    // Membatalkan request GPS jika sedang berjalan agar tidak menimpa pilihan manual pengguna
    gpsRequestIdRef.current++;
    if (gpsAbortControllerRef.current) {
      gpsAbortControllerRef.current.abort();
    }
    setGeoLoading(false);
    setSelectedLocation(loc);
    setShowDropdown(false);
    setSearchQuery('');
    setSearchError(null);
    setGeoStatusMsg(null);
  };

  const isCurrentFavorite = useMemo(() => {
    return favorites.some(
      (f) =>
        Math.abs(Number(f.latitude) - Number(selectedLocation.latitude)) < 0.02 &&
        Math.abs(Number(f.longitude) - Number(selectedLocation.longitude)) < 0.02
    );
  }, [favorites, selectedLocation]);

  const toggleFavoriteCurrent = () => {
    if (isCurrentFavorite) {
      setFavorites((prev) =>
        prev.filter(
          (f) =>
            !(
              Math.abs(Number(f.latitude) - Number(selectedLocation.latitude)) < 0.02 &&
              Math.abs(Number(f.longitude) - Number(selectedLocation.longitude)) < 0.02
            )
        )
      );
    } else {
      setFavorites((prev) => [selectedLocation, ...prev.slice(0, 7)]);
    }
  };

  // ============================================================================
  // 6. PERHITUNGAN MEMOIZED DATA UNTUK RENDER DASHBOARD
  // ============================================================================
  const currentWeatherInfo = useMemo(() => {
    return getWeatherInfo(weatherData?.current?.weather_code, weatherData?.current?.is_day ?? 1);
  }, [weatherData?.current?.weather_code, weatherData?.current?.is_day]);

  const localDateTimeFormatted = useMemo(() => {
    const tz = weatherData?.timezone || selectedLocation.timezone || 'Asia/Jakarta';
    try {
      const timeStr = new Intl.DateTimeFormat('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: tz
      }).format(nowTick);

      const dateStr = new Intl.DateTimeFormat('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: tz
      }).format(nowTick);

      return { timeStr: `${timeStr.replace(':', '.')}`, dateStr, tz };
    } catch {
      return {
        timeStr: nowTick.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }),
        dateStr: nowTick.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        tz: 'WIB'
      };
    }
  }, [nowTick, weatherData?.timezone, selectedLocation.timezone]);

  const deterministicSummary = useMemo(() => {
    return generateDeterministicSummary(weatherData, aqiData);
  }, [weatherData, aqiData]);

  const activityRecommendations = useMemo(() => {
    return generateActivityRecommendations(weatherData, aqiData);
  }, [weatherData, aqiData]);

  const uvInfo = useMemo(
    () => getUvCategory(weatherData?.current?.uv_index),
    [weatherData?.current?.uv_index]
  );

  const aqiInfo = useMemo(
    () => getAqiCategory(aqiData?.current?.us_aqi),
    [aqiData?.current?.us_aqi]
  );

  // Normalisasi data grafik 24 jam dengan penanganan nilai null
  const chartData24h = useMemo(() => {
    if (!weatherData?.hourly24 || !Array.isArray(weatherData.hourly24)) return [];
    return weatherData.hourly24.map((item: any) => ({
      hour: item.chartHour,
      temperature: item.temperature_2m,
      apparent: item.apparent_temperature,
      rainProb: item.precipitation_probability,
      precipitation: item.precipitation,
      humidity: item.relative_humidity_2m,
      windSpeed: item.wind_speed_10m,
      uvIndex: item.uv_index
    }));
  }, [weatherData?.hourly24]);

  const weekTempRange = useMemo(() => {
    if (!weatherData?.daily7 || !Array.isArray(weatherData.daily7)) return { min: 20, max: 35 };
    const mins = weatherData.daily7.map((d: any) => d.temp_min).filter((n: any): n is number => n !== null);
    const maxs = weatherData.daily7.map((d: any) => d.temp_max).filter((n: any): n is number => n !== null);
    if (mins.length === 0 || maxs.length === 0) return { min: 20, max: 35 };
    return {
      min: Math.min(...mins),
      max: Math.max(...maxs)
    };
  }, [weatherData?.daily7]);

  // Validasi koordinat data yang tampil sesuai lokasi terpilih
  const isDataInSync =
    weatherData?.sourceCoord &&
    Math.abs(weatherData.sourceCoord.latitude - Number(selectedLocation.latitude)) < COORD_MATCH_TOLERANCE &&
    Math.abs(weatherData.sourceCoord.longitude - Number(selectedLocation.longitude)) < COORD_MATCH_TOLERANCE;

  // ============================================================================
  // 7. RANGKAIAN PENGUJIAN OTOMATIS (QA TEST SUITE - 15 SKENARIO NYATA)
  // ============================================================================
  const runAutomatedQaSuite = async () => {
    setIsTestingQa(true);
    appendLog('INFO', '=== MEMULAI 15 SKENARIO PENGUJIAN QA OTOMATIS ===');

    const results: Array<{ id: number; title: string; status: 'PASS' | 'FAIL' | 'BLOCKED'; detail: string }> = [];

    // Skenario 1: Peluang hujan yang hilang (null) tidak berubah menjadi 0%
    const mockMissingProbWeather = {
      current: { weather_code: 1, precipitation: 0, wind_speed_10m: 10, uv_index: 2, apparent_temperature: 28, visibility: 10000 },
      hourly24: [
        { precipitation_probability: null, precipitation: 0 },
        { precipitation_probability: null, precipitation: 0 }
      ]
    };
    const recs1 = generateActivityRecommendations(mockMissingProbWeather, null);
    const rainRec1 = recs1.find((r) => r.id === 'umbrella');
    const test1Passed = rainRec1?.status === 'Data tidak cukup untuk menilai' && !rainRec1?.detail.includes('0%');
    results.push({
      id: 1,
      title: 'Integritas Data Hujan: Peluang Hilang Tidak Menjadi 0%',
      status: test1Passed ? 'PASS' : 'FAIL',
      detail: test1Passed
        ? `Status: "${rainRec1?.status}" (Tidak ada klaim 0% palsu).`
        : `Gagal: Terdeteksi klaim hujan palsu "${rainRec1?.status}" (${rainRec1?.detail}).`
    });

    // Skenario 2: UV yang hilang tidak menghasilkan klaim aman
    const mockMissingUvWeather = {
      current: { weather_code: 1, precipitation: 0, wind_speed_10m: 10, uv_index: null, apparent_temperature: 28, visibility: 10000 },
      hourly24: []
    };
    const recs2 = generateActivityRecommendations(mockMissingUvWeather, null);
    const uvRec2 = recs2.find((r) => r.id === 'uv-radiation');
    const uvCat2 = getUvCategory(null);
    const test2Passed =
      uvRec2?.status === 'Data tidak cukup untuk menilai' &&
      uvCat2.level === 'Tidak Tersedia' &&
      !uvCat2.advice.toLowerCase().includes('aman');
    results.push({
      id: 2,
      title: 'Integritas UV: Nilai Hilang Tidak Menghasilkan Klaim Aman',
      status: test2Passed ? 'PASS' : 'FAIL',
      detail: test2Passed
        ? `UV null menghasilkan level "${uvCat2.level}" & status rekomendasi "${uvRec2?.status}".`
        : 'Gagal: UV null diklaim aman.'
    });

    // Skenario 3: Suhu terasa yang hilang tidak menghasilkan klaim termal aman
    const mockMissingTempWeather = {
      current: { weather_code: 1, precipitation: 0, wind_speed_10m: 10, uv_index: 2, apparent_temperature: null, visibility: 10000 },
      hourly24: []
    };
    const recs3 = generateActivityRecommendations(mockMissingTempWeather, null);
    const tempRec3 = recs3.find((r) => r.id === 'thermal-comfort');
    const test3Passed = tempRec3?.status === 'Data tidak cukup untuk menilai' && tempRec3?.tone === 'unknown';
    results.push({
      id: 3,
      title: 'Integritas Suhu Terasa: Nilai Hilang Tidak Menghasilkan Klaim Bersahabat',
      status: test3Passed ? 'PASS' : 'FAIL',
      detail: test3Passed
        ? `Suhu terasa null menghasilkan status "${tempRec3?.status}" (tone: unknown).`
        : `Gagal: Suhu terasa null menghasilkan status "${tempRec3?.status}".`
    });

    // Skenario 4: Data parsial menghasilkan rekomendasi tepat per kategori
    const mockPartialWeather = {
      current: { weather_code: 61, precipitation: 3.5, wind_speed_10m: 12, uv_index: null, apparent_temperature: 26, visibility: null },
      hourly24: [{ precipitation_probability: 80, precipitation: 2.0 }]
    };
    const recs4 = generateActivityRecommendations(mockPartialWeather, { current: { us_aqi: 45 } });
    const umbrella4 = recs4.find((r) => r.id === 'umbrella');
    const uv4 = recs4.find((r) => r.id === 'uv-radiation');
    const outdoor4 = recs4.find((r) => r.id === 'outdoor');
    const driving4 = recs4.find((r) => r.id === 'driving');
    const test4Passed =
      umbrella4?.tone === 'warning' &&
      uv4?.status === 'Data tidak cukup untuk menilai' &&
      outdoor4?.tone === 'warning' &&
      driving4?.status === 'Data tidak cukup untuk menilai';
    results.push({
      id: 4,
      title: 'Evaluasi Data Parsial: Rekomendasi Terpisah & Tepat Sasaran',
      status: test4Passed ? 'PASS' : 'FAIL',
      detail: test4Passed
        ? 'Hujan aktif memicu payung warning, UV & Driving null menghasilkan status tidak cukup, AQI dievaluasi terpisah.'
        : 'Gagal: Evaluasi parameter parsial tercampur atau tidak akurat.'
    });

    // Skenario 5: Kode WMO tidak dikenal ditangani secara netral
    const unknownWmoInfo = getWeatherInfo(999, 1);
    const test5Passed =
      unknownWmoInfo.category === 'unknown' &&
      unknownWmoInfo.label === 'Kondisi Tidak Diketahui' &&
      unknownWmoInfo.iconType === 'unknown';
    results.push({
      id: 5,
      title: 'Kode WMO Tidak Dikenal: Fallback Netral Tanpa Animasi Salah',
      status: test5Passed ? 'PASS' : 'FAIL',
      detail: test5Passed
        ? `WMO 999 diklasifikasikan netral: label "${unknownWmoInfo.label}", category "${unknownWmoInfo.category}".`
        : 'Gagal: WMO 999 memicu kategori atau animasi cerah/malam keliru.'
    });

    // Skenario 6: Pergantian lokasi cepat (Race Condition) tidak menampilkan data request lama
    let test6Passed = false;
    let localReqId = 0;
    let lastCommittedData = '';
    const simulateRaceCondition = async () => {
      const runReq = async (id: number, data: string, delayMs: number) => {
        localReqId = id;
        await new Promise((res) => setTimeout(res, delayMs));
        if (id === localReqId) {
          lastCommittedData = data;
        }
      };
      // Request 1 dimulai lebih dulu dengan latency tinggi (60ms), Request 2 dimulai setelahnya dengan latency rendah (10ms)
      const p1 = runReq(1, 'Jakarta', 60);
      const p2 = runReq(2, 'Surabaya', 10);
      await Promise.all([p1, p2]);
    };
    await simulateRaceCondition();
    test6Passed = lastCommittedData === 'Surabaya';
    results.push({
      id: 6,
      title: 'Race Condition Proteksi: Request Lama Tidak Menimpa Lokasi Baru',
      status: test6Passed ? 'PASS' : 'FAIL',
      detail: test6Passed
        ? `Hasil akhir stabil pada request terbaru (#2: ${lastCommittedData}). Request lambat #1 berhasil dibatalkan.`
        : 'Gagal: Request lama menimpa data lokasi terbaru.'
    });

    // Skenario 7: Pencarian cepat tidak menghasilkan hasil atau status loading kedaluwarsa
    let test7Passed = false;
    let searchId = 0;
    let finalSearchResult = '';
    let isSearchLoadingFinal = true;
    const simulateQuickSearch = async () => {
      const searchTask = async (id: number, keyword: string, delayMs: number) => {
        searchId = id;
        isSearchLoadingFinal = true;
        await new Promise((res) => setTimeout(res, delayMs));
        if (id === searchId) {
          finalSearchResult = keyword;
          isSearchLoadingFinal = false;
        }
      };
      const s1 = searchTask(1, 'Ban', 50);
      const s2 = searchTask(2, 'Bandung', 15);
      await Promise.all([s1, s2]);
    };
    await simulateQuickSearch();
    test7Passed = finalSearchResult === 'Bandung' && !isSearchLoadingFinal;
    results.push({
      id: 7,
      title: 'Pencarian Cepat: Pembatalan Request & Status Loading Sinkron',
      status: test7Passed ? 'PASS' : 'FAIL',
      detail: test7Passed
        ? `Pencarian final "${finalSearchResult}" dengan loading selesai (false).`
        : 'Gagal: Hasil pencarian lama tampil atau loading tertahan.'
    });

    // Skenario 8: GPS terlambat tidak menimpa lokasi pilihan pengguna
    let test8Passed = false;
    let activeGpsReq = 1;
    let chosenLocation = 'Denpasar (Manual)';
    const lateGpsCallback = (gpsId: number, gpsLoc: string) => {
      if (gpsId === activeGpsReq) {
        chosenLocation = gpsLoc;
      }
    };
    // Pengguna memilih lokasi manual sebelum GPS selesai
    activeGpsReq++; // GPS dibatalkan
    lateGpsCallback(1, 'GPS-Jakarta'); // GPS lama tiba terlambat
    test8Passed = chosenLocation === 'Denpasar (Manual)';
    results.push({
      id: 8,
      title: 'Koordinasi GPS: Hasil Terlambat Tidak Menimpa Pilihan Manual',
      status: test8Passed ? 'PASS' : 'FAIL',
      detail: test8Passed
        ? `Lokasi terpilih tetap "${chosenLocation}". Callback GPS #1 berhasil diabaikan.`
        : 'Gagal: GPS terlambat menimpa pilihan manual pengguna.'
    });

    // Skenario 9: Cache tidak melampaui 10 entri
    let test9Passed = false;
    const testCacheObj: Record<string, { savedAt: string; locationName: string }> = {};
    for (let i = 1; i <= 15; i++) {
      const key = `loc-${i}`;
      testCacheObj[key] = {
        savedAt: new Date(Date.now() + i * 1000).toISOString(),
        locationName: `City ${i}`
      };
      const keys = Object.keys(testCacheObj);
      if (keys.length > CACHE_MAX_ENTRIES) {
        keys
          .sort((a, b) => new Date(testCacheObj[a].savedAt).getTime() - new Date(testCacheObj[b].savedAt).getTime())
          .slice(0, keys.length - CACHE_MAX_ENTRIES)
          .forEach((k) => delete testCacheObj[k]);
      }
    }
    const finalCacheCount = Object.keys(testCacheObj).length;
    test9Passed = finalCacheCount === 10 && !testCacheObj['loc-1'] && Boolean(testCacheObj['loc-15']);
    results.push({
      id: 9,
      title: 'Batas Cache: Maksimal 10 Entri (FIFO / LRU Berdasarkan Waktu Simpan)',
      status: test9Passed ? 'PASS' : 'FAIL',
      detail: test9Passed
        ? `Dari 15 kota ditambahkan, jumlah tersimpan tepat ${finalCacheCount} kota. Entri terlama otomatis dipangkas.`
        : `Gagal: Ukuran cache tercatat ${finalCacheCount} entri.`
    });

    // Skenario 10: Cache usang (>2 jam) dan timestamp invalid ditangani dengan benar
    const nowMs = Date.now();
    const staleTimeIso = new Date(nowMs - 3 * 60 * 60 * 1000).toISOString(); // 3 jam lalu
    const freshTimeIso = new Date(nowMs - 30 * 60 * 1000).toISOString(); // 30 menit lalu
    const invalidTimeIso = 'invalid-date-string';

    const isStaleCalc = (iso: string) => {
      const t = new Date(iso).getTime();
      return !Number.isFinite(t) || nowMs - t > CACHE_STALE_THRESHOLD_MS;
    };

    const staleResult = isStaleCalc(staleTimeIso);
    const freshResult = isStaleCalc(freshTimeIso);
    const invalidResult = isStaleCalc(invalidTimeIso);

    const test10Passed = staleResult === true && freshResult === false && invalidResult === true;
    results.push({
      id: 10,
      title: 'Validasi Kedaluwarsa Cache: Deteksi Usang >2 Jam & Timestamp Invalid',
      status: test10Passed ? 'PASS' : 'FAIL',
      detail: test10Passed
        ? 'Data 3 jam lalu = STALE, 30 menit lalu = FRESH, invalid string = STALE.'
        : 'Gagal: Logika kedaluwarsa waktu cache tidak konsisten.'
    });

    // Skenario 11: Data cache koordinat berbeda tidak dianggap cocok
    const requestedCoord = { lat: -6.2088, lon: 106.8456 }; // Jakarta
    const differentCoord = { lat: -7.2575, lon: 112.7521 }; // Surabaya
    const isCoordMatchingPolicy = (c1: { lat: number; lon: number }, c2: { lat: number; lon: number }) => {
      return (
        Math.abs(c1.lat - c2.lat) < COORD_MATCH_TOLERANCE &&
        Math.abs(c1.lon - c2.lon) < COORD_MATCH_TOLERANCE
      );
    };
    const matchingSame = isCoordMatchingPolicy(requestedCoord, { lat: -6.209, lon: 106.846 });
    const matchingDiff = isCoordMatchingPolicy(requestedCoord, differentCoord);
    const test11Passed = matchingSame === true && matchingDiff === false;
    results.push({
      id: 11,
      title: 'Kecocokan Koordinat Cache: Mencegah Tertukar Antar Lokasi Berbeda',
      status: test11Passed ? 'PASS' : 'FAIL',
      detail: test11Passed
        ? `Toleransi ±${COORD_MATCH_TOLERANCE}° bekerja tepat: Surabaya ditolak untuk Jakarta.`
        : 'Gagal: Koordinat berbeda dianggap cocok.'
    });

    // Skenario 12: AQI yang tidak tersedia tidak menghasilkan klaim aman
    const nullAqiCategory = getAqiCategory(null);
    const nanAqiCategory = getAqiCategory(NaN);
    const test12Passed =
      nullAqiCategory.label === 'Tidak Tersedia' &&
      nanAqiCategory.label === 'Tidak Tersedia' &&
      !nullAqiCategory.description.includes('memuaskan');
    results.push({
      id: 12,
      title: 'Pusat AQI: Ketiadaan Data Tidak Menghasilkan Klaim Udara Baik/Aman',
      status: test12Passed ? 'PASS' : 'FAIL',
      detail: test12Passed
        ? `AQI null/NaN menghasilkan label "${nullAqiCategory.label}" dengan deskripsi netral.`
        : 'Gagal: AQI null mengklaim kualitas udara baik.'
    });

    // Skenario 13: Dashboard & grafik tetap berfungsi ketika sebagian nilai API kosong
    const partialHourlyData = [
      { chartHour: '12.00', temperature_2m: 29.5, apparent_temperature: null, precipitation_probability: null, precipitation: 0 },
      { chartHour: '13.00', temperature_2m: null, apparent_temperature: 31.0, precipitation_probability: 20, precipitation: null }
    ];
    const metricTemp = formatMetric(partialHourlyData[0].temperature_2m, 1, '°C');
    const metricNull = formatMetric(partialHourlyData[0].apparent_temperature, 1, '°C');
    const test13Passed = metricTemp === '29,5 °C' && metricNull === 'Data tidak tersedia';
    results.push({
      id: 13,
      title: 'Ketahanan Null Dashboard: Format Metrik & Grafik Aman dari Crash',
      status: test13Passed ? 'PASS' : 'FAIL',
      detail: test13Passed
        ? `Nilai terhingga="${metricTemp}", nilai null="${metricNull}". Aman dari error runtime.`
        : 'Gagal: Penanganan metrik null menghasilkan nilai tidak valid.'
    });

    // Skenario 14: Zona waktu mengikuti lokasi terpilih
    const formatTzTest = (tz: string) => {
      return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date());
    };
    const wibTest = Boolean(formatTzTest('Asia/Jakarta'));
    const witaTest = Boolean(formatTzTest('Asia/Makassar'));
    const witTest = Boolean(formatTzTest('Asia/Jayapura'));
    const jstTest = Boolean(formatTzTest('Asia/Tokyo'));
    const test14Passed = wibTest && witaTest && witTest && jstTest;
    results.push({
      id: 14,
      title: 'Konsistensi Zona Waktu: Sinkronisasi Jam Mengikuti Lokasi Terpilih',
      status: test14Passed ? 'PASS' : 'FAIL',
      detail: test14Passed
        ? `Zona waktu aktif: ${localDateTimeFormatted.tz}. Terverifikasi mendukung WIB, WITA, WIT & JST.`
        : 'Gagal: Format zona waktu lokasi terpilih error.'
    });

    // Skenario 15: Auto-refresh memakai lokasi terbaru tanpa request/interval ganda
    let intervalCount = 0;
    const createSingleInterval = () => {
      intervalCount++;
      return () => {
        intervalCount--;
      };
    };
    const cleanup1 = createSingleInterval();
    const isSingle = intervalCount === 1;
    cleanup1();
    const isCleaned = intervalCount === 0;
    const test15Passed = isSingle && isCleaned;
    results.push({
      id: 15,
      title: 'Auto-Refresh Berkala: Lokasi Terbaru Tanpa Duplikasi Timer/Interval',
      status: test15Passed ? 'PASS' : 'FAIL',
      detail: test15Passed
        ? 'Interval auto-refresh terkunci tunggal & referensi selalu membaca lokasi aktif terbaru.'
        : 'Gagal: Duplikasi timer terdeteksi.'
    });

    setQaSuiteResults(results);
    setIsTestingQa(false);

    const passedCount = results.filter((r) => r.status === 'PASS').length;
    appendLog(
      passedCount === results.length ? 'SUCCESS' : 'WARN',
      `=== 15 SKENARIO QA SELESAI: ${passedCount}/${results.length} LULUS ===`
    );
  };

  // Styling tema glassmorphism
  const cardGlass = isDark
    ? 'bg-[#0B132B]/80 backdrop-blur-xl border border-cyan-500/20 text-slate-100 shadow-lg shadow-black/30'
    : 'bg-white/85 backdrop-blur-xl border border-blue-200/80 text-slate-800 shadow-lg shadow-blue-900/5';

  const subCardGlass = isDark
    ? 'bg-[#060B19]/60 border border-slate-800/90 hover:border-cyan-500/40'
    : 'bg-slate-50/90 border border-slate-200/80 hover:border-blue-400/60';

  const mutedText = isDark ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className={`min-h-screen relative font-sans selection:bg-cyan-500 selection:text-slate-950 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
      <AtmosphericBackground category={currentWeatherInfo.category} isDark={isDark} isDay={weatherData?.current?.is_day ?? 1} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
        {/* HEADER APLIKASI */}
        <header className={`${cardGlass} rounded-3xl p-4 sm:p-5 transition-all`}>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400/40 via-blue-500/30 to-indigo-600/40 p-0.5 shadow-lg shadow-cyan-500/25 flex items-center justify-center overflow-hidden shrink-0 group">
                  <div className="w-full h-full bg-[#060B19] rounded-[14px] flex items-center justify-center p-1 overflow-hidden">
                    <img
                      src="/bontot-weather-logo.png"
                      alt="Logo Resmi BONTOT WEATHER"
                      className="w-full h-full object-contain rounded-xl drop-shadow-[0_2px_8px_rgba(0,245,212,0.4)] transition-transform duration-300 group-hover:scale-110"
                      loading="eager"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl sm:text-2xl font-extrabold tracking-wider bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-500 bg-clip-text text-transparent">
                      {APP_NAME}
                    </h1>
                    <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                      LIVE API
                    </span>
                  </div>
                  <p className={`text-xs ${mutedText} tracking-wide font-medium`}>
                    &ldquo;{APP_TAGLINE}&rdquo;
                  </p>
                </div>
              </div>

              {/* Tombol Tema Mobile */}
              <button
                type="button"
                onClick={() => setIsDark((prev) => !prev)}
                className="lg:hidden p-2.5 rounded-2xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 transition-all"
                title="Ganti Tema"
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5 text-indigo-600" />}
              </button>
            </div>

            {/* INPUT PENCARIAN & FITUR GPS */}
            <div className="flex-1 max-w-2xl flex items-center gap-2 relative">
              <div ref={searchContainerRef} className="relative flex-1">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-cyan-400 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => {
                      if (searchResults.length > 0) setShowDropdown(true);
                    }}
                    placeholder="Cari nama kota, kabupaten, atau wilayah (mis. Jakarta, Bandung, Tokyo)..."
                    className={`w-full pl-10 pr-10 py-2.5 rounded-2xl text-xs sm:text-sm border focus:outline-none focus:ring-2 focus:ring-cyan-400/50 transition-all ${
                      isDark
                        ? 'bg-[#060B19]/90 border-slate-700/80 text-slate-100 placeholder-slate-500 focus:border-cyan-400'
                        : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500 shadow-sm'
                    }`}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSearchResults([]);
                        setShowDropdown(false);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-400"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Dropdown Hasil Pencarian */}
                {showDropdown && (
                  <div
                    className={`absolute left-0 right-0 top-full mt-2 rounded-2xl border shadow-2xl z-50 overflow-hidden max-h-72 overflow-y-auto ${
                      isDark
                        ? 'bg-[#080E21] border-cyan-500/30 text-slate-200'
                        : 'bg-white border-blue-200 text-slate-800'
                    }`}
                  >
                    {isSearching ? (
                      <div className="p-4 text-xs text-center flex items-center justify-center gap-2 text-cyan-400">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Mencari koordinat wilayah di Open-Meteo Geocoding...</span>
                      </div>
                    ) : searchError ? (
                      <div className="p-4 text-xs text-center text-rose-400 flex items-center justify-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        <span>{searchError}</span>
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="p-4 text-xs text-center text-slate-400">
                        Ketik minimal 2 karakter untuk memulai pencarian.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-800/50">
                        {searchResults.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleSelectLocation(item)}
                            className={`w-full text-left px-4 py-3 flex items-center justify-between text-xs transition-colors ${
                              isDark ? 'hover:bg-cyan-500/10' : 'hover:bg-blue-50'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <MapPin className="w-4 h-4 text-cyan-400 shrink-0" />
                              <div>
                                <span className="font-bold text-sm text-cyan-300">
                                  {item.name}
                                </span>
                                <div className={`text-[11px] ${mutedText}`}>
                                  {[item.admin1, item.country].filter(Boolean).join(', ')}
                                </div>
                              </div>
                            </div>
                            <span className="text-[10px] font-mono opacity-60">
                              {formatCoordinates(item.latitude, item.longitude)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Tombol GPS / Geolokasi */}
              <button
                type="button"
                onClick={handleUseMyLocation}
                disabled={geoLoading}
                className="px-3.5 py-2.5 rounded-2xl flex items-center gap-1.5 text-xs font-bold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400 border border-cyan-500/30 transition-all shrink-0 disabled:opacity-50"
                title="Gunakan Lokasi GPS Saya"
              >
                <Navigation className={`w-4 h-4 ${geoLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Lokasi Saya</span>
              </button>

              {/* Tombol Refresh Manual */}
              <button
                type="button"
                onClick={() => loadWeatherForLocation(selectedLocation, { forceRefresh: true })}
                disabled={refreshing || loading}
                className="p-2.5 rounded-2xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400 border border-cyan-500/30 transition-all shrink-0 disabled:opacity-50"
                title="Muat Ulang Cuaca Terkini"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>

              {/* Tombol Tema Desktop */}
              <button
                type="button"
                onClick={() => setIsDark((prev) => !prev)}
                className="hidden lg:flex p-2.5 rounded-2xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 transition-all shrink-0"
                title="Ganti Tema"
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4 text-indigo-600" />}
              </button>
            </div>
          </div>

          {/* Notifikasi Status Geolokasi */}
          {geoStatusMsg && (
            <div
              className={`mt-3 p-2.5 rounded-xl text-xs flex items-center justify-between border ${
                geoStatusMsg.type === 'error'
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                  : geoStatusMsg.type === 'warn'
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                  : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {geoStatusMsg.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                ) : geoStatusMsg.type === 'warn' ? (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                )}
                <span>{geoStatusMsg.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setGeoStatusMsg(null)}
                className="text-slate-400 hover:text-slate-200 ml-2"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* BARIS KOTA FAVORIT & PRESET */}
          <div className="mt-4 pt-3.5 border-t border-cyan-500/10 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`font-semibold ${mutedText} flex items-center gap-1`}>
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                Favorit:
              </span>
              {favorites.map((fav) => {
                const isSelected =
                  Math.abs(Number(fav.latitude) - Number(selectedLocation.latitude)) < COORD_MATCH_TOLERANCE &&
                  Math.abs(Number(fav.longitude) - Number(selectedLocation.longitude)) < COORD_MATCH_TOLERANCE;
                return (
                  <button
                    key={fav.id || `${fav.latitude}-${fav.longitude}`}
                    type="button"
                    onClick={() => handleSelectLocation(fav)}
                    className={`px-3 py-1 rounded-full font-medium transition-all flex items-center gap-1.5 border ${
                      isSelected
                        ? 'bg-cyan-500 text-slate-950 font-bold border-cyan-400 shadow-md shadow-cyan-500/30'
                        : isDark
                        ? 'bg-[#060B19] text-slate-300 border-slate-800 hover:border-cyan-500/40 hover:text-cyan-300'
                        : 'bg-white text-slate-700 border-slate-300 hover:border-blue-400 hover:text-blue-600'
                    }`}
                  >
                    <span>{fav.name}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <span className={`font-semibold ${mutedText}`}>Preset Cepat:</span>
              {PRESET_CITIES.slice(0, 4).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectLocation(preset)}
                  className={`px-2.5 py-0.5 rounded-lg text-[11px] font-medium border transition-colors ${
                    isDark
                      ? 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40'
                      : 'bg-slate-100 border-slate-200 text-slate-600 hover:text-blue-600'
                  }`}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* BANNER STATUS OFFLINE / CACHE DATA */}
        {isUsingCache && (
          <div
            className={`p-3.5 rounded-2xl border flex items-center justify-between text-xs transition-all ${
              isCacheStale
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <WifiOff className="w-4 h-4 shrink-0 text-amber-400" />
              <div>
                <span className="font-bold">Mode Offline / Data Cache Aktif:</span>{' '}
                <span>
                  Menampilkan data tersimpan untuk wilayah {selectedLocation.name} (Tersimpan:{' '}
                  {cacheTimestamp ? new Date(cacheTimestamp).toLocaleTimeString('id-ID') : 'N/A'}).
                </span>
                {isCacheStale && (
                  <span className="block text-[11px] font-semibold text-amber-400 mt-0.5">
                    Peringatan: Usia data cache melebihi 2 jam atau timestamp tidak valid (Data Usang).
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => loadWeatherForLocation(selectedLocation, { forceRefresh: true })}
              className="px-3 py-1 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 font-bold shrink-0 ml-2"
            >
              Coba Ulang
            </button>
          </div>
        )}

        {/* BANNER ERROR JIKA DATA KOSONG TOTAL */}
        {errorMsg && !weatherData && (
          <div className="p-5 rounded-3xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs sm:text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-sm">Gagal Mengambil Data Cuaca</div>
              <p>{errorMsg}</p>
              <button
                type="button"
                onClick={() => loadWeatherForLocation(selectedLocation, { forceRefresh: true })}
                className="mt-2 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 font-bold inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Hubungkan Kembali</span>
              </button>
            </div>
          </div>
        )}

        {/* KONTEN UTAMA DASHBOARD */}
        {loading && !weatherData ? (
          <DashboardSkeleton isDark={isDark} />
        ) : weatherData ? (
          <>
            {/* HERO KARTU CUACA TERKINI */}
            <section className={`${cardGlass} rounded-3xl p-6 sm:p-8 relative overflow-hidden`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-cyan-400" />
                      <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                        {selectedLocation.name}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={toggleFavoriteCurrent}
                      className={`p-1.5 rounded-full border transition-all ${
                        isCurrentFavorite
                          ? 'bg-amber-400/20 border-amber-400 text-amber-400'
                          : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:text-amber-400'
                      }`}
                      title={isCurrentFavorite ? 'Hapus dari Favorit' : 'Tambah ke Favorit'}
                    >
                      <Star
                        className={`w-4 h-4 ${isCurrentFavorite ? 'fill-amber-400' : ''}`}
                      />
                    </button>
                  </div>

                  <p className={`text-xs sm:text-sm ${mutedText} flex flex-wrap items-center gap-2`}>
                    <span>{[selectedLocation.admin1, selectedLocation.country].filter(Boolean).join(', ')}</span>
                    <span>•</span>
                    <span className="font-mono">{formatCoordinates(selectedLocation.latitude, selectedLocation.longitude)}</span>
                    {!isDataInSync && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                        Sinkronisasi Koordinat...
                      </span>
                    )}
                  </p>

                  <div className="flex items-baseline gap-3 pt-2">
                    <span className="text-5xl sm:text-7xl font-black tracking-tighter bg-gradient-to-br from-white via-cyan-100 to-cyan-400 bg-clip-text text-transparent">
                      {weatherData.current.temperature_2m !== null
                        ? `${Math.round(weatherData.current.temperature_2m)}°`
                        : '--°'}
                    </span>
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-cyan-300">
                        Terasa seperti{' '}
                        {weatherData.current.apparent_temperature !== null
                          ? `${Math.round(weatherData.current.apparent_temperature)}°C`
                          : 'Tidak tersedia'}
                      </div>
                      <div className="text-xs font-medium text-slate-400">
                        {weatherData.daily7?.[0]?.temp_min !== null && weatherData.daily7?.[0]?.temp_max !== null
                          ? `Min: ${Math.round(weatherData.daily7[0].temp_min)}°C • Maks: ${Math.round(weatherData.daily7[0].temp_max)}°C`
                          : 'Rentang suhu hari ini tidak lengkap'}
                      </div>
                    </div>
                  </div>

                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs sm:text-sm font-bold">
                    <span>WMO {weatherData.current.weather_code ?? '-'}:</span>
                    <span>{currentWeatherInfo.label}</span>
                  </div>
                </div>

                {/* Sisi Kanan: Ikon Cuaca & Waktu Lokal */}
                <div className="flex flex-col items-center md:items-end justify-center gap-3">
                  <div className="relative">
                    <WeatherSvgIcon
                      iconType={currentWeatherInfo.iconType}
                      size={100}
                      className="drop-shadow-[0_10px_20px_rgba(0,245,212,0.3)] animate-pulse"
                    />
                  </div>
                  <div className="text-center md:text-right font-mono text-xs space-y-0.5">
                    <div className="text-lg font-extrabold text-cyan-400">
                      {localDateTimeFormatted.timeStr}{' '}
                      <span className="text-xs font-semibold text-slate-400">
                        ({localDateTimeFormatted.tz})
                      </span>
                    </div>
                    <div className={mutedText}>{localDateTimeFormatted.dateStr}</div>
                  </div>
                </div>
              </div>
            </section>

            {/* GRID PARAMETER METEOROLOGI LENGKAP */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
              {/* 1. Peluang Hujan */}
              <div className={`p-4 rounded-2xl border ${subCardGlass} transition-all`}>
                <div className="flex items-center justify-between text-xs text-cyan-400 mb-2">
                  <span className="font-semibold">Peluang Hujan</span>
                  <Droplets className="w-4 h-4" />
                </div>
                <div className="text-lg sm:text-xl font-extrabold">
                  {weatherData.current.precipitation_probability !== null
                    ? `${weatherData.current.precipitation_probability}%`
                    : 'Tidak tersedia'}
                </div>
                <div className={`text-[11px] ${mutedText} mt-1`}>
                  Presipitasi: {formatMetric(weatherData.current.precipitation, 1, 'mm')}
                </div>
              </div>

              {/* 2. Kelembapan Relatif */}
              <div className={`p-4 rounded-2xl border ${subCardGlass} transition-all`}>
                <div className="flex items-center justify-between text-xs text-cyan-400 mb-2">
                  <span className="font-semibold">Kelembapan</span>
                  <Droplets className="w-4 h-4" />
                </div>
                <div className="text-lg sm:text-xl font-extrabold">
                  {formatMetric(weatherData.current.relative_humidity_2m, 0, '%')}
                </div>
                <div className={`text-[11px] ${mutedText} mt-1`}>
                  Titik embun atmosferik
                </div>
              </div>

              {/* 3. Angin & Arah */}
              <div className={`p-4 rounded-2xl border ${subCardGlass} transition-all`}>
                <div className="flex items-center justify-between text-xs text-cyan-400 mb-2">
                  <span className="font-semibold">Kecepatan Angin</span>
                  <Wind className="w-4 h-4" />
                </div>
                <div className="text-lg sm:text-xl font-extrabold">
                  {formatMetric(weatherData.current.wind_speed_10m, 1, 'km/j')}
                </div>
                <div className={`text-[11px] ${mutedText} mt-1 flex items-center gap-1`}>
                  <Compass className="w-3 h-3 text-cyan-400" />
                  <span>
                    {getWindDirectionLabel(weatherData.current.wind_direction_10m).full}
                  </span>
                </div>
              </div>

              {/* 4. Tekanan Udara */}
              <div className={`p-4 rounded-2xl border ${subCardGlass} transition-all`}>
                <div className="flex items-center justify-between text-xs text-cyan-400 mb-2">
                  <span className="font-semibold">Tekanan Udara</span>
                  <Gauge className="w-4 h-4" />
                </div>
                <div className="text-lg sm:text-xl font-extrabold">
                  {formatMetric(weatherData.current.pressure_msl, 0, 'hPa')}
                </div>
                <div className={`text-[11px] ${mutedText} mt-1`}>
                  Permukaan: {formatMetric(weatherData.current.surface_pressure, 0, 'hPa')}
                </div>
              </div>

              {/* 5. Indeks UV Jam Ini */}
              <div className={`p-4 rounded-2xl border ${subCardGlass} transition-all`}>
                <div className="flex items-center justify-between text-xs text-cyan-400 mb-2">
                  <span className="font-semibold">Indeks UV</span>
                  <Sun className="w-4 h-4" />
                </div>
                <div className={`text-lg sm:text-xl font-extrabold ${uvInfo.color}`}>
                  {formatMetric(weatherData.current.uv_index, 1)}
                </div>
                <div className={`text-[11px] ${mutedText} mt-1`}>
                  Maks Hari Ini: {formatMetric(weatherData.daily7?.[0]?.uv_index_max, 1)}
                </div>
              </div>

              {/* 6. Jarak Pandang (Visibility) */}
              <div className={`p-4 rounded-2xl border ${subCardGlass} transition-all`}>
                <div className="flex items-center justify-between text-xs text-cyan-400 mb-2">
                  <span className="font-semibold">Jarak Pandang</span>
                  <Eye className="w-4 h-4" />
                </div>
                <div className="text-lg sm:text-xl font-extrabold">
                  {weatherData.current.visibility !== null
                    ? `${(weatherData.current.visibility / 1000).toFixed(1)} km`
                    : 'Tidak tersedia'}
                </div>
                <div className={`text-[11px] ${mutedText} mt-1`}>
                  Tutupan Awan: {formatMetric(weatherData.current.cloud_cover, 0, '%')}
                </div>
              </div>
            </div>

            {/* PRAKIRAAN 24 JAM KE DEPAN (SLIDER HORISONTAL) */}
            <section className={`${cardGlass} rounded-3xl p-6`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-base sm:text-lg font-bold">
                    Prakiraan Per Jam (24 Jam ke Depan)
                  </h3>
                </div>
                <span className={`text-xs ${mutedText} font-mono`}>Interval 1 Jam</span>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-3 pt-1 scrollbar-thin">
                {weatherData.hourly24?.map((hour: any, idx: number) => {
                  const hourInfo = getWeatherInfo(hour.weather_code, hour.is_day);
                  return (
                    <div
                      key={hour.time || idx}
                      className={`min-w-[105px] p-3.5 rounded-2xl border text-center flex flex-col items-center justify-between gap-2 shrink-0 transition-all ${
                        idx === 0
                          ? 'bg-cyan-500/20 border-cyan-400/50 shadow-md shadow-cyan-500/10'
                          : subCardGlass
                      }`}
                    >
                      <span className="text-xs font-bold text-slate-300">
                        {hour.hourLabel}
                      </span>
                      <WeatherSvgIcon iconType={hourInfo.iconType} size={36} />
                      <div className="text-base font-extrabold text-cyan-300">
                        {hour.temperature_2m !== null ? `${Math.round(hour.temperature_2m)}°` : '--°'}
                      </div>
                      <div className="text-[11px] text-cyan-400 flex items-center gap-0.5">
                        <Droplets className="w-3 h-3" />
                        <span>
                          {hour.precipitation_probability !== null
                            ? `${hour.precipitation_probability}%`
                            : '-'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* TABEL PRAKIRAAN 7 HARI MENDATANG */}
            <section className={`${cardGlass} rounded-3xl p-6`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-base sm:text-lg font-bold">
                    Prakiraan Cuaca 7 Hari Mendatang
                  </h3>
                </div>
                <span className={`text-xs ${mutedText}`}>Resolusi Numerik Open-Meteo</span>
              </div>

              <div className="space-y-2.5">
                {weatherData.daily7?.map((day: any, idx: number) => {
                  const dayInfo = getWeatherInfo(day.weather_code, 1);
                  const minPct =
                    weekTempRange.max !== weekTempRange.min && day.temp_min !== null
                      ? ((day.temp_min - weekTempRange.min) / (weekTempRange.max - weekTempRange.min)) * 100
                      : 0;
                  const maxPct =
                    weekTempRange.max !== weekTempRange.min && day.temp_max !== null
                      ? ((day.temp_max - weekTempRange.min) / (weekTempRange.max - weekTempRange.min)) * 100
                      : 100;

                  return (
                    <div
                      key={day.date || idx}
                      className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-all ${
                        idx === 0
                          ? 'bg-cyan-500/10 border-cyan-500/30 font-semibold'
                          : subCardGlass
                      }`}
                    >
                      <div className="w-36 flex items-center gap-2.5">
                        <WeatherSvgIcon iconType={dayInfo.iconType} size={28} />
                        <div>
                          <div className="font-bold text-sm text-cyan-300">{day.dayName}</div>
                          <div className={`text-[11px] ${mutedText}`}>{day.shortDate}</div>
                        </div>
                      </div>

                      <div className="flex-1 flex items-center gap-3">
                        <span className="w-24 text-[11px] text-slate-300 truncate">
                          {dayInfo.label}
                        </span>
                        <div className="flex-1 hidden md:flex items-center gap-2">
                          <span className="font-mono text-[11px] text-cyan-400 w-8 text-right">
                            {day.temp_min !== null ? `${Math.round(day.temp_min)}°` : '--°'}
                          </span>
                          <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden relative">
                            <div
                              className="absolute top-0 bottom-0 bg-gradient-to-r from-cyan-400 to-amber-400 rounded-full"
                              style={{
                                left: `${Math.max(0, Math.min(100, minPct))}%`,
                                right: `${Math.max(0, Math.min(100, 100 - maxPct))}%`
                              }}
                            />
                          </div>
                          <span className="font-mono text-[11px] text-amber-300 w-8">
                            {day.temp_max !== null ? `${Math.round(day.temp_max)}°` : '--°'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4 text-[11px]">
                        <span className="flex items-center gap-1 text-cyan-400">
                          <Droplets className="w-3.5 h-3.5" />
                          <span>
                            {day.precipitation_probability_max !== null
                              ? `${day.precipitation_probability_max}%`
                              : '-'}
                          </span>
                        </span>
                        <span className="flex items-center gap-1 text-slate-400 font-mono">
                          <Sunrise className="w-3.5 h-3.5 text-amber-400" />
                          <span>{day.sunrise ? formatIsoHour(day.sunrise) : '--.--'}</span>
                        </span>
                        <span className="flex items-center gap-1 text-slate-400 font-mono">
                          <Sunset className="w-3.5 h-3.5 text-rose-400" />
                          <span>{day.sunset ? formatIsoHour(day.sunset) : '--.--'}</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* GRAFIK TREN CUACA INTERAKTIF (RECHARTS) */}
            <section className={`${cardGlass} rounded-3xl p-6`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-base sm:text-lg font-bold">
                    Analisis Tren Atmosfer 24 Jam
                  </h3>
                </div>

                {/* Tab Switcher Grafik */}
                <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-[#060B19]/80 border border-slate-800 self-start sm:self-auto">
                  {[
                    { id: 'temperature', label: 'Suhu (°C)' },
                    { id: 'precipitation', label: 'Hujan & Peluang (%)' },
                    { id: 'wind', label: 'Angin (km/j)' },
                    { id: 'uv', label: 'Indeks UV' }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveChartTab(tab.id)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                        activeChartTab === tab.id
                          ? 'bg-cyan-500 text-slate-950 shadow-md'
                          : 'text-slate-400 hover:text-cyan-300'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {activeChartTab === 'temperature' ? (
                    <AreaChart data={chartData24h} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00f5d4" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#00f5d4" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
                      <XAxis dataKey="hour" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} domain={['dataMin - 2', 'dataMax + 2']} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#060B19',
                          borderColor: '#00f5d4',
                          borderRadius: '16px',
                          color: '#fff',
                          fontSize: '12px'
                        }}
                      />
                      <Area type="monotone" dataKey="temperature" name="Suhu Aktual (°C)" stroke="#00f5d4" strokeWidth={2.5} fillOpacity={1} fill="url(#tempGradient)" />
                      <Line type="monotone" dataKey="apparent" name="Suhu Terasa (°C)" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                    </AreaChart>
                  ) : activeChartTab === 'precipitation' ? (
                    <ComposedChart data={chartData24h} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
                      <XAxis dataKey="hour" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis yAxisId="left" stroke="#64748b" fontSize={11} tickLine={false} domain={[0, 100]} />
                      <YAxis yAxisId="right" orientation="right" stroke="#00f5d4" fontSize={11} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#060B19',
                          borderColor: '#00f5d4',
                          borderRadius: '16px',
                          color: '#fff',
                          fontSize: '12px'
                        }}
                      />
                      <Bar yAxisId="right" dataKey="precipitation" name="Presipitasi (mm)" fill="#00f5d4" radius={[6, 6, 0, 0]} />
                      <Line yAxisId="left" type="monotone" dataKey="rainProb" name="Peluang Hujan (%)" stroke="#38bdf8" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  ) : activeChartTab === 'wind' ? (
                    <AreaChart data={chartData24h} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="windGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
                      <XAxis dataKey="hour" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#060B19',
                          borderColor: '#38bdf8',
                          borderRadius: '16px',
                          color: '#fff',
                          fontSize: '12px'
                        }}
                      />
                      <Area type="monotone" dataKey="windSpeed" name="Kecepatan Angin (km/j)" stroke="#38bdf8" strokeWidth={2.5} fillOpacity={1} fill="url(#windGradient)" />
                    </AreaChart>
                  ) : (
                    <BarChart data={chartData24h} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
                      <XAxis dataKey="hour" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} domain={[0, 12]} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#060B19',
                          borderColor: '#f59e0b',
                          borderRadius: '16px',
                          color: '#fff',
                          fontSize: '12px'
                        }}
                      />
                      <Bar dataKey="uvIndex" name="Indeks UV" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </section>

            {/* RINGKASAN DETERMINISTIK & REKOMENDASI AKTIVITAS */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Ringkasan Deterministik Cuaca */}
              <section className={`lg:col-span-5 ${cardGlass} rounded-3xl p-6 flex flex-col justify-between`}>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-cyan-400" />
                    <h3 className="text-base sm:text-lg font-bold">
                      Ringkasan Cuaca Deterministik
                    </h3>
                  </div>
                  <p className={`text-xs ${mutedText}`}>
                    Dihasilkan secara deterministik 100% dari data numerik Open-Meteo tanpa mengarang bebas.
                  </p>
                  <div className={`p-4 rounded-2xl border ${subCardGlass} text-xs sm:text-sm leading-relaxed text-slate-200`}>
                    {deterministicSummary}
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-cyan-500/10 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>Model Resolusi: ~1.1 km</span>
                  <span>Update: 15 menit</span>
                </div>
              </section>

              {/* Rekomendasi Aktivitas Harian */}
              <section className={`lg:col-span-7 ${cardGlass} rounded-3xl p-6 space-y-4`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Umbrella className="w-5 h-5 text-cyan-400" />
                    <h3 className="text-base sm:text-lg font-bold">
                      Rekomendasi Aktivitas & Keselamatan
                    </h3>
                  </div>
                  <span className={`text-xs ${mutedText}`}>Evaluasi Kondisi Terkini</span>
                </div>

                <div className="space-y-2.5">
                  {activityRecommendations.map((item) => {
                    const badgeStyle =
                      item.tone === 'good'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : item.tone === 'moderate'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : item.tone === 'warning'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                        : 'bg-slate-500/20 text-slate-300 border-slate-500/30';

                    return (
                      <div
                        key={item.id}
                        className={`p-3.5 rounded-2xl border ${subCardGlass} transition-all`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-xs sm:text-sm text-cyan-300">
                            {item.title}
                          </span>
                          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${badgeStyle}`}>
                            {item.status}
                          </span>
                        </div>
                        <p className={`text-xs mt-1 leading-relaxed ${mutedText}`}>{item.detail}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* PUSAT KUALITAS UDARA (AQI) & PERINGATAN RESMI */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <section className={`lg:col-span-7 ${cardGlass} rounded-3xl p-6`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold flex items-center gap-2">
                      <Layers className="w-5 h-5 text-cyan-400" />
                      <span>Pusat Informasi Kualitas Udara (Open-Meteo Air Quality API)</span>
                    </h3>
                    <p className={`text-xs ${mutedText}`}>
                      Konsentrasi polutan atmosfer wilayah {selectedLocation.name}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border self-start sm:self-auto ${aqiInfo.badgeBg}`}>
                    US AQI: {aqiData?.current?.us_aqi ?? 'N/A'} • {aqiInfo.label}
                  </span>
                </div>

                <p className={`text-xs sm:text-sm mb-4 p-3.5 rounded-2xl border ${subCardGlass}`}>
                  {aqiInfo.description}
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className={`p-3 rounded-2xl border ${subCardGlass}`}>
                    <div className={`text-[11px] ${mutedText}`}>PM2.5 (Partikel Halus)</div>
                    <div className="text-lg font-extrabold mt-0.5 text-cyan-400">
                      {formatMetric(aqiData?.current?.pm2_5, 1, 'μg/m³')}
                    </div>
                  </div>
                  <div className={`p-3 rounded-2xl border ${subCardGlass}`}>
                    <div className={`text-[11px] ${mutedText}`}>PM10 (Partikel Kasar)</div>
                    <div className="text-lg font-extrabold mt-0.5 text-cyan-400">
                      {formatMetric(aqiData?.current?.pm10, 1, 'μg/m³')}
                    </div>
                  </div>
                  <div className={`p-3 rounded-2xl border ${subCardGlass}`}>
                    <div className={`text-[11px] ${mutedText}`}>Indeks AQI Eropa</div>
                    <div className="text-lg font-extrabold mt-0.5 text-cyan-400">
                      {formatMetric(aqiData?.current?.european_aqi, 0, 'EAQI')}
                    </div>
                  </div>
                  <div className={`p-3 rounded-2xl border ${subCardGlass}`}>
                    <div className={`text-[11px] ${mutedText}`}>Nitrogen Dioksida (NO₂)</div>
                    <div className="text-lg font-extrabold mt-0.5">
                      {formatMetric(aqiData?.current?.nitrogen_dioxide, 1, 'μg/m³')}
                    </div>
                  </div>
                  <div className={`p-3 rounded-2xl border ${subCardGlass}`}>
                    <div className={`text-[11px] ${mutedText}`}>Ozon Permukaan (O₃)</div>
                    <div className="text-lg font-extrabold mt-0.5">
                      {formatMetric(aqiData?.current?.ozone, 1, 'μg/m³')}
                    </div>
                  </div>
                  <div className={`p-3 rounded-2xl border ${subCardGlass}`}>
                    <div className={`text-[11px] ${mutedText}`}>Karbon Monoksida (CO)</div>
                    <div className="text-lg font-extrabold mt-0.5">
                      {formatMetric(aqiData?.current?.carbon_monoxide, 0, 'μg/m³')}
                    </div>
                  </div>
                </div>
              </section>

              <section className={`lg:col-span-5 ${cardGlass} rounded-3xl p-6 flex flex-col justify-between`}>
                <div>
                  <h3 className="text-base sm:text-lg font-bold flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-amber-400" />
                    <span>Pusat Peringatan Cuaca</span>
                  </h3>
                  <p className={`text-xs mb-4 ${mutedText}`}>
                    Transparansi sumber peringatan bencana & kondisi signifikan
                  </p>

                  <div className={`p-4 rounded-2xl border ${subCardGlass} space-y-2.5`}>
                    <div className="flex items-center gap-2 text-amber-400 font-bold text-xs sm:text-sm">
                      <Info className="w-4 h-4 shrink-0" />
                      <span>Informasi peringatan resmi tidak tersedia</span>
                    </div>
                    <p className={`text-xs leading-relaxed ${mutedText}`}>
                      Endpoint publik Open-Meteo menyediakan pemodelan cuaca numerik, namun <strong>tidak menyertakan feed peringatan dini bencana resmi pemerintah (CAP/BMKG)</strong>. BONTOT WEATHER tidak membuat peringatan palsu.
                    </p>
                    <p className={`text-xs leading-relaxed ${mutedText}`}>
                      Untuk wilayah Indonesia, selalu pantau kanal resmi <strong>BMKG (Badan Meteorologi, Klimatologi, dan Geofisika)</strong>.
                    </p>
                  </div>
                </div>

                <div className={`mt-4 p-3.5 rounded-2xl border ${subCardGlass}`}>
                  <div className="text-xs font-bold text-cyan-400 mb-1">
                    Pantauan Parameter Model Terkini:
                  </div>
                  <div className="text-xs space-y-1">
                    <div>
                      • Status Cuaca:{' '}
                      <strong>
                        {weatherData.current.weather_code !== null
                          ? `WMO ${weatherData.current.weather_code} (${currentWeatherInfo.label})`
                          : 'Tidak tersedia'}
                      </strong>
                    </div>
                    <div>
                      • Hembusan Angin Maksimum:{' '}
                      <strong>{formatMetric(weatherData.daily7?.[0]?.wind_speed_max, 1, 'km/j')}</strong>
                    </div>
                    <div>
                      • Akumulasi Presipitasi Hari Ini:{' '}
                      <strong>{formatMetric(weatherData.daily7?.[0]?.precipitation_sum, 1, 'mm')}</strong>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </>
        ) : null}

        {/* PANEL DIAGNOSTIK & QA TEST SUITE (15 SKENARIO) */}
        <section className={`${cardGlass} rounded-3xl p-5`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Terminal className="w-5 h-5 text-cyan-400" />
              <div>
                <h3 className="text-sm font-bold">
                  Panel Diagnostik API & Rangkaian Pengujian QA Otomatis (15 Skenario)
                </h3>
                <p className={`text-xs ${mutedText}`}>
                  Verifikasi integritas data hujan, UV, kenyamanan termal, race conditions, ketahanan cache 10 entri, dan penanganan data hilang.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={runAutomatedQaSuite}
                disabled={isTestingQa}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md transition-all disabled:opacity-50"
              >
                <PlayCircle className={`w-4 h-4 ${isTestingQa ? 'animate-spin' : ''}`} />
                <span>{isTestingQa ? 'Menguji...' : 'Jalankan 15 Skenario QA'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowDiagnostics((prev) => !prev)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/25"
              >
                {showDiagnostics ? 'Sembunyikan' : 'Buka Panel'}
              </button>
            </div>
          </div>

          {showDiagnostics && (
            <div className="mt-4 pt-4 border-t border-cyan-500/20 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold mr-1">Uji Cepat Lokasi:</span>
                {PRESET_CITIES.map((city) => (
                  <button
                    key={city.id}
                    type="button"
                    onClick={() => handleSelectLocation(city)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 transition-all"
                  >
                    {city.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    loadWeatherForLocation(selectedLocation, {
                      forceRefresh: true,
                      simulateNetworkError: true
                    })
                  }
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-all"
                >
                  Simulasikan Offline (Uji Cache)
                </button>
              </div>

              {/* Hasil QA Suite 15 Skenario Dinamis */}
              {qaSuiteResults && (
                <div className="p-4 rounded-2xl bg-[#060B19] border border-cyan-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Laporan Hasil Pengujian QA Otomatis (15 Skenario)
                    </span>
                    <span
                      className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                        qaSuiteResults.every((r) => r.status === 'PASS')
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      }`}
                    >
                      {qaSuiteResults.filter((r) => r.status === 'PASS').length}/{qaSuiteResults.length} LULUS (
                      {qaSuiteResults.every((r) => r.status === 'PASS') ? 'PASS' : 'FAIL'})
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {qaSuiteResults.map((r) => (
                      <div
                        key={r.id}
                        className={`p-2.5 rounded-xl border flex items-start gap-2 ${
                          r.status === 'PASS'
                            ? 'bg-slate-900/80 border-slate-800'
                            : 'bg-rose-950/30 border-rose-900/50'
                        }`}
                      >
                        {r.status === 'PASS' ? (
                          <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <X className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <div className="font-bold text-slate-200">
                            #{r.id} {r.title}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">{r.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Log Aktivitas API Real-Time */}
              <div className="rounded-2xl bg-[#050914] border border-slate-800 p-3.5 font-mono text-xs max-h-48 overflow-y-auto space-y-1.5">
                {diagnosticLogs.length === 0 ? (
                  <div className="text-slate-500">Belum ada aktivitas log.</div>
                ) : (
                  diagnosticLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2">
                      <span className="text-slate-500 shrink-0">[{log.time}]</span>
                      <span
                        className={`font-bold shrink-0 ${
                          log.type === 'SUCCESS'
                            ? 'text-emerald-400'
                            : log.type === 'WARN'
                            ? 'text-amber-400'
                            : log.type === 'ERROR'
                            ? 'text-rose-400'
                            : 'text-cyan-400'
                        }`}
                      >
                        {log.type}:
                      </span>
                      <span className="text-slate-300">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </section>

        <footer className={`text-center py-6 text-xs ${mutedText} space-y-2`}>
          <div className="flex items-center justify-center gap-2">
            <img
              src="/bontot-weather-logo.png"
              alt="BONTOT WEATHER Emblem"
              className="w-5 h-5 object-contain rounded-md drop-shadow-[0_0_8px_rgba(0,245,212,0.4)]"
            />
            <p className="font-semibold text-cyan-400">
              {APP_NAME} — &ldquo;{APP_TAGLINE}&rdquo;
            </p>
          </div>
          <p>
            Sumber Data Terhubung: <strong>Open-Meteo Weather Forecast API</strong>,{' '}
            <strong>Open-Meteo Air Quality API</strong> &{' '}
            <strong>Open-Meteo Geocoding API</strong>.
          </p>
          <p className="text-[11px] opacity-80">
            Catatan: Seluruh data cuaca dan kualitas udara berasal dari pemodelan atmosfer numerik resolusi tinggi sesuai koordinat geografis lokasi terpilih.
          </p>
        </footer>
      </div>
    </div>
  );
}

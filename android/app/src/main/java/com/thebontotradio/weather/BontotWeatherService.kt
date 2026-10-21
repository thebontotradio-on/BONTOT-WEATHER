package com.thebontotradio.weather

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Layanan data cuaca latar belakang mandiri untuk BONTOT WEATHER Widget.
 * Berkomunikasi langsung dengan Open-Meteo API dan menjaga ketahanan data offline.
 * Kebijakan Integritas: TIDAK PERNAH mengarang data palsu jika API gagal & cache kosong.
 */
object BontotWeatherService {

    private const val PREFS_CACHE = "bontot_widget_cache"
    private const val CAPACITOR_STORAGE = "CapacitorStorage"

    // Default Fallback Koordinat (Jakarta) jika belum ada lokasi tersimpan sama sekali di storage
    private const val DEFAULT_LAT = -6.2088
    private const val DEFAULT_LON = 106.8456
    private const val DEFAULT_NAME = "Jakarta"

    data class LocationTarget(
        val name: String,
        val latitude: Double,
        val longitude: Double,
        val timezone: String
    )

    /**
     * Membaca target lokasi yang dipilih pengguna dari Capacitor Preferences / SharedPreferences.
     * Mengambil koordinat lokasi pilihan pengguna (misal Surabaya, Bandung, dll), bukan selalu Jakarta.
     */
    fun getTargetLocation(context: Context): LocationTarget {
        try {
            val capPrefs = context.getSharedPreferences(CAPACITOR_STORAGE, Context.MODE_PRIVATE)
            val jsonStr = capPrefs.getString("bontot_selected_location", null)
                ?: capPrefs.getString("selected_location", null)
                ?: capPrefs.getString("bontot_weather_last_loc_v1", null)

            if (!jsonStr.isNullOrBlank()) {
                val obj = JSONObject(jsonStr)
                val name = obj.optString("name", "").trim()
                val lat = if (obj.has("latitude") && !obj.isNull("latitude")) obj.optDouble("latitude", Double.NaN) else Double.NaN
                val lon = if (obj.has("longitude") && !obj.isNull("longitude")) obj.optDouble("longitude", Double.NaN) else Double.NaN
                val tz = obj.optString("timezone", "Asia/Jakarta")

                if (name.isNotEmpty() && !lat.isNaN() && !lon.isNaN()) {
                    return LocationTarget(name, lat, lon, tz)
                }
            }
        } catch (_: Exception) {
            // Gunakan fallback default koordinat jika parsing gagal
        }
        return LocationTarget(DEFAULT_NAME, DEFAULT_LAT, DEFAULT_LON, "Asia/Jakarta")
    }

    /**
     * Mengambil data cuaca terbaru secara asinkron dari Open-Meteo API.
     * Menggunakan koordinat lokasi target pilihan pengguna.
     * Dilengkapi mekanisme offline cache fallback tanpa mengarang data cuaca palsu.
     */
    suspend fun getWeatherData(context: Context): WeatherWidgetData = withContext(Dispatchers.IO) {
        val target = getTargetLocation(context)
        val cachePrefs = context.getSharedPreferences(PREFS_CACHE, Context.MODE_PRIVATE)

        try {
            // 1. Fetch Forecast API Open-Meteo dengan koordinat lokasi aktual
            val forecastUrl = "https://api.open-meteo.com/v1/forecast?latitude=${target.latitude}&longitude=${target.longitude}&current=temperature_2m,apparent_temperature,is_day,weather_code&timezone=auto"
            val forecastJson = executeHttpGet(forecastUrl, 6000)

            val currentObj = forecastJson.optJSONObject("current")
            if (currentObj == null) {
                // API tidak mengembalikan node cuaca saat ini -> fallback ke cache tersimpan
                return@withContext readCachedData(cachePrefs, target.name)
            }

            // Ekstraksi nilai secara null-safe dan tahan terhadap NaN
            val tempVal = if (currentObj.has("temperature_2m") && !currentObj.isNull("temperature_2m")) {
                currentObj.optDouble("temperature_2m", Double.NaN)
            } else {
                Double.NaN
            }

            val feelsVal = if (currentObj.has("apparent_temperature") && !currentObj.isNull("apparent_temperature")) {
                currentObj.optDouble("apparent_temperature", Double.NaN)
            } else {
                Double.NaN
            }

            val isDayVal = if (currentObj.has("is_day") && !currentObj.isNull("is_day")) {
                currentObj.optInt("is_day", 1) == 1
            } else {
                true
            }

            val weatherCode = if (currentObj.has("weather_code") && !currentObj.isNull("weather_code")) {
                currentObj.optInt("weather_code")
            } else {
                null
            }

            // Jika API merespons tapi nilai esensial tidak valid (NaN & weatherCode null), fallback ke cache
            if (tempVal.isNaN() && weatherCode == null) {
                return@withContext readCachedData(cachePrefs, target.name)
            }

            // 2. Fetch Air Quality API (US AQI) - Opsional non-blocking
            var aqiVal: Int? = null
            try {
                val aqiUrl = "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${target.latitude}&longitude=${target.longitude}&current=us_aqi"
                val aqiJson = executeHttpGet(aqiUrl, 4000)
                val aqiCurrent = aqiJson.optJSONObject("current")
                if (aqiCurrent != null && aqiCurrent.has("us_aqi") && !aqiCurrent.isNull("us_aqi")) {
                    aqiVal = aqiCurrent.optInt("us_aqi")
                }
            } catch (_: Exception) {
                // AQI opsional; jangan gagalkan cuaca utama jika AQI timeout/gagal
            }

            // 3. Format Strings secara jujur tanpa rekayasa data
            val tempFormatted = if (!tempVal.isNaN()) "${Math.round(tempVal)}°" else "--°"
            val feelsFormatted = if (!feelsVal.isNaN()) "Terasa: ${Math.round(feelsVal)}°C" else "Terasa: --°C"
            val conditionFormatted = BontotWeatherHelper.getWmoCondition(weatherCode, isDayVal)
            val aqiFormatted = BontotWeatherHelper.getAqiLabel(aqiVal)

            val timeFormat = SimpleDateFormat("HH.mm", Locale.getDefault()).apply {
                try {
                    timeZone = TimeZone.getTimeZone(target.timezone)
                } catch (_: Exception) {}
            }
            val timeFormatted = "Diperbarui: ${timeFormat.format(Date())}"

            // 4. Simpan ke Cache Lokal hanya jika data valid
            cachePrefs.edit().apply {
                putString("cached_location", target.name)
                putString("cached_temp", tempFormatted)
                putString("cached_feels", feelsFormatted)
                putString("cached_condition", conditionFormatted)
                putString("cached_aqi", aqiFormatted)
                putString("cached_time", timeFormatted)
                putBoolean("cached_is_day", isDayVal)
                apply()
            }

            WeatherWidgetData(
                locationName = target.name,
                temperature = tempFormatted,
                feelsLike = feelsFormatted,
                condition = conditionFormatted,
                aqiLabel = aqiFormatted,
                lastUpdated = timeFormatted,
                isDay = isDayVal,
                isOffline = false
            )
        } catch (_: Exception) {
            // Fallback ke Cache Lokal Saat Jaringan Gagal / Offline
            readCachedData(cachePrefs, target.name)
        }
    }

    /**
     * Membaca data cache lokal.
     * Jika cache KOSONG: tampilkan "--°", "Data tidak tersedia", "Gagal memuat cuaca (Periksa koneksi)".
     * TIDAK PERNAH mengarang suhu 28°C atau kondisi cerah palsu.
     */
    fun readCachedData(cachePrefs: SharedPreferences, fallbackName: String): WeatherWidgetData {
        val hasCache = cachePrefs.contains("cached_temp")
        if (!hasCache) {
            return WeatherWidgetData(
                locationName = fallbackName,
                temperature = "--°",
                feelsLike = "Terasa: --°C",
                condition = "Data tidak tersedia",
                aqiLabel = "AQI: Tidak tersedia",
                lastUpdated = "Gagal memuat cuaca (Periksa koneksi)",
                isDay = true,
                isOffline = true
            )
        }

        val loc = cachePrefs.getString("cached_location", fallbackName) ?: fallbackName
        val temp = cachePrefs.getString("cached_temp", "--°") ?: "--°"
        val feels = cachePrefs.getString("cached_feels", "Terasa: --°C") ?: "Terasa: --°C"
        val condition = cachePrefs.getString("cached_condition", "Data tidak tersedia") ?: "Data tidak tersedia"
        val aqi = cachePrefs.getString("cached_aqi", "AQI: Tidak tersedia") ?: "AQI: Tidak tersedia"
        val cachedTime = cachePrefs.getString("cached_time", "") ?: ""
        val isDay = cachePrefs.getBoolean("cached_is_day", true)

        val updatedLabel = if (cachedTime.isNotEmpty()) {
            "$cachedTime (Offline)"
        } else {
            "Data tersimpan (Offline)"
        }

        return WeatherWidgetData(
            locationName = loc,
            temperature = temp,
            feelsLike = feels,
            condition = condition,
            aqiLabel = aqi,
            lastUpdated = updatedLabel,
            isDay = isDay,
            isOffline = true
        )
    }

    private fun executeHttpGet(urlString: String, timeoutMs: Int): JSONObject {
        val url = URL(urlString)
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = timeoutMs
            readTimeout = timeoutMs
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", "BONTOT-WEATHER-Android-AppWidget/1.0")
        }

        val code = conn.responseCode
        if (code != HttpURLConnection.HTTP_OK) {
            throw RuntimeException("HTTP Error code: $code")
        }

        val reader = BufferedReader(InputStreamReader(conn.inputStream))
        val sb = StringBuilder()
        var line: String?
        while (reader.readLine().also { line = it } != null) {
            sb.append(line)
        }
        reader.close()
        conn.disconnect()

        return JSONObject(sb.toString())
    }
}

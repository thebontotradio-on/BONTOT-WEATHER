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
 */
object BontotWeatherService {

    private const val PREFS_CACHE = "bontot_widget_cache"
    private const val CAPACITOR_STORAGE = "CapacitorStorage"

    // Default Fallback: Jakarta
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
     */
    fun getTargetLocation(context: Context): LocationTarget {
        try {
            val capPrefs = context.getSharedPreferences(CAPACITOR_STORAGE, Context.MODE_PRIVATE)
            val jsonStr = capPrefs.getString("bontot_selected_location", null)
                ?: capPrefs.getString("bontot_weather_last_loc_v1", null)

            if (!jsonStr.isNullOrBlank()) {
                val obj = JSONObject(jsonStr)
                val name = obj.optString("name", DEFAULT_NAME)
                val lat = obj.optDouble("latitude", DEFAULT_LAT)
                val lon = obj.optDouble("longitude", DEFAULT_LON)
                val tz = obj.optString("timezone", "Asia/Jakarta")
                return LocationTarget(name, lat, lon, tz)
            }
        } catch (_: Exception) {
            // Gunakan default aman jika parsing preferensi gagal
        }
        return LocationTarget(DEFAULT_NAME, DEFAULT_LAT, DEFAULT_LON, "Asia/Jakarta")
    }

    /**
     * Mengambil data cuaca terbaru secara asinkron dari Open-Meteo API.
     * Dilengkapi mekanisme offline cache fallback.
     */
    suspend fun getWeatherData(context: Context): WeatherWidgetData = withContext(Dispatchers.IO) {
        val target = getTargetLocation(context)
        val cachePrefs = context.getSharedPreferences(PREFS_CACHE, Context.MODE_PRIVATE)

        try {
            // 1. Fetch Forecast API Open-Meteo
            val forecastUrl = "https://api.open-meteo.com/v1/forecast?latitude=${target.latitude}&longitude=${target.longitude}&current=temperature_2m,apparent_temperature,is_day,weather_code&timezone=auto"
            val forecastJson = executeHttpGet(forecastUrl, 6000)

            val currentObj = forecastJson.optJSONObject("current")
            val tempVal = currentObj?.optDouble("temperature_2m", Double.NaN) ?: Double.NaN
            val feelsVal = currentObj?.optDouble("apparent_temperature", Double.NaN) ?: Double.NaN
            val isDayVal = (currentObj?.optInt("is_day", 1) ?: 1) == 1
            val weatherCode = if (currentObj != null && currentObj.has("weather_code")) currentObj.optInt("weather_code") else null

            // 2. Fetch Air Quality API (US AQI)
            var aqiVal: Int? = null
            try {
                val aqiUrl = "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${target.latitude}&longitude=${target.longitude}&current=us_aqi"
                val aqiJson = executeHttpGet(aqiUrl, 4000)
                val aqiCurrent = aqiJson.optJSONObject("current")
                if (aqiCurrent != null && aqiCurrent.has("us_aqi")) {
                    aqiVal = aqiCurrent.optInt("us_aqi")
                }
            } catch (_: Exception) {
                // AQI opsional; jangan gagalkan cuaca utama jika AQI timeout
            }

            // 3. Format Strings
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

            // 4. Simpan ke Cache Lokal
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
            // Fallback ke Cache Lokal Saat Offline / Gagal
            readCachedData(cachePrefs, target.name)
        }
    }

    private fun readCachedData(cachePrefs: SharedPreferences, fallbackName: String): WeatherWidgetData {
        val loc = cachePrefs.getString("cached_location", fallbackName) ?: fallbackName
        val temp = cachePrefs.getString("cached_temp", "--°") ?: "--°"
        val feels = cachePrefs.getString("cached_feels", "Terasa: --°C") ?: "Terasa: --°C"
        val condition = cachePrefs.getString("cached_condition", "Kondisi Tidak Tersedia") ?: "Kondisi Tidak Tersedia"
        val aqi = cachePrefs.getString("cached_aqi", "Kualitas Udara: --") ?: "Kualitas Udara: --"
        val cachedTime = cachePrefs.getString("cached_time", "Offline") ?: "Offline"
        val isDay = cachePrefs.getBoolean("cached_is_day", true)

        return WeatherWidgetData(
            locationName = loc,
            temperature = temp,
            feelsLike = feels,
            condition = condition,
            aqiLabel = aqi,
            lastUpdated = "$cachedTime (Offline)",
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

package com.thebontotradio.weather

/**
 * Model data cuaca dan pemetaan WMO untuk Android Home Screen Widget.
 * Mengikuti logika resmi web app BONTOT WEATHER.
 */
data class WeatherWidgetData(
    val locationName: String = "Jakarta",
    val temperature: String = "--°",
    val feelsLike: String = "Terasa: --°C",
    val condition: String = "Memuat Cuaca...",
    val aqiLabel: String = "Kualitas Udara: --",
    val lastUpdated: String = "Diperbarui: --.--",
    val isDay: Boolean = true,
    val isOffline: Boolean = false
)

object BontotWeatherHelper {
    /**
     * Menerjemahkan kode WMO (0-99) ke Bahasa Indonesia secara netral & null-safe.
     */
    fun getWmoCondition(code: Int?, isDay: Boolean): String {
        if (code == null) return "Kondisi Tidak Diketahui"
        return when (code) {
            0 -> if (isDay) "Cerah" else "Malam Cerah"
            1 -> if (isDay) "Cerah Berawan" else "Malam Cerah Berawan"
            2 -> "Berawan Sebagian"
            3 -> "Mendung / Berawan Tebal"
            45, 48 -> "Berkabut"
            51, 53, 55, 56, 57 -> "Gerimis"
            61, 63, 66, 80, 81 -> "Hujan"
            65, 67, 82 -> "Hujan Lebat"
            71, 73, 75, 77, 85, 86 -> "Salju"
            95, 96, 99 -> "Badai Petir"
            else -> "Kondisi Tidak Diketahui"
        }
    }

    /**
     * Menerjemahkan US AQI ke standar kesehatan pernapasan.
     */
    fun getAqiLabel(aqi: Int?): String {
        if (aqi == null || aqi < 0) return "Kualitas Udara: Tidak Tersedia"
        val status = when {
            aqi <= 50 -> "Baik ($aqi)"
            aqi <= 100 -> "Sedang ($aqi)"
            aqi <= 150 -> "Sensitif ($aqi)"
            aqi <= 200 -> "Tidak Sehat ($aqi)"
            aqi <= 300 -> "Sangat Tdk Sehat ($aqi)"
            else -> "Berbahaya ($aqi)"
        }
        return "AQI: $status"
    }
}

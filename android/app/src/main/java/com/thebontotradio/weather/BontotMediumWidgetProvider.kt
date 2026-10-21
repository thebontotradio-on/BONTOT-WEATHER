package com.thebontotradio.weather

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean

/**
 * AppWidgetProvider untuk Widget Medium (4x2) BONTOT WEATHER.
 * Menggunakan goAsync() untuk menjamin request selesai meskipun proses di-background-kan Android.
 */
class BontotMediumWidgetProvider : AppWidgetProvider() {

    companion object {
        const val ACTION_REFRESH_MEDIUM = "com.thebontotradio.weather.ACTION_REFRESH_MEDIUM"
        private val isRefreshing = AtomicBoolean(false)
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        if (appWidgetIds.isEmpty()) return
        refreshAllWidgets(context, appWidgetManager, appWidgetIds)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH_MEDIUM) {
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val thisWidget = ComponentName(context, BontotMediumWidgetProvider::class.java)
            val allWidgetIds = appWidgetManager.getAppWidgetIds(thisWidget)
            if (allWidgetIds.isNotEmpty()) {
                refreshAllWidgets(context, appWidgetManager, allWidgetIds)
            }
        }
    }

    private fun refreshAllWidgets(context: Context, appWidgetManager: AppWidgetManager, widgetIds: IntArray) {
        // Tampilkan status loading awal seketika pada semua widget
        for (id in widgetIds) {
            val loadingViews = RemoteViews(context.packageName, R.layout.widget_bontot_medium)
            bindIntents(context, loadingViews)
            loadingViews.setTextViewText(R.id.tv_widget_condition, "Memperbarui...")
            appWidgetManager.partiallyUpdateAppWidget(id, loadingViews)
        }

        // Cegah penumpukan request ganda jika refresh sedang berjalan
        if (!isRefreshing.compareAndSet(false, true)) {
            return
        }

        val pendingResult = goAsync()

        CoroutineScope(Dispatchers.IO).launch {
            try {
                // Ambil data satu kali untuk semua widget ID (efisiensi jaringan & baterai)
                val data = BontotWeatherService.getWeatherData(context)

                for (id in widgetIds) {
                    val views = RemoteViews(context.packageName, R.layout.widget_bontot_medium)
                    bindIntents(context, views)

                    views.setTextViewText(R.id.tv_widget_location, data.locationName)
                    views.setTextViewText(R.id.tv_widget_temp, data.temperature)
                    views.setTextViewText(R.id.tv_widget_feels_like, data.feelsLike)
                    views.setTextViewText(R.id.tv_widget_condition, data.condition)
                    views.setTextViewText(R.id.tv_widget_aqi, data.aqiLabel)
                    views.setTextViewText(R.id.tv_widget_updated, data.lastUpdated)

                    appWidgetManager.updateAppWidget(id, views)
                }
            } catch (_: Exception) {
                // Cegah crash jika terjadi unhandled error
            } finally {
                isRefreshing.set(false)
                try {
                    pendingResult.finish()
                } catch (_: Exception) {}
            }
        }
    }

    private fun bindIntents(context: Context, views: RemoteViews) {
        // 1. PendingIntent untuk membuka MainActivity saat widget diketuk
        val openAppIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("from_widget", true)
            putExtra("widget_size", "medium")
        }
        val openAppPendingIntent = PendingIntent.getActivity(
            context,
            201,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_medium_root, openAppPendingIntent)

        // 2. PendingIntent untuk tombol manual refresh
        val refreshIntent = Intent(context, BontotMediumWidgetProvider::class.java).apply {
            action = ACTION_REFRESH_MEDIUM
        }
        val refreshPendingIntent = PendingIntent.getBroadcast(
            context,
            202,
            refreshIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.btn_widget_refresh, refreshPendingIntent)
    }
}

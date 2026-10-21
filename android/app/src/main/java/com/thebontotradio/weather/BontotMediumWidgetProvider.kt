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

/**
 * AppWidgetProvider untuk Widget Medium (4x2) BONTOT WEATHER.
 */
class BontotMediumWidgetProvider : AppWidgetProvider() {

    companion object {
        const val ACTION_REFRESH_MEDIUM = "com.thebontotradio.weather.ACTION_REFRESH_MEDIUM"
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH_MEDIUM) {
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val thisWidget = ComponentName(context, BontotMediumWidgetProvider::class.java)
            val allWidgetIds = appWidgetManager.getAppWidgetIds(thisWidget)
            for (widgetId in allWidgetIds) {
                updateWidget(context, appWidgetManager, widgetId)
            }
        }
    }

    private fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
        val views = RemoteViews(context.packageName, R.layout.widget_bontot_medium)

        // 1. PendingIntent untuk membuka MainActivity saat widget diketuk
        val openAppIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
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

        // 3. Status loading sementara sebelum data masuk
        views.setTextViewText(R.id.tv_widget_condition, "Memperbarui...")
        appWidgetManager.partiallyUpdateAppWidget(appWidgetId, views)

        // 4. Ambil data cuaca di background coroutine
        CoroutineScope(Dispatchers.Main).launch {
            val data = BontotWeatherService.getWeatherData(context)

            views.setTextViewText(R.id.tv_widget_location, data.locationName)
            views.setTextViewText(R.id.tv_widget_temp, data.temperature)
            views.setTextViewText(R.id.tv_widget_feels_like, data.feelsLike)
            views.setTextViewText(R.id.tv_widget_condition, data.condition)
            views.setTextViewText(R.id.tv_widget_aqi, data.aqiLabel)
            views.setTextViewText(R.id.tv_widget_updated, data.lastUpdated)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}

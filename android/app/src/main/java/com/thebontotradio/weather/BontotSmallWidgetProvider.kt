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
 * AppWidgetProvider untuk Widget Kecil (2x2) BONTOT WEATHER.
 */
class BontotSmallWidgetProvider : AppWidgetProvider() {

    companion object {
        const val ACTION_REFRESH_SMALL = "com.thebontotradio.weather.ACTION_REFRESH_SMALL"
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH_SMALL) {
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val thisWidget = ComponentName(context, BontotSmallWidgetProvider::class.java)
            val allWidgetIds = appWidgetManager.getAppWidgetIds(thisWidget)
            for (widgetId in allWidgetIds) {
                updateWidget(context, appWidgetManager, widgetId)
            }
        }
    }

    private fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
        val views = RemoteViews(context.packageName, R.layout.widget_bontot_small)

        // 1. PendingIntent untuk membuka MainActivity saat widget diketuk
        val openAppIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val openAppPendingIntent = PendingIntent.getActivity(
            context,
            101,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_small_root, openAppPendingIntent)

        // 2. PendingIntent untuk tombol manual refresh
        val refreshIntent = Intent(context, BontotSmallWidgetProvider::class.java).apply {
            action = ACTION_REFRESH_SMALL
        }
        val refreshPendingIntent = PendingIntent.getBroadcast(
            context,
            102,
            refreshIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.btn_widget_refresh, refreshPendingIntent)

        // 3. Status loading sementara sebelum fetch selesai
        views.setTextViewText(R.id.tv_widget_condition, "Memperbarui...")
        appWidgetManager.partiallyUpdateAppWidget(appWidgetId, views)

        // 4. Ambil data cuaca di background coroutine
        CoroutineScope(Dispatchers.Main).launch {
            val data = BontotWeatherService.getWeatherData(context)

            views.setTextViewText(R.id.tv_widget_location, data.locationName)
            views.setTextViewText(R.id.tv_widget_temp, data.temperature)
            views.setTextViewText(R.id.tv_widget_condition, data.condition)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}

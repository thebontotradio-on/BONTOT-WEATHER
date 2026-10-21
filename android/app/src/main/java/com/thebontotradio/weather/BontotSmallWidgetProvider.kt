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
 * AppWidgetProvider untuk Widget Kecil (2x2) BONTOT WEATHER.
 * Menggunakan goAsync() untuk menjamin request selesai meskipun proses di-background-kan Android.
 * Anti-Fake Data: Tidak pernah menampilkan data buatan jika gagal.
 */
class BontotSmallWidgetProvider : AppWidgetProvider() {

    companion object {
        const val ACTION_REFRESH_SMALL = "com.thebontotradio.weather.ACTION_REFRESH_SMALL"
        private val isRefreshing = AtomicBoolean(false)
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        if (appWidgetIds.isEmpty()) return
        refreshAllWidgets(context, appWidgetManager, appWidgetIds)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH_SMALL) {
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val thisWidget = ComponentName(context, BontotSmallWidgetProvider::class.java)
            val allWidgetIds = appWidgetManager.getAppWidgetIds(thisWidget)
            if (allWidgetIds.isNotEmpty()) {
                refreshAllWidgets(context, appWidgetManager, allWidgetIds)
            }
        }
    }

    private fun refreshAllWidgets(context: Context, appWidgetManager: AppWidgetManager, widgetIds: IntArray) {
        // Tampilkan status loading awal seketika pada semua widget
        for (id in widgetIds) {
            val loadingViews = RemoteViews(context.packageName, R.layout.widget_bontot_small)
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
                    val views = RemoteViews(context.packageName, R.layout.widget_bontot_small)
                    bindIntents(context, views)

                    views.setTextViewText(R.id.tv_widget_location, data.locationName)
                    views.setTextViewText(R.id.tv_widget_temp, data.temperature)
                    views.setTextViewText(R.id.tv_widget_condition, data.condition)

                    appWidgetManager.updateAppWidget(id, views)
                }
            } catch (_: Exception) {
                // Jangan biarkan widget crash saat terjadi unhandled error; tampilkan status kegagalan jujur
                for (id in widgetIds) {
                    val errorViews = RemoteViews(context.packageName, R.layout.widget_bontot_small)
                    bindIntents(context, errorViews)
                    errorViews.setTextViewText(R.id.tv_widget_temp, "--°")
                    errorViews.setTextViewText(R.id.tv_widget_condition, "Data tidak tersedia")
                    appWidgetManager.partiallyUpdateAppWidget(id, errorViews)
                }
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
            putExtra("widget_size", "small")
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
    }
}

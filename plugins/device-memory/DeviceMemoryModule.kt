package com.dasheepinteligencia.APP_COLETA_MOBILE

import android.app.ActivityManager
import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DeviceMemoryModule(
  private val context: ReactApplicationContext
) : ReactContextBaseJavaModule(context) {

  override fun getName(): String = "DeviceMemory"

  @ReactMethod
  fun getMemoryInfo(promise: Promise) {
    try {
      val activityManager =
        context.getSystemService(Context.ACTIVITY_SERVICE)
          as ActivityManager

      val systemMemory =
        ActivityManager.MemoryInfo()

      activityManager.getMemoryInfo(systemMemory)

      val processMemory =
        activityManager
          .getProcessMemoryInfo(
            intArrayOf(android.os.Process.myPid())
          )
          .firstOrNull()

      val bytesPerMb =
        1024.0 * 1024.0

      val runtime =
        Runtime.getRuntime()

      val javaHeapUsed =
        runtime.totalMemory() -
        runtime.freeMemory()

      val result =
        Arguments.createMap()

      result.putDouble(
        "totalMemoryMb",
        systemMemory.totalMem / bytesPerMb
      )

      result.putDouble(
        "availableMemoryMb",
        systemMemory.availMem / bytesPerMb
      )

      result.putBoolean(
        "lowMemory",
        systemMemory.lowMemory
      )

      result.putDouble(
        "memoryThresholdMb",
        systemMemory.threshold / bytesPerMb
      )

      if (processMemory != null) {
        result.putDouble(
          "appMemoryMb",
          processMemory.totalPss / 1024.0
        )

        result.putDouble(
          "appPrivateDirtyMb",
          processMemory.totalPrivateDirty / 1024.0
        )
      }

      result.putDouble(
        "appJavaHeapUsedMb",
        javaHeapUsed / bytesPerMb
      )

      result.putDouble(
        "appJavaHeapMaxMb",
        runtime.maxMemory() / bytesPerMb
      )

      promise.resolve(result)

    } catch (error: Exception) {
      promise.reject(
        "DEVICE_MEMORY_ERROR",
        error.message,
        error
      )
    }
  }
}

package com.routerunner.navigation

import android.content.Intent
import android.net.Uri
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

class RouteNavigationModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "RouteNavigation"

  private fun mapsIntent(url: String): Intent {
    val uri = Uri.parse(url)
    require(uri.scheme == "https" && uri.host == "www.google.com" && uri.path == "/maps/dir/") {
      "Unsupported navigation URL"
    }
    return Intent(Intent.ACTION_VIEW, uri)
      .setPackage("com.google.android.apps.maps")
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
  }

  @ReactMethod
  fun isAvailable(promise: Promise) {
    try {
      promise.resolve(mapsIntent("https://www.google.com/maps/dir/?api=1").resolveActivity(context.packageManager) != null)
    } catch (error: Exception) {
      promise.reject("NAVIGATION_CHECK_FAILED", "Unable to check Google Maps availability", error)
    }
  }

  @ReactMethod
  fun open(url: String, promise: Promise) {
    try {
      val intent = mapsIntent(url)
      if (intent.resolveActivity(context.packageManager) == null) {
        promise.reject("NAVIGATION_UNAVAILABLE", "Google Maps is unavailable")
        return
      }
      context.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("NAVIGATION_OPEN_FAILED", "Unable to open Google Maps", error)
    }
  }
}

class RouteNavigationPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(RouteNavigationModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

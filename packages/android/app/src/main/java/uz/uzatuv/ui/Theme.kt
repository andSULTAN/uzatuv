package uz.uzatuv.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * Uzatuv Compose tema — brend ranglari.
 * Telefon va planshetda bir xil ishlaydi (responsive layout ekranlarda).
 */

private val Brand = Color(0xFF2E6BFF)
private val BrandDark = Color(0xFF1E4FCC)
private val BgDark = Color(0xFF0B1220)
private val SurfaceDark = Color(0xFF141C2E)

private val DarkColors = darkColorScheme(
    primary = Brand,
    onPrimary = Color.White,
    secondary = BrandDark,
    background = BgDark,
    onBackground = Color(0xFFE6EAF2),
    surface = SurfaceDark,
    onSurface = Color(0xFFE6EAF2),
)

private val LightColors = lightColorScheme(
    primary = Brand,
    onPrimary = Color.White,
    secondary = BrandDark,
)

@Composable
fun UzatuvTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = Typography(),
        content = content,
    )
}

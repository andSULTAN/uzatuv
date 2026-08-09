// Ildiz build fayli — pluginlar faqat e'lon qilinadi (apply=false),
// haqiqiy qo'llash app moduli ichida bo'ladi.

plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
}

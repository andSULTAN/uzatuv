# Uzatuv Android — ProGuard/R8 qoidalari.
# v1'da minify o'chirilgan; release'da yoqilsa quyidagilar kerak bo'ladi.

# Protokol sinflari refleksiyasiz ishlaydi — maxsus qoida shart emas.
# ML Kit ichki modellari uchun:
-keep class com.google.mlkit.** { *; }
-dontwarn com.google.mlkit.**

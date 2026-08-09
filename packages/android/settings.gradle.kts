// Uzatuv — Android klient (yuboruvchi) Gradle sozlamalari.
// Ildiz loyiha nomi va modul(lar) shu yerda e'lon qilinadi.

pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    // Modullar o'z repozitoriysini e'lon qila olmaydi — hammasi shu yerdan.
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "Uzatuv"
include(":app")

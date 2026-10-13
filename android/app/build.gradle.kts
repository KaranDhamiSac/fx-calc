import javax.inject.Inject

plugins {
    id("com.android.application")
}

// The calculator itself lives at the repo root (it's also the web/PWA version).
// Bundle those files into the APK as assets/www so the app works fully offline.
abstract class CopyWebAssets : DefaultTask() {
    @get:InputFiles
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val webFiles: ConfigurableFileCollection

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @get:Inject
    abstract val fs: FileSystemOperations

    @TaskAction
    fun copy() {
        fs.sync {
            from(webFiles)
            into(outputDir.dir("www"))
        }
    }
}

val copyWebAssets = tasks.register<CopyWebAssets>("copyWebAssets") {
    webFiles.from(fileTree(rootDir.parentFile) {
        include("index.html", "style.css", "engine.js", "engine-x.js", "editor.js", "app.js", "icons/**")
    })
}

val buildNumber = (System.getenv("VERSION_CODE") ?: "1").toInt()
val releaseKeystore = rootProject.file("release.jks")

android {
    namespace = "io.github.karandhamisac.fxcalc"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.karandhamisac.fxcalc"
        minSdk = 24
        targetSdk = 35
        versionCode = buildNumber
        versionName = "1.0.$buildNumber"
    }

    signingConfigs {
        create("release") {
            if (releaseKeystore.exists()) {
                storeFile = releaseKeystore
                storePassword = System.getenv("KEYSTORE_PASSWORD")
                keyAlias = System.getenv("KEY_ALIAS")
                keyPassword = System.getenv("KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (releaseKeystore.exists()) signingConfigs.getByName("release")
                            else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        checkReleaseBuilds = false
    }
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(copyWebAssets, CopyWebAssets::outputDir)
    }
}

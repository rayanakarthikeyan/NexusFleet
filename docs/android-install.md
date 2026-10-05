# Install the Android demo

Download the `.apk` linked in the repository README onto the phone, then open it in the phone's Downloads/Files app. The app is standalone; Expo Go and Metro are not needed.

The `phone` build is for ARM64 Android phones. `preview` builds a universal APK with ARM64, ARM32 and x86 emulator libraries. The minimum Android version is 7 (API 24); Expo SDK 54 targets Android 16 (API 36). APKs use the same EAS signing key so a newer version can update an existing installation without clearing its offline queue.

## If Android says it cannot install

1. Confirm the file downloaded completely and ends in `.apk`. Compare the size or SHA-256 with the release checksum. An HTML login page or partial download is not an APK.
2. Android may ask you to allow installation from the app opening the file, such as Files or Chrome. Allow that source if you intend to install this demo. Do not disable Play Protect to hide a warning; record the warning and investigate it.
3. Check available storage. Download size is smaller than the installed app because native libraries are compressed. Leave enough space for Android to extract and stage the update.
4. Record the phone model, Android version and complete installer message. A work-managed device can enforce an installation policy that app code cannot override.
5. If another build uses the same package with a different signing certificate, Android rejects the update. Do not uninstall an active driver installation with queued points: first stop the trip and confirm the queue has uploaded. Uninstalling deletes local queue data.

With Android platform-tools and a USB-debugging connection, the installer can report a more specific error:

```powershell
adb shell getprop ro.product.cpu.abilist
adb shell getconf PAGE_SIZE
adb install -r .\NexusFleet-1.0.1-arm64.apk
```

Share the `INSTALL_FAILED_...` result rather than device logs containing credentials or real locations. `-r` requests an update preserving app data; it does not resolve incompatible signatures or device policy.

The original 1.0.0 APK was verified with Google's apksig verifier through API 36, and its 64-bit native ELF libraries passed 16 KB page-alignment checks. These checks establish package properties, not successful installation on every handset. See [Android's page-size requirements](https://developer.android.com/guide/practices/page-sizes).

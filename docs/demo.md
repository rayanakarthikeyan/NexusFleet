# Two-device demo

## Demonstration on two Android devices

1. Connect the driver and consumer with credentials for the same trip. Grant precise foreground location, then choose **Allow all the time** in the Android settings screen. Start the driver trip while the app is visible.
2. Move with the device. The consumer should animate between committed GPS fixes. Android shows the foreground service notification.
3. Turn on **Simulate Network Drop** and continue moving. The queue count grows and PostgreSQL receives no new points from subsequent captures while the flag remains active.
4. Background and reopen the driver app. The simulation flag and queue remain persisted. Turning off the flag starts burst delivery; the consumer fills the historical path with compressed interpolation.
5. Repeat with a real dead zone or airplane mode. Restore connectivity and return to the app. Confirm the queue drains and queued UUIDs appear exactly once in PostgreSQL.
6. Interrupt the API during delivery, restart it, and retry. Confirm the local queue remains until a commit ACK arrives. Kill the driver process after a batch has committed but before local deletion; reopening should safely retry those IDs.

The flag gates new delivery attempts. An upload already in flight when the button is pressed can finish and acknowledge its already-captured points. The simulator does not disable the separate consumer connection.

## Device validation still required

Run the steps above on a physical Android phone before sharing an APK. The Node tests cannot verify native SQLite durability, Android service behavior, or the animated Maps marker. Keep a record of the device model, Android version and permission settings alongside a demo recording.

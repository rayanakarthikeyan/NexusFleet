import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import {
  Map as FleetMap,
  Camera,
  CameraRef,
  Marker,
  MarkerProps,
  GeoJSONSource,
  Layer,
} from '@maplibre/maplibre-react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { io } from 'socket.io-client';
import { LocationFrame, Session } from '../types';
import { api, backendUrl, credential } from '../services/Transport';
import {
  bearing,
  normalizeHeading,
  normalizeLongitude,
  shortestDelta,
} from '../services/interpolation';
import { colors } from '../theme';
const AnimatedMarker = Animated.createAnimatedComponent(Marker);
const origin = { latitude: 12.9716, longitude: 77.5946 };
interface HistoryPage {
  points: LocationFrame[];
  nextCursor: number;
  hasMore: boolean;
}
export default function ConsumerMap({ session }: { session: Session }) {
  const latitude = useSharedValue(origin.latitude);
  const longitude = useSharedValue(origin.longitude);
  const heading = useSharedValue(0);
  const completion = useSharedValue(0);
  const camera = useRef<CameraRef>(null);
  const firstFix = useRef<[number, number] | null>(null);
  const [visible, setVisible] = useState(false);
  const [path, setPath] = useState<{ latitude: number; longitude: number }[]>([]);
  const [status, setStatus] = useState('Connecting…');
  const animatedProps = useAnimatedProps<MarkerProps>(() => ({
    // MapLibre expects longitude first. Marker exposes getAnimatableRef for
    // Reanimated 4, so this prop reaches the Fabric view on the UI thread.
    lngLat: [normalizeLongitude(longitude.value), latitude.value],
  }));
  const markerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${normalizeHeading(heading.value)}deg` }],
  }));
  const route = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: path.map((point) => [point.longitude, point.latitude]),
      },
    }),
    [path],
  );
  useEffect(() => {
    let stopped = false,
      initialized = false,
      playing = false,
      fetching = false;
    let cursor = 0,
      highestTimestamp = -1;
    let previous: LocationFrame | undefined;
    const pending = new Map<number, LocationFrame>();
    const playback: LocationFrame[] = [];
    let wake: (() => void) | undefined;
    let socket: ReturnType<typeof io> | undefined;
    let viewerToken: string | undefined;
    const displayedPath: { latitude: number; longitude: number; timestamp: number }[] = [];
    let pathDirty = false;
    function appendPath(p: LocationFrame) {
      displayedPath.push({ latitude: p.latitude, longitude: p.longitude, timestamp: p.timestamp });
      // Bound rendering memory; the complete path remains in PostgreSQL.
      if (displayedPath.length > 5000) displayedPath.shift();
      pathDirty = true;
    }
    function finished() {
      if (stopped) return;
      playing = false;
      if (!playback.length) setStatus(socket?.connected ? 'Live' : 'Waiting for connectivity');
      wake?.();
      wake = undefined;
      playNext();
    }
    function playNext() {
      if (stopped || playing) return;
      let point = playback.shift();
      // Late uploads still remain in history/path, but must not drag the live
      // vehicle backwards in time after a newer fix has already been shown.
      while (point && point.timestamp < highestTimestamp) {
        appendPath(point);
        point = playback.shift();
      }
      if (!point) {
        wake?.();
        wake = undefined;
        return;
      }
      const p = point;
      highestTimestamp = p.timestamp;
      appendPath(p);
      const targetHeading =
        p.heading ??
        (previous ? bearing(previous.latitude, previous.longitude, p.latitude, p.longitude) : null);
      if (!initialized) {
        initialized = true;
        latitude.value = p.latitude;
        longitude.value = p.longitude;
        heading.value = targetHeading ?? 0;
        setVisible(true);
        firstFix.current = [p.longitude, p.latitude];
        camera.current?.jumpTo({ center: firstFix.current, zoom: 16 });
      }
      const catchUp = playback.length > 0 || p.isOfflineCache;
      const duration = catchUp ? Math.max(30, Math.min(120, 2000 / (playback.length + 1))) : 1000;
      setStatus(catchUp ? `Catch-up · ${playback.length + 1} fixes` : 'Live');
      // withTiming yields v(t) = v0 + (v1-v0) * t/duration (linear easing).
      // Unwrap longitude/bearing first, so 179 -> -179 crosses 2°, not 358°.
      latitude.value = withTiming(p.latitude, { duration, easing: Easing.linear });
      longitude.value = withTiming(longitude.value + shortestDelta(longitude.value, p.longitude), {
        duration,
        easing: Easing.linear,
      });
      if (targetHeading !== null)
        heading.value = withTiming(heading.value + shortestDelta(heading.value, targetHeading), {
          duration,
          easing: Easing.linear,
        });
      previous = p;
      playing = true;
      // Completion comes from the UI animation clock, not a JS setTimeout that
      // could fire early/late while the JS thread is busy decoding a burst.
      completion.value = 0;
      completion.value = withTiming(1, { duration, easing: Easing.linear }, (done) => {
        if (done) scheduleOnRN(finished);
      });
    }
    function receive(points: LocationFrame[]) {
      if (stopped) return;
      for (const p of points)
        if (p.tripId === session.tripId && p.sequence > cursor) pending.set(p.sequence, p);
      // Delivery order can differ from commit order; never advance past a gap.
      while (pending.has(cursor + 1)) {
        const next = pending.get(cursor + 1)!;
        pending.delete(++cursor);
        playback.push(next);
      }
      playNext();
    }
    async function recover() {
      if (stopped || fetching) return;
      fetching = true;
      try {
        let more = true;
        while (more && !stopped) {
          // Apply backpressure to history reads while replay is catching up.
          if (playback.length >= 1000)
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
          if (stopped) return;
          if (!viewerToken) return;
          const page = await api<HistoryPage>(
            `/telemetry/history?after=${cursor}`,
            {},
            viewerToken,
          );
          if (stopped) return;
          receive(page.points);
          more = page.hasMore;
          if (!more && !page.points.length && !initialized)
            setStatus('Waiting for the first GPS fix');
        }
      } catch (error) {
        if (!stopped)
          setStatus(error instanceof Error ? error.message : 'History reconnect failed');
      } finally {
        fetching = false;
      }
    }
    const connect = async () => {
      try {
        const token = await credential(session);
        viewerToken = token;
        if (stopped) return;
        socket = io(backendUrl(), { transports: ['websocket'], auth: { token }, timeout: 5000 });
        socket.on('location_frames', (batch: { points: LocationFrame[] }) => {
          // Large sparse socket bursts can otherwise grow an unbounded map.
          // History recovery is authoritative and fills any omitted sequence.
          if (pending.size < 1000 && playback.length < 1000 && Array.isArray(batch?.points))
            receive(batch.points);
          void recover();
        });
        socket.on('connect', () => {
          socket!
            .timeout(5000)
            .emit(
              'subscribe_trip',
              { trip_id: session.tripId },
              (error: Error | null, ack: { success?: boolean }) => {
                if (stopped) return;
                if (error || !ack?.success)
                  setStatus('Trip subscription failed; recovering over HTTP');
                // Subscribe FIRST, then read history: overlap is deduplicated by
                // sequence, and the subscribe/history race cannot drop a frame.
                void recover();
              },
            );
        });
        socket.on('connect_error', () => {
          if (!stopped) setStatus('Reconnecting; recovering history');
        });
        socket.on('disconnect', () => {
          if (!stopped) setStatus('Reconnecting…');
        });
        void recover();
      } catch (error) {
        if (!stopped) setStatus(String(error));
      }
    };
    void connect();
    const poll = setInterval(() => {
      if (AppState.currentState === 'active') void recover();
    }, 5000);
    const draw = setInterval(() => {
      if (pathDirty && !stopped) {
        pathDirty = false;
        // An older delayed batch fills the historical line at its event time.
        setPath([...displayedPath].sort((a, b) => a.timestamp - b.timestamp));
      }
    }, 100);
    const lifecycle = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        socket?.connect();
        void recover();
      }
    });
    return () => {
      stopped = true;
      wake?.();
      socket?.disconnect();
      lifecycle.remove();
      clearInterval(poll);
      clearInterval(draw);
      cancelAnimation(latitude);
      cancelAnimation(longitude);
      cancelAnimation(heading);
      cancelAnimation(completion);
    };
  }, [session.tripId, latitude, longitude, heading, completion]);
  return (
    <View style={styles.container}>
      <FleetMap
        style={StyleSheet.absoluteFill}
        mapStyle={
          process.env.EXPO_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty'
        }
        touchRotate={false}
        touchPitch={false}
        onDidFinishLoadingStyle={() => {
          if (firstFix.current) camera.current?.jumpTo({ center: firstFix.current, zoom: 16 });
        }}
      >
        <Camera
          ref={camera}
          initialViewState={{ center: [origin.longitude, origin.latitude], zoom: 12 }}
        />
        {path.length > 1 && (
          <GeoJSONSource id="trip-route" data={route}>
            <Layer
              id="trip-route-line"
              type="line"
              paint={{ 'line-color': colors.brand, 'line-width': 4 }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
          </GeoJSONSource>
        )}
        {visible && (
          <AnimatedMarker
            id="driver-position"
            lngLat={[origin.longitude, origin.latitude]}
            animatedProps={animatedProps}
            anchor="center"
          >
            <Animated.View
              accessibilityLabel="Driver location"
              style={[styles.marker, markerStyle]}
            >
              <View style={styles.arrow} />
            </Animated.View>
          </AnimatedMarker>
        )}
      </FleetMap>
      <View style={styles.badge}>
        <Text style={styles.label}>TRIP {session.tripId.slice(0, 8).toUpperCase()}</Text>
        <Text style={styles.status}>{status}</Text>
        <Text style={styles.detail}>
          {path.length.toLocaleString()} locations in the displayed route
        </Text>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  badge: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    gap: 8,
    elevation: 4,
  },
  label: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700', color: colors.muted },
  status: { fontSize: 18, fontWeight: '700', color: colors.ink },
  detail: { fontSize: 12, color: colors.muted },
  marker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.brand,
    borderWidth: 3,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'white',
    marginTop: -2,
  },
});

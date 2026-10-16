"use client";

import { useEffect, useRef, useState } from "react";

type ApiResult = {
  ok: boolean;
  fetchedAt?: string;
  error?: string;
  source?: string;
  points?: Record<string, { name: string; lat: number; lon: number }>;
  data?: {
    timestamp: string;
    points: Record<string, Record<string, string | number | null>>;
    common: Record<string, string | number | null>;
    raw: string;
  };
};

type WindVector = {
  east: number;
  north: number;
  speedKt: number;
};

type WindParticle = {
  lon: number;
  lat: number;
  age: number;
  maxAge: number;
  trail: { lon: number; lat: number }[];
};

const POINTS = [
  {
    id: "RWY04",
    name: "RWY 04",
    lat: -0.381458,
    lon: 117.243016,
    color: "#48a9ff",
  },
  {
    id: "MIDDLE",
    name: "MIDDLE",
    lat: -0.37423,
    lon: 117.250081,
    color: "#4ce0b3",
  },
  {
    id: "RWY22",
    name: "RWY 22",
    lat: -0.366803,
    lon: 117.255974,
    color: "#ffb454",
  },
];

const fmt = (v: unknown, digits = 1) => {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : String(v);
};

const roundWind = (v: unknown) => {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;

  let val = Math.round(v / 10) * 10;

  if (val <= 0) val = 360;
  if (val > 360) val %= 360;
  if (val === 0) val = 360;

  return val;
};

const windText = (p?: Record<string, string | number | null>) =>
  p
    ? `${fmt(roundWind(p.windDirectionDeg), 0)}° / ${fmt(p.windSpeedKt, 0)} kt`
    : "—";

export default function AwosDashboard() {
  const mapRef = useRef<HTMLDivElement>(null);
  const windCanvasRef = useRef<HTMLCanvasElement>(null);

  const viewerRef = useRef<any>(null);
  const entitiesRef = useRef<Record<string, any>>({});
  const cloudsRef = useRef<any>(null);
  const resultRef = useRef<ApiResult | null>(null);

  const [selected, setSelected] = useState("RWY04");
  const [result, setResult] = useState<ApiResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState("--:--:--");

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  const selectedPoint = POINTS.find((p) => p.id === selected) ?? POINTS[0];

  const active = result?.data?.points?.[selected] ?? {};
  const common = result?.data?.common ?? {};

  const tempC =
    typeof active.airTempC === "number" ? active.airTempC / 10 : null;

  const dewC =
    typeof active.dewPointC === "number" ? active.dewPointC / 10 : null;

  let rainVal = common.rain04Mm;

  if (selected === "MIDDLE") rainVal = common.rainMiddleMm;
  if (selected === "RWY22") rainVal = common.rain22Mm;

  // =========================================================
  // FETCH DATA AWOS
  // =========================================================

  async function refresh() {
    setBusy(true);

    try {
      const res = await fetch("/api/awos", {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`AWOS API HTTP ${res.status}`);
      }

      const json = (await res.json()) as ApiResult;
      setResult(json);
    } catch (error) {
      console.error("Gagal mengambil data AWOS:", error);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();

    const id = window.setInterval(() => {
      void refresh();
    }, 60_000);

    return () => window.clearInterval(id);
  }, []);

  // =========================================================
  // JAM WITA
  // =========================================================

  useEffect(() => {
    const updateClock = () => {
      setClock(
        new Date().toLocaleTimeString("id-ID", {
          timeZone: "Asia/Makassar",
          hour12: false,
        }),
      );
    };

    updateClock();

    const timer = window.setInterval(updateClock, 1000);

    return () => window.clearInterval(timer);
  }, []);

  // =========================================================
  // CESIUM INITIALIZATION
  // =========================================================

  useEffect(() => {
    let cancelled = false;
    let createdViewer: any = null;

    async function init() {
      if (!mapRef.current || viewerRef.current) return;

      try {
        const Cesium = await import("cesium");

        if (cancelled || !mapRef.current) return;

        (window as any).CESIUM_BASE_URL = "/cesium";

        // Masukkan token Cesium ion lu di sini.
        Cesium.Ion.defaultAccessToken =
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IkR3S3c1cDJxdVZjQ0VuUnYiLCJqdGkiOiJhZDM3MWQ3MC02NTUzLTRiNGMtYjQzNi00OTM5MWE1YmZhMjYiLCJpZCI6NTIyNzE0LCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoidW5kZWZpbmVkX2RlZmF1bHQiLCJpYXQiOjE3OTE4OTA2NjN9.uQSrlsN9rX4NvZ75Ci8V5VKwxvbctCPRqwdoM60zF1M";

        //const terrainProvider = await Cesium.createWorldTerrainAsync({
        //requestWaterMask: true,
        //requestVertexNormals: true,
        //});

        if (cancelled || !mapRef.current) return;

        const viewer = new Cesium.Viewer(mapRef.current, {
          animation: false,
          timeline: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          baseLayerPicker: false,
          navigationHelpButton: false,
          fullscreenButton: false,
          infoBox: false,
          selectionIndicator: false,

          baseLayer: new Cesium.ImageryLayer(
            new Cesium.OpenStreetMapImageryProvider({
              url: "https://tile.openstreetmap.org/",
            }),
          ),

          //terrainProvider,
        });

        createdViewer = viewer;
        viewerRef.current = viewer;

        viewer.scene.globe.depthTestAgainstTerrain = false;
        //viewer.scene.verticalExaggeration = 1.2;

        // Koleksi awan 3D.
        cloudsRef.current = viewer.scene.primitives.add(
          new Cesium.CloudCollection(),
        );

        // Gedung 3D OpenStreetMap.
        Cesium.createOsmBuildingsAsync()
          .then((buildingsTileset) => {
            if (cancelled || viewer.isDestroyed()) {
              buildingsTileset.destroy();
              return;
            }

            viewer.scene.primitives.add(buildingsTileset);
          })
          .catch((error) => {
            console.error("Gagal memuat gedung 3D:", error);
          });

        // Sensor dan label.
        POINTS.forEach((p) => {
          const entity = viewer.entities.add({
            id: p.id,
            position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 15),

            point: {
              pixelSize: 16,
              color: Cesium.Color.fromCssColorString(p.color),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 3,
            },

            label: {
              text: `${p.name}\nMenunggu data...`,
              font: "bold 13px monospace",
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,

              // Atur posisi label berbeda untuk setiap sensor
              horizontalOrigin:
                p.id === "RWY04"
                  ? Cesium.HorizontalOrigin.RIGHT
                  : p.id === "RWY22"
                    ? Cesium.HorizontalOrigin.LEFT
                    : Cesium.HorizontalOrigin.CENTER,

              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,

              pixelOffset:
                p.id === "RWY04"
                  ? new Cesium.Cartesian2(-20, -15)
                  : p.id === "RWY22"
                    ? new Cesium.Cartesian2(20, -15)
                    : new Cesium.Cartesian2(0, -15),

              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });

          entitiesRef.current[p.id] = entity;
        });

        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            POINTS[0].lon - 0.008,
            POINTS[0].lat - 0.009,
            800,
          ),

          orientation: {
            heading: Cesium.Math.toRadians(40),
            pitch: Cesium.Math.toRadians(-20),
            roll: 0,
          },

          duration: 2,
        });
      } catch (error) {
        console.error("Cesium initialization error:", error);
      }
    }

    void init();

    return () => {
      cancelled = true;

      if (createdViewer && !createdViewer.isDestroyed()) {
        createdViewer.destroy();
      }

      if (viewerRef.current === createdViewer) {
        viewerRef.current = null;
      }

      entitiesRef.current = {};
      cloudsRef.current = null;
    };
  }, []);

  // =========================================================
  // UPDATE LABELS AND CLOUDS
  // =========================================================

  useEffect(() => {
    if (!result?.data?.points) return;

    POINTS.forEach((p) => {
      const entity = entitiesRef.current[p.id];
      const ptData = result.data?.points[p.id];

      if (entity && ptData) {
        const ptTemp =
          typeof ptData.airTempC === "number" ? ptData.airTempC / 10 : null;

        // Teks Awan
        let skyRaw: unknown = "";
        if (p.id === "RWY04") {
          skyRaw = common.sky04;
        } else if (p.id === "RWY22") {
          skyRaw = common.sky22;
        }
        const skyText =
          typeof skyRaw === "string" && skyRaw.trim() !== ""
            ? `☁ ${skyRaw.trim()}`
            : "";
        // ========================================================= // DATA CURAH HUJAN // =========================================================
        let rainRaw: unknown = 0;
        if (p.id === "RWY04") {
          rainRaw = common.rain04Mm;
        } else if (p.id === "MIDDLE") {
          rainRaw = common.rainMiddleMm;
        } else if (p.id === "RWY22") {
          rainRaw = common.rain22Mm;
        }
        const rainNumber = Number(rainRaw);
        const pointRain = Number.isFinite(rainNumber) ? rainNumber : 0;
        const rainText = `🌧 ${fmt(pointRain)} mm`;
        // ========================================================= // GABUNGKAN AWAN DAN HUJAN DALAM SATU BARIS // =========================================================
        const weatherText = [skyText].filter(Boolean).join(" | ");
        const labelLines = [
          p.name,
          `${fmt(ptTemp)}°C | QNH ${fmt(ptData.qnhHpa)} hPa`,
          weatherText,
        ]; // Terapkan label ke peta
        entity.label.text = labelLines.join("\n");
      }
    });

    let cancelled = false;

    async function updateClouds() {
      try {
        const Cesium = await import("cesium");

        if (cancelled) return;

        const clouds = cloudsRef.current;
        if (!clouds) return;

        clouds.removeAll();
        const commonData = result?.data?.common ?? {};

        function generate3DClouds(skyData: unknown, lon: number, lat: number) {
          if (typeof skyData !== "string") return;

          const matches = [
            ...skyData.matchAll(/\b(FEW|SCT|BKN|OVC)(\d{3})\b/g),
          ];

          if (matches.length === 0) return;

          // Tampilkan beberapa lapisan awan bila tersedia.
          matches.slice(0, 3).forEach((match) => {
            const type = match[1];
            const heightFeet = parseInt(match[2], 10) * 100;
            const heightMeters = heightFeet * 0.3048;

            let density = 4;

            if (type === "SCT") density = 8;
            if (type === "BKN") density = 15;
            if (type === "OVC") density = 25;

            for (let i = 0; i < density; i++) {
              clouds.add({
                position: Cesium.Cartesian3.fromDegrees(
                  lon + (Math.random() - 0.5) * 0.02,
                  lat + (Math.random() - 0.5) * 0.02,
                  heightMeters + (Math.random() - 0.5) * 200,
                ),

                scale: new Cesium.Cartesian2(
                  600 + Math.random() * 300,
                  300 + Math.random() * 150,
                ),

                maximumSize: new Cesium.Cartesian3(600, 600, 400),
                slice: Math.random(),
                brightness: type === "OVC" ? 0.6 : 0.9,
              });
            }
          });
        }

        generate3DClouds(commonData.sky04, POINTS[0].lon, POINTS[0].lat);

        generate3DClouds(commonData.sky22, POINTS[2].lon, POINTS[2].lat);
      } catch (error) {
        console.error("Gagal memperbarui awan:", error);
      }
    }

    void updateClouds();

    return () => {
      cancelled = true;
    };
  }, [result]);

  // =========================================================
  // WIND ARROW ENGINE
  // =========================================================

  useEffect(() => {
    let cancelled = false;
    let frameId = 0;
    let cleanup: (() => void) | undefined;

    async function startWindAnimation() {
      const Cesium = await import("cesium");
      if (cancelled) return;

      const canvas = windCanvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      // Area animasi di sekitar tiga sensor runway.
      const bounds = {
        west: Math.min(...POINTS.map((p) => p.lon)) - 0.004,
        east: Math.max(...POINTS.map((p) => p.lon)) + 0.004,
        south: Math.min(...POINTS.map((p) => p.lat)) - 0.003,
        north: Math.max(...POINTS.map((p) => p.lat)) + 0.003,
      };

      // Optimasi: jumlah panah dibatasi dan animasi maksimal 30 FPS.
      const PARTICLE_COUNT = 260;
      const FRAME_INTERVAL = 1000 / 30;

      const particles: WindParticle[] = [];

      const randomBetween = (a: number, b: number) =>
        a + Math.random() * (b - a);

      function respawn(particle: WindParticle) {
        particle.lon = randomBetween(bounds.west, bounds.east);
        particle.lat = randomBetween(bounds.south, bounds.north);
        particle.age = 0;
        particle.maxAge = randomBetween(3, 7);
        particle.trail = [];
      }

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const particle: WindParticle = {
          lon: 0,
          lat: 0,
          age: 0,
          maxAge: 0,
          trail: [],
        };

        respawn(particle);
        particles.push(particle);
      }

      function resizeCanvas() {
        if (!canvas) return;

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        if (!width || !height) return;

        const targetWidth = Math.round(width * dpr);
        const targetHeight = Math.round(height * dpr);

        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
          canvas.width = targetWidth;
          canvas.height = targetHeight;
        }

        if (!ctx) return;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      // Skala warna berdasarkan kecepatan angin dalam knot.
      function windColor(speedKt: number): [number, number, number] {
        if (speedKt < 3) return [70, 170, 255];
        if (speedKt < 7) return [0, 220, 255];
        if (speedKt < 12) return [0, 255, 170];
        if (speedKt < 17) return [235, 255, 0];
        if (speedKt < 22) return [255, 155, 0];
        return [255, 45, 65];
      }

      // Interpolasi vektor angin dari tiga sensor.
      // Arah meteorologis menunjukkan arah ASAL angin.
      function getWind(lon: number, lat: number): WindVector | null {
        const data = resultRef.current?.data?.points;
        if (!data) return null;

        let east = 0;
        let north = 0;
        let totalWeight = 0;

        for (const station of POINTS) {
          const observation = data[station.id];

          if (
            !observation ||
            typeof observation.windDirectionDeg !== "number" ||
            typeof observation.windSpeedKt !== "number" ||
            !Number.isFinite(observation.windDirectionDeg) ||
            !Number.isFinite(observation.windSpeedKt) ||
            observation.windSpeedKt < 0
          ) {
            continue;
          }

          const dx =
            (lon - station.lon) * 111320 * Math.cos((lat * Math.PI) / 180);

          const dy = (lat - station.lat) * 110540;
          const distanceSquared = dx * dx + dy * dy;

          const directionDeg =
            ((observation.windDirectionDeg % 360) + 360) % 360;

          // Angin tepat di lokasi sensor memakai observasi langsung.
          if (distanceSquared < 1) {
            const direction = ((directionDeg + 180) % 360) * (Math.PI / 180);

            const speed = observation.windSpeedKt * 0.514444;

            return {
              east: Math.sin(direction) * speed,
              north: Math.cos(direction) * speed,
              speedKt: observation.windSpeedKt,
            };
          }

          const weight = 1 / distanceSquared;
          const direction = ((directionDeg + 180) % 360) * (Math.PI / 180);

          const speed = observation.windSpeedKt * 0.514444;

          east += Math.sin(direction) * speed * weight;
          north += Math.cos(direction) * speed * weight;
          totalWeight += weight;
        }

        if (totalWeight === 0) return null;

        east /= totalWeight;
        north /= totalWeight;

        return {
          east,
          north,
          speedKt: Math.hypot(east, north) / 0.514444,
        };
      }

      // Proyeksi koordinat geografis ke layar.
      function project(lon: number, lat: number) {
        const viewer = viewerRef.current;

        if (!viewer || viewer.isDestroyed()) return null;

        const position = Cesium.Cartesian3.fromDegrees(lon, lat, 20);

        const screen = Cesium.SceneTransforms.worldToWindowCoordinates(
          viewer.scene,
          position,
        );

        if (
          !screen ||
          !Number.isFinite(screen.x) ||
          !Number.isFinite(screen.y)
        ) {
          return null;
        }

        return { x: screen.x, y: screen.y };
      }

      // Panah tanpa bulatan, trail, atau shadowBlur.
      function drawArrow(
        x: number,
        y: number,
        angle: number,
        color: [number, number, number],
      ) {
        const length = 11;
        const headLength = 4;
        const halfWidth = 2.8;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]}, 0.6)`;
        ctx.lineWidth = 1.8;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // Batang panah.
        ctx.beginPath();
        ctx.moveTo(-length / 2, 0);
        ctx.lineTo(length / 2 - headLength + 1, 0);
        ctx.stroke();

        // Kepala panah.
        ctx.beginPath();
        ctx.moveTo(length / 2 - headLength, -halfWidth);
        ctx.lineTo(length / 2, 0);
        ctx.lineTo(length / 2 - headLength, halfWidth);
        ctx.stroke();

        ctx.restore();
      }

      let previousTime = performance.now();
      let lastFrameTime = 0;

      function draw(now: number) {
        if (cancelled || !windCanvasRef.current) return;

        const viewer = viewerRef.current;

        if (!viewer || viewer.isDestroyed()) {
          frameId = requestAnimationFrame(draw);
          return;
        }

        // Batasi overlay ke sekitar 30 FPS.
        if (now - lastFrameTime < FRAME_INTERVAL) {
          frameId = requestAnimationFrame(draw);
          return;
        }

        lastFrameTime = now;

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        if (!width || !height) {
          frameId = requestAnimationFrame(draw);
          return;
        }

        if (
          canvas.width !== Math.round(width * dpr) ||
          canvas.height !== Math.round(height * dpr)
        ) {
          resizeCanvas();
        }

        const elapsed = Math.min((now - previousTime) / 1000, 0.05);

        previousTime = now;

        ctx.clearRect(0, 0, width, height);

        const cameraHeight =
          Cesium.Cartographic.fromCartesian(viewer.camera.positionWC)?.height ??
          1000;

        // Hindari menggambar saat tampilan terlalu jauh.
        if (cameraHeight > 10000) {
          frameId = requestAnimationFrame(draw);
          return;
        }

        for (const particle of particles) {
          const wind = getWind(particle.lon, particle.lat);

          if (!wind || !Number.isFinite(wind.speedKt)) {
            respawn(particle);
            continue;
          }

          particle.age += elapsed;

          if (
            particle.age > particle.maxAge ||
            particle.lon < bounds.west ||
            particle.lon > bounds.east ||
            particle.lat < bounds.south ||
            particle.lat > bounds.north
          ) {
            respawn(particle);
            continue;
          }

          /**
           * Kecepatan angin dari AWOS menggunakan knot.
           * Konversi ke m/s agar pergerakan partikel memiliki
           * hubungan langsung dengan kecepatan angin.
           */
          const speedMs = wind.speedKt * 0.514444;

          // Faktor visual untuk memperjelas pergerakan di peta.
          // Nilai ini dapat disesuaikan berdasarkan tampilan.
          const visualMultiplier = 3.5;

          // Pertahankan arah vektor angin, ubah magnitudonya
          // agar kecepatan gerak mengikuti wind.speedKt.
          const vectorMagnitude = Math.hypot(wind.east, wind.north);

          const eastUnit =
            vectorMagnitude > 0 ? wind.east / vectorMagnitude : 0;

          const northUnit =
            vectorMagnitude > 0 ? wind.north / vectorMagnitude : 0;

          const metersEast = eastUnit * speedMs * elapsed * visualMultiplier;

          const metersNorth = northUnit * speedMs * elapsed * visualMultiplier;

          particle.lon +=
            metersEast /
            (111320 * Math.max(0.1, Math.cos((particle.lat * Math.PI) / 180)));

          particle.lat += metersNorth / 110540;

          const head = project(particle.lon, particle.lat);
          if (!head) continue;

          // Vektor east/north merupakan arah gerak angin.
          // Sumbu Y layar positif mengarah ke bawah.
          const baseAngle = Math.atan2(-wind.north, wind.east);

          // Kurangi dengan rotasi kamera (heading) agar arah sinkron dengan peta 3D
          const angle = baseAngle - viewer.camera.heading;

          drawArrow(head.x, head.y, angle, windColor(wind.speedKt));
        }

        frameId = requestAnimationFrame(draw);
      }

      resizeCanvas();

      const observer = new ResizeObserver(resizeCanvas);
      observer.observe(canvas);

      frameId = requestAnimationFrame(draw);

      cleanup = () => {
        cancelAnimationFrame(frameId);
        observer.disconnect();
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      };
    }

    // Tunggu hingga Cesium Viewer tersedia.
    function waitForViewer() {
      if (cancelled) return;

      if (viewerRef.current && windCanvasRef.current) {
        void startWindAnimation().catch((error) => {
          if (!cancelled) {
            console.error("Wind animation error:", error);
          }
        });
        return;
      }

      frameId = requestAnimationFrame(waitForViewer);
    }

    frameId = requestAnimationFrame(waitForViewer);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      cleanup?.();
    };
  }, []);

  // =========================================================
  // CAMERA CONTROLS
  // =========================================================

  function flyToPoint(id: string) {
    setSelected(id);

    const p = POINTS.find((x) => x.id === id);

    if (p && viewerRef.current) {
      import("cesium").then((C) => {
        let headingDeg = 40;
        let latOffset = -0.009;
        let lonOffset = -0.008;

        if (id === "RWY22") {
          headingDeg = 220;
          latOffset = 0.009;
          lonOffset = 0.008;
        }

        viewerRef.current?.camera.flyTo({
          destination: C.Cartesian3.fromDegrees(
            p.lon + lonOffset,
            p.lat + latOffset,
            800,
          ),

          orientation: {
            heading: C.Math.toRadians(headingDeg),
            pitch: C.Math.toRadians(-20),
            roll: 0,
          },

          duration: 1.5,
        });
      });
    }
  }

  function adjustCamera(action: "left" | "right" | "up" | "down" | "north") {
    const viewer = viewerRef.current;

    if (!viewer || viewer.isDestroyed()) return;

    const cam = viewer.camera;

    import("cesium").then((C) => {
      const currentHeading = cam.heading;
      const currentPitch = cam.pitch;

      let newHeading = currentHeading;
      let newPitch = currentPitch;

      if (action === "left") {
        newHeading -= C.Math.toRadians(15);
      }

      if (action === "right") {
        newHeading += C.Math.toRadians(15);
      }

      if (action === "up") {
        newPitch = Math.min(
          C.Math.toRadians(-10),
          currentPitch + C.Math.toRadians(10),
        );
      }

      if (action === "down") {
        newPitch = Math.max(
          C.Math.toRadians(-85),
          currentPitch - C.Math.toRadians(10),
        );
      }

      if (action === "north") {
        newHeading = 0;
      }

      cam.flyTo({
        destination: cam.position,
        orientation: {
          heading: newHeading,
          pitch: newPitch,
          roll: 0,
        },
        duration: 0.5,
      });
    });
  }

  // =========================================================
  // UI
  // =========================================================

  return (
    <main className="hud-container">
      <div ref={mapRef} className="cesium-fullscreen" />

      {/* Canvas transparan untuk partikel dan jejak angin */}
      <canvas
        ref={windCanvasRef}
        className="wind-particle-canvas"
        aria-label="Visualisasi aliran angin AWOS"
      />

      {/* TOP LEFT */}
      <header className="hud-panel top-left">
        <h1>
          AWOS <span>3D</span>
        </h1>

        <p>AERODROME WEATHER INTELLIGENCE</p>

        <div className={`status-indicator ${result?.ok ? "live" : "offline"}`}>
          <div className="dot" />

          {result?.ok ? `LIVE · ${clock} WITA` : "DATA UNAVAILABLE"}
        </div>
      </header>

      {/* BOTTOM CENTER: SENSOR SELECTOR */}
      <div className="hud-panel bottom-center">
        <div className="point-selector">
          {POINTS.map((p) => {
            const common = result?.data?.common;

            const rainVal =
              p.id === "RWY04"
                ? common?.rain04Mm
                : p.id === "MIDDLE"
                  ? common?.rainMiddleMm
                  : common?.rain22Mm;

            return (
              <button
                key={p.id}
                className={selected === p.id ? "active" : ""}
                onClick={() => flyToPoint(p.id)}
                style={{ borderColor: p.color }}
              >
                <strong>{p.name}</strong>

                <span>{windText(result?.data?.points?.[p.id])}</span>

                <span>RAIN: {fmt(rainVal)} mm</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* CAMERA POV */}
      <div className="hud-panel compass-widget">
        <div className="compass-header">CAMERA POV</div>

        <div className="compass-grid">
          <button onClick={() => adjustCamera("left")} title="Putar Kiri">
            ↺
          </button>

          <button onClick={() => adjustCamera("up")} title="Naikkan Kamera">
            ▲
          </button>

          <button onClick={() => adjustCamera("right")} title="Putar Kanan">
            ↻
          </button>

          <button
            onClick={() => adjustCamera("north")}
            className="north-btn"
            title="Reset Utara"
          >
            N
          </button>

          <button onClick={() => adjustCamera("down")} title="Turunkan Kamera">
            ▼
          </button>

          <div className="filler" />
        </div>
      </div>

      {/* RIGHT DATA PANEL */}
      <aside className="hud-panel center-right">
        <div className="panel-header">
          <h2>{selectedPoint.name}</h2>

          <button
            onClick={() => void refresh()}
            className={busy ? "spin" : ""}
            disabled={busy}
            aria-label="Refresh data AWOS"
          >
            ↻
          </button>
        </div>

        <div className="data-grid">
          <div className="data-box">
            <span>WIND</span>
            <strong>
              {fmt(roundWind(active.windDirectionDeg), 0)}° /{" "}
              {fmt(active.windSpeedKt, 0)}
              <small>kt</small>
            </strong>
          </div>

          <div className="data-box">
            <span>GUST</span>
            <strong>
              {fmt(active.windGustKt, 0)}
              <small>kt</small>
            </strong>
          </div>

          <div className="data-box">
            <span>TEMP</span>
            <strong>
              {fmt(tempC)}
              <small>°C</small>
            </strong>
          </div>

          <div className="data-box">
            <span>DEW</span>
            <strong>
              {fmt(dewC)}
              <small>°C</small>
            </strong>
          </div>

          <div className="data-box">
            <span>QNH</span>
            <strong>
              {fmt(active.qnhHpa)}
              <small>hPa</small>
            </strong>
          </div>

          <div className="data-box">
            <span>RH</span>
            <strong>
              {fmt(active.rhPct, 0)}
              <small>%</small>
            </strong>
          </div>
        </div>

        <div className="common-data">
          <div>
            <span>VIS RWY 04</span>
            <strong>{fmt(common.visibility04M, 0)} m</strong>
          </div>

          <div>
            <span>VIS RWY 22</span>
            <strong>{fmt(common.visibility22M, 0)} m</strong>
          </div>
        </div>

        {/* Wind speed legend */}
        <div className="wind-legend">
          <div className="wind-legend-title">
            WIND SPEED <span>kt</span>
          </div>

          <div className="wind-gradient" />

          <div className="wind-legend-values">
            <span>0</span>
            <span>3</span>
            <span>7</span>
            <span>12</span>
            <span>17</span>
            <span>22+</span>
          </div>
        </div>

        {result?.error && <div className="api-error">{result.error}</div>}
      </aside>
    </main>
  );
}

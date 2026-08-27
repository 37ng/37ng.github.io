import { Suspense, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Lightformer,
  OrbitControls,
  useGLTF,
} from "@react-three/drei";
// Imported as a URL rather than served from public/ so the build fingerprints
// it and fails loudly if the file ever moves.
import modelUrl from "@/assets/bitcoin.glb?url";

/**
 * A downloaded bitcoin coin model (src/assets/bitcoin.glb — a Sketchfab export
 * with baked baseColor/metallicRoughness/normal maps already built in, so no
 * custom material work is needed) rendered with a small studio lighting rig
 * for a polished-metal look. Drag to orbit the camera via OrbitControls;
 * when left alone the coin itself idly tumbles around a slowly drifting
 * axis (see `tumbleAxis`/`Coin`), rather than spinning flatly in place.
 */

const MODEL_URL = modelUrl;
// The coin is centered and scaled at runtime (see useCoinModel) so its
// radius matches this value, regardless of the model's original units —
// this keeps the camera/lighting/contact-shadow numbers below meaningful
// without having to hand-measure the downloaded file.
const TARGET_RADIUS = 0.6;
// Tints the model's baked baseColor texture toward a warm yellow-gold (the
// raw download read as flat/"cheap" gold), and the metalness/roughness/env
// tweaks below push it toward a premium-but-matte metal response — glossy
// enough to read as metal without looking like polished chrome.
const TINT_COLOR = "#d9a520";

useGLTF.preload(MODEL_URL);

/** Clones a material and, if it's a (Mesh)StandardMaterial, tints and re-tunes it toward brushed yellow-gold. */
function tintMaterial<T extends THREE.Material>(material: T): T {
  const tinted = material.clone() as T;
  if (tinted instanceof THREE.MeshStandardMaterial) {
    tinted.color.set(TINT_COLOR);
    tinted.metalness = 1;
    tinted.roughness = Math.max(tinted.roughness, 0.2);
    tinted.envMapIntensity = 0.7;
  }
  return tinted;
}

/**
 * Loads the GLB (via drei's `useGLTF`, which suspends until it's fetched —
 * see the <Suspense> wrapper in BitcoinCoin3D below), clones it so we don't
 * mutate the shared cache, then centers and uniformly scales that clone to
 * TARGET_RADIUS based on its actual bounding box. The model comes out of
 * Sketchfab's Z-up→Y-up export lying flat with its radius spanning X/Z and
 * its thickness along Y, so `Math.max(size.x, size.z)` is its diameter.
 * Materials are cloned + tinted per `tintMaterial` along the way.
 */
function useCoinModel() {
  const { scene } = useGLTF(MODEL_URL);

  return useMemo(() => {
    const model = scene.clone(true);

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.z) / 2;
    const scale = TARGET_RADIUS / radius;

    model.position.sub(center);

    const wrapper = new THREE.Group();
    wrapper.scale.setScalar(scale);
    // Starting tilt so it doesn't look flat-on before the first drag/tumble.
    // Set once here rather than as a JSX `rotation` prop, since the idle
    // tumble below mutates this same object's rotation every frame — a
    // declarative prop would otherwise fight it back to this value on every
    // React re-render.
    wrapper.rotation.set(0, 0.5, 0);
    wrapper.add(model);

    wrapper.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map(tintMaterial)
          : tintMaterial(mesh.material);
      }
    });

    return wrapper;
  }, [scene]);
}

// Radians/sec the coin tumbles at while idle, and how it picks *which* axis
// to spin around: three out-of-phase, slightly-detuned sine waves trace out
// a slowly drifting unit vector (a Lissajous-style wander) rather than
// looping through the same few axes — so the tumble never settles into a
// flat, single-axis "lazy Susan" spin.
const TUMBLE_SPEED = 0.5;
function tumbleAxis(t: number) {
  return new THREE.Vector3(
    Math.sin(t * 0.17),
    Math.sin(t * 0.11 + 2.1),
    Math.cos(t * 0.13),
  ).normalize();
}

/**
 * Renders the coin and, whenever `interactingRef` isn't set (i.e. the user
 * isn't currently dragging OrbitControls), tumbles it a little further each
 * frame around `tumbleAxis`'s current direction. Mutates the loaded
 * object's rotation directly via `rotateOnWorldAxis` instead of going
 * through React state, since this needs to update every frame without
 * triggering a re-render.
 */
function Coin({ interactingRef }: { interactingRef: RefObject<boolean> }) {
  const coin = useCoinModel();

  useFrame((state, delta) => {
    if (interactingRef.current) return;
    coin.rotateOnWorldAxis(
      tumbleAxis(state.clock.elapsedTime),
      delta * TUMBLE_SPEED,
    );
  });

  return <primitive object={coin} />;
}

/**
 * Three-part studio rig: one directional "key" light for a crisp specular
 * highlight and cast shadow, plus a procedural Environment built from three
 * Lightformers (flat glowing rectangles, not an external HDRI file) so the
 * metal has something soft to reflect. Colors lean warm (front/left) and
 * cool (right) for a bit of contrast across the gold. Adjust each
 * Lightformer's `position`/`intensity`/`color` to reshape the reflections.
 */
function StudioLighting() {
  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight
        position={[3, 4, 5]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <Environment resolution={256}>
        <Lightformer
          intensity={3.5}
          color="#fff7e6"
          position={[0, 4, -3]}
          scale={[8, 3, 1]}
        />
        <Lightformer
          intensity={2.2}
          color="#ffe3ad"
          position={[-4, 1, 2]}
          scale={[4, 4, 1]}
          rotation={[0, Math.PI / 2, 0]}
        />
        <Lightformer
          intensity={1.1}
          color="#bcd4ff"
          position={[4, -1, 2]}
          scale={[4, 4, 1]}
          rotation={[0, -Math.PI / 2, 0]}
        />
      </Environment>
    </>
  );
}

interface BitcoinCoin3DProps {
  /**
   * Wraps the canvas in the bordered card + caption footer used for the
   * other in-post diagrams. Set to `false` to render just the coin over a
   * transparent background — no border, no card fill, no caption — so it
   * can sit directly on top of a photo (see its use in HeroStage.astro).
   */
  frame?: boolean;
}

/**
 * Top-level export: sets up the Canvas (an elevated, downward-looking
 * camera — the coin lies flat, Y-up, so this frames it the way you'd look
 * down at a coin resting on a table — plus shadows and ACES tone mapping
 * for a filmic, non-blown-out gold highlight), drops in the coin (behind a
 * Suspense boundary since loading the GLB is async) + lighting + a soft
 * ground contact shadow, and wires OrbitControls up for drag-to-rotate
 * (pan/zoom disabled, damping on so a flick keeps spinning briefly). Coin's
 * own idle tumble (see `Coin`) pauses for the duration of a drag via
 * `interactingRef`, which OrbitControls' `onStart`/`onEnd` toggle.
 */
export function BitcoinCoin3D({ frame = true }: BitcoinCoin3DProps) {
  const interactingRef = useRef(false);

  const canvas = (
    <div className="cursor-grab active:cursor-grabbing" style={{ height: 380 }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 3.2, 2], fov: 30 }}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.35;
        }}
      >
        <Suspense fallback={null}>
          <Coin interactingRef={interactingRef} />
        </Suspense>
        <StudioLighting />
        <ContactShadows
          position={[0, -0.2, 0]}
          opacity={0.55}
          scale={4.5}
          blur={2.4}
          far={2}
        />
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.7}
          onStart={() => {
            interactingRef.current = true;
          }}
          onEnd={() => {
            interactingRef.current = false;
          }}
        />
      </Canvas>
    </div>
  );

  if (!frame) return canvas;

  return (
    <div className="rounded-md border border-ink-700 bg-ink-900">
      {canvas}
      <div className="border-t border-ink-700 px-4 py-3 font-mono text-xs text-ink-400">
        drag to rotate · flick to spin it
      </div>
    </div>
  );
}

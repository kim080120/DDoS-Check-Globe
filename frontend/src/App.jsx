import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';


const EARTH_DAY =
  'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
const EARTH_NIGHT =
  'https://unpkg.com/three-globe/example/img/earth-night.jpg';
const EARTH_BORDER =
  'https://unpkg.com/three-globe/example/img/earth-dark.jpg';
const STARFIELD =
  'https://unpkg.com/three-globe/example/img/night-sky.png';

const AUTO_ROT_SPEED = 0.03;

export default function App() {
  const mountRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 4);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    
    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambient);

    
    const sunDir = new THREE.Vector3(1.0, 0.4, 0.8).normalize();

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const radius = 1;
    const geo = new THREE.SphereGeometry(radius, 128, 128);

    const uniforms = {
      dayTexture: { value: null },
      nightTexture: { value: null },
      borderTexture: { value: null },
      sunDirection: { value: sunDir }
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalWorld;

        void main() {
          vUv = uv;
          vNormalWorld = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D dayTexture;
        uniform sampler2D nightTexture;
        uniform sampler2D borderTexture;
        uniform vec3 sunDirection;

        varying vec2 vUv;
        varying vec3 vNormalWorld;

        vec3 saturateColor(vec3 c, float sat) {
          float l = dot(c, vec3(0.299, 0.587, 0.114));
          return mix(vec3(l), c, sat);
        }

        void main() {
          vec3 n = normalize(vNormalWorld);
          vec3 l = normalize(sunDirection);

          float ndotl = dot(n, l);

          // dayFactor: 1 = 낮, 0 = 밤
          float dayFactor   = smoothstep(-0.05, 0.45, ndotl);
          float nightFactor = 1.0 - dayFactor;

          vec3 dayColor   = texture2D(dayTexture,   vUv).rgb;
          vec3 nightColor = texture2D(nightTexture, vUv).rgb;
          vec3 borderTex  = texture2D(borderTexture, vUv).rgb;

          dayColor   = saturateColor(dayColor,   1.25);
          nightColor = saturateColor(nightColor, 1.4);

          // ---- 기본 지구 색 (전체적으로 어두운 톤) ----
          float lambert = max(ndotl, 0.0);
          float dayLight = 0.28 + 1.0 * lambert;  // 예전 느낌처럼 조금 더 어둡게
          vec3 baseDay   = dayColor * dayLight * dayFactor;

          // 밤 바탕은 살짝만 보이도록
          vec3 baseNight = dayColor * 0.05 * nightFactor;

          // ---- 도시 불빛 (야경) ----
          // night 텍스처를 따뜻한 노란색 발광으로 사용
          vec3 warmNight = nightColor * vec3(2.0, 1.7, 1.25);
          // ★ 여기 계수 5.0 → 이전보다 살짝 강하게
          vec3 cityEmission = warmNight * nightFactor * 5.0;

          vec3 color = baseDay + baseNight + cityEmission;

          // 국경/해안선 살짝 강조
          float borderGray = dot(borderTex, vec3(0.299, 0.587, 0.114));
          float borderMask = smoothstep(0.6, 0.9, borderGray);
          vec3 borderTint = vec3(0.9, 0.95, 1.0);
          color = mix(color, borderTint, borderMask * 0.35);

          // 전체 톤 : 배경은 어두운데 불빛은 또렷하게
          color = clamp(color, 0.0, 1.0);
          color = pow(color, vec3(0.9)); // 0.8 → 0.9 로 살짝 어둡게

          gl_FragColor = vec4(color, 1.0);
        }
      `
    });

    const earth = new THREE.Mesh(geo, material);
    globeGroup.add(earth);

    const loader = new THREE.TextureLoader();
    loader.load(
      EARTH_DAY,
      tex => {
        tex.colorSpace = THREE.SRGBColorSpace;
        uniforms.dayTexture.value = tex;
      },
      undefined,
      err => console.error('day texture load error', err)
    );
    loader.load(
      EARTH_NIGHT,
      tex => {
        tex.colorSpace = THREE.SRGBColorSpace;
        uniforms.nightTexture.value = tex;
      },
      undefined,
      err => console.error('night texture load error', err)
    );
    loader.load(
      EARTH_BORDER,
      tex => {
        tex.colorSpace = THREE.SRGBColorSpace;
        uniforms.borderTexture.value = tex;
      },
      undefined,
      err => console.error('border texture load error', err)
    );

    
    const starGeo = new THREE.SphereGeometry(30, 32, 32);
    const starMat = new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      transparent: true
    });
    loader.load(
      STARFIELD,
      tex => {
        tex.colorSpace = THREE.SRGBColorSpace;
        starMat.map = tex;
        starMat.needsUpdate = true;
      },
      undefined,
      err => console.error('starfield texture load error', err)
    );
    const starMesh = new THREE.Mesh(starGeo, starMat);
    scene.add(starMesh);

    
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.enablePan = false;
    controls.minDistance = 2.2;
    controls.maxDistance = 6;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.6;

    let isUserInteracting = false;
    controls.addEventListener('start', () => {
      isUserInteracting = true;
    });
    controls.addEventListener('end', () => {
      isUserInteracting = false;
    });

    let animationFrameId;
    let lastTime = performance.now();

    const animate = (time) => {
      const dt = (time - lastTime) / 1000.0;
      lastTime = time;

      if (!isUserInteracting) {
        globeGroup.rotation.y += AUTO_ROT_SPEED * dt;
      }

      controls.update();
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };
    animationFrameId = requestAnimationFrame(animate);

    const handleResize = () => {
      const { clientWidth, clientHeight } = container;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      geo.dispose();
      starGeo.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="app-root">
      <div ref={mountRef} className="globe-container" />
    </div>
  );
}

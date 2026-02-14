import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/* Floating particles with depth layers and gentle drift */
function Particles({ count = 800, isDark }) {
  const mesh = useRef();
  const { positions, sizes, colors } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    const col = new Float32Array(count * 3);
    const palette = isDark
      ? [new THREE.Color('#B388FF'), new THREE.Color('#D500F9'), new THREE.Color('#82B1FF'), new THREE.Color('#18FFFF')]
      : [new THREE.Color('#7C4DFF'), new THREE.Color('#9C27B0'), new THREE.Color('#5C6BC0'), new THREE.Color('#AB47BC')];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 28;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 28;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 28;
      sz[i] = Math.random() * 0.06 + 0.015;
      const c = palette[Math.floor(Math.random() * palette.length)];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    return { positions: pos, sizes: sz, colors: col };
  }, [count, isDark]);

  useFrame((state) => {
    if (!mesh.current) return;
    mesh.current.rotation.y = state.clock.elapsedTime * 0.015;
    mesh.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.01) * 0.05;
    /* gentle breathing */
    const s = 1 + Math.sin(state.clock.elapsedTime * 0.3) * 0.02;
    mesh.current.scale.set(s, s, s);
  });

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={count} array={colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.045} vertexColors transparent opacity={isDark ? 0.85 : 0.55} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/* Central constellation of connected agent nodes */
function AgentConstellation({ isDark }) {
  const groupRef = useRef();
  const lineRef = useRef();
  
  const agents = useMemo(() => [
    { pos: [0, 1.8, 0], color: isDark ? '#B388FF' : '#7C4DFF', size: 0.18 },      // Director
    { pos: [-1.6, 0.3, 0.5], color: isDark ? '#FF80AB' : '#E91E63', size: 0.14 },  // Character 1
    { pos: [1.6, 0.3, -0.5], color: isDark ? '#82B1FF' : '#1976D2', size: 0.14 },   // Character 2
    { pos: [-0.8, -1.5, 0.3], color: isDark ? '#18FFFF' : '#00ACC1', size: 0.14 },  // Character 3
    { pos: [0.8, -1.5, -0.3], color: isDark ? '#69F0AE' : '#2E7D32', size: 0.14 },  // Character 4
  ], [isDark]);

  const linePositions = useMemo(() => {
    /* Connect director (0) to all characters, and characters in a ring */
    const connections = [[0,1],[0,2],[0,3],[0,4],[1,2],[2,4],[4,3],[3,1]];
    const pts = [];
    for (const [a, b] of connections) {
      pts.push(...agents[a].pos, ...agents[b].pos);
    }
    return new Float32Array(pts);
  }, [agents]);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.rotation.y = t * 0.08;
    groupRef.current.position.y = Math.sin(t * 0.4) * 0.15;
    
    groupRef.current.children.forEach((child, i) => {
      if (child.isMesh) {
        const phase = i * 1.2;
        child.scale.setScalar(1 + Math.sin(t * 1.5 + phase) * 0.12);
      }
    });
  });

  return (
    <group ref={groupRef}>
      {/* Connection lines */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={linePositions.length / 3} array={linePositions} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color={isDark ? '#7C4DFF' : '#9C27B0'} transparent opacity={isDark ? 0.2 : 0.12} />
      </lineSegments>

      {/* Agent nodes */}
      {agents.map((agent, i) => (
        <group key={i} position={agent.pos}>
          {/* Outer glow sphere */}
          <mesh>
            <sphereGeometry args={[agent.size * 2.5, 16, 16]} />
            <meshBasicMaterial color={agent.color} transparent opacity={isDark ? 0.06 : 0.04} />
          </mesh>
          {/* Core sphere */}
          <mesh>
            <sphereGeometry args={[agent.size, 32, 32]} />
            <meshStandardMaterial
              color={agent.color}
              emissive={agent.color}
              emissiveIntensity={isDark ? 0.8 : 0.3}
              transparent
              opacity={isDark ? 0.9 : 0.7}
              roughness={0.2}
              metalness={0.8}
            />
          </mesh>
        </group>
      ))}

      {/* Central wireframe polyhedron */}
      <mesh>
        <icosahedronGeometry args={[0.7, 1]} />
        <meshStandardMaterial
          color={isDark ? '#B388FF' : '#7C4DFF'}
          wireframe
          transparent
          opacity={isDark ? 0.15 : 0.08}
          emissive={isDark ? '#D500F9' : '#9C27B0'}
          emissiveIntensity={0.2}
        />
      </mesh>
    </group>
  );
}

/* Orbital rings */
function OrbitalRing({ radius, speed, tilt, color, thickness = 0.012, isDark }) {
  const mesh = useRef();
  useFrame((state) => {
    if (!mesh.current) return;
    const t = state.clock.elapsedTime;
    mesh.current.rotation.z = t * speed;
    mesh.current.rotation.x = tilt;
    mesh.current.rotation.y = Math.sin(t * 0.2) * 0.1;
  });
  return (
    <mesh ref={mesh}>
      <torusGeometry args={[radius, thickness, 32, 120]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={isDark ? 0.6 : 0.2}
        transparent
        opacity={isDark ? 0.35 : 0.2}
      />
    </mesh>
  );
}

/* Ambient floating data fragments */
function DataFragments({ isDark }) {
  const groupRef = useRef();
  const fragments = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => ({
      pos: [
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 10,
      ],
      speed: Math.random() * 0.3 + 0.1,
      phase: Math.random() * Math.PI * 2,
      size: Math.random() * 0.06 + 0.02,
    }));
  }, []);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.children.forEach((child, i) => {
      const f = fragments[i];
      child.position.y = f.pos[1] + Math.sin(t * f.speed + f.phase) * 0.8;
      child.rotation.z = t * f.speed;
    });
  });

  return (
    <group ref={groupRef}>
      {fragments.map((f, i) => (
        <mesh key={i} position={f.pos}>
          <boxGeometry args={[f.size, f.size * 3, f.size * 0.5]} />
          <meshBasicMaterial color={isDark ? '#7C4DFF' : '#9C27B0'} transparent opacity={isDark ? 0.15 : 0.06} />
        </mesh>
      ))}
    </group>
  );
}

export default function HeroScene({ isDark = true }) {
  return (
    <div className="absolute inset-0 z-0">
      <Canvas camera={{ position: [0, 0, 8], fov: 55 }} dpr={[1, 2]}>
        <ambientLight intensity={isDark ? 0.2 : 0.6} />
        <pointLight position={[6, 6, 6]} intensity={isDark ? 0.6 : 0.3} color="#7C4DFF" />
        <pointLight position={[-6, -4, 4]} intensity={isDark ? 0.4 : 0.2} color="#D500F9" />
        <pointLight position={[0, -6, 6]} intensity={isDark ? 0.2 : 0.1} color="#82B1FF" />
        
        <AgentConstellation isDark={isDark} />
        
        <OrbitalRing radius={3.2} speed={0.15} tilt={Math.PI / 3} color={isDark ? '#D500F9' : '#9C27B0'} isDark={isDark} />
        <OrbitalRing radius={4.0} speed={-0.08} tilt={Math.PI / 2.2} color={isDark ? '#82B1FF' : '#5C6BC0'} isDark={isDark} />
        <OrbitalRing radius={4.8} speed={0.05} tilt={Math.PI / 4} color={isDark ? '#18FFFF' : '#00ACC1'} thickness={0.008} isDark={isDark} />
        
        <Particles isDark={isDark} />
        <DataFragments isDark={isDark} />
      </Canvas>
    </div>
  );
}

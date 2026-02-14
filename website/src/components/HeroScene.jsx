import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function Particles({ count = 500 }) {
  const mesh = useRef();
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    return pos;
  }, [count]);

  useFrame((state) => {
    if (mesh.current) {
      mesh.current.rotation.y = state.clock.elapsedTime * 0.05;
      mesh.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.03) * 0.1;
    }
  });

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.05} color="#B388FF" transparent opacity={0.8} sizeAttenuation />
    </points>
  );
}

function FloatingPolyhedron() {
  const mesh = useRef();
  useFrame((state) => {
    if (mesh.current) {
      mesh.current.rotation.x = state.clock.elapsedTime * 0.3;
      mesh.current.rotation.y = state.clock.elapsedTime * 0.2;
      mesh.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.3;
    }
  });

  return (
    <mesh ref={mesh}>
      <icosahedronGeometry args={[1.5, 1]} />
      <meshStandardMaterial
        color="#7C4DFF"
        wireframe
        transparent
        opacity={0.6}
        emissive="#D500F9"
        emissiveIntensity={0.3}
      />
    </mesh>
  );
}

function InnerRing() {
  const mesh = useRef();
  useFrame((state) => {
    if (mesh.current) {
      mesh.current.rotation.z = state.clock.elapsedTime * 0.4;
      mesh.current.rotation.x = Math.PI / 2;
    }
  });
  return (
    <mesh ref={mesh}>
      <torusGeometry args={[2.2, 0.02, 16, 100]} />
      <meshStandardMaterial color="#D500F9" emissive="#D500F9" emissiveIntensity={0.5} transparent opacity={0.7} />
    </mesh>
  );
}

function OuterRing() {
  const mesh = useRef();
  useFrame((state) => {
    if (mesh.current) {
      mesh.current.rotation.z = -state.clock.elapsedTime * 0.2;
      mesh.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.5;
    }
  });
  return (
    <mesh ref={mesh}>
      <torusGeometry args={[3, 0.015, 16, 100]} />
      <meshStandardMaterial color="#82B1FF" emissive="#82B1FF" emissiveIntensity={0.3} transparent opacity={0.5} />
    </mesh>
  );
}

export default function HeroScene() {
  return (
    <div className="absolute inset-0 z-0">
      <Canvas camera={{ position: [0, 0, 7], fov: 60 }}>
        <ambientLight intensity={0.3} />
        <pointLight position={[5, 5, 5]} intensity={0.8} color="#7C4DFF" />
        <pointLight position={[-5, -5, 5]} intensity={0.4} color="#D500F9" />
        <FloatingPolyhedron />
        <InnerRing />
        <OuterRing />
        <Particles />
      </Canvas>
    </div>
  );
}

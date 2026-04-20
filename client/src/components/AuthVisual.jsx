import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Sphere, TorusKnot, MeshDistortMaterial } from '@react-three/drei'
import '../styles/auth.css'

const AnimatedSphere = () => {
  const sphereRef = useRef()

  useFrame(({ clock }) => {
    if (sphereRef.current) {
      sphereRef.current.rotation.y = clock.getElapsedTime() * 0.2
      sphereRef.current.rotation.z = clock.getElapsedTime() * 0.1
    }
  })

  return (
    <Sphere ref={sphereRef} args={[1.5, 64, 64]} position={[0, 0, 0]}>
      <MeshDistortMaterial
        color="#7c3aed"
        attach="material"
        distort={0.4}
        speed={1.5}
        roughness={0.2}
        metalness={0.8}
        transparent={true}
        opacity={0.8}
        wireframe={true}
      />
    </Sphere>
  )
}

const AnimatedTorus = () => {
  const torusRef = useRef()

  useFrame(({ clock }) => {
    if (torusRef.current) {
      torusRef.current.rotation.x = clock.getElapsedTime() * 0.2
      torusRef.current.rotation.y = clock.getElapsedTime() * 0.3
    }
  })

  return (
    <TorusKnot ref={torusRef} args={[1, 0.4, 128, 64]} position={[0, 0, 0]}>
      <meshStandardMaterial
        color="#06b6d4"
        roughness={0.1}
        metalness={0.9}
        wireframe={true}
        transparent={true}
        opacity={0.7}
      />
    </TorusKnot>
  )
}

function AuthVisual({ type = 'signup' }) {
  const isLogin = type === 'login'
  
  return (
    <div className="auth-visual-container">
      <div className="auth-visual-background">
        <img src="/vr_floor_plan.png" alt="VR Floor Plan" className="vr-image" />
        <div 
          className="auth-visual-overlay"
          style={{
            background: isLogin 
              ? 'linear-gradient(135deg, rgba(5, 8, 22, 0.7) 0%, rgba(6, 182, 212, 0.25) 100%)' 
              : 'linear-gradient(135deg, rgba(5, 8, 22, 0.8) 0%, rgba(124, 58, 237, 0.3) 100%)'
          }}
        ></div>
      </div>
      
      <div className="canvas-container">
        <Canvas camera={{ position: [0, 0, 5] }}>
          <ambientLight intensity={isLogin ? 0.8 : 0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1.5} color={isLogin ? "#7c3aed" : "#06b6d4"} />
          <directionalLight position={[-10, -10, -5]} intensity={1.5} color={isLogin ? "#06b6d4" : "#7c3aed"} />
          
          {isLogin ? <AnimatedTorus /> : <AnimatedSphere />}
          
          <OrbitControls 
            enableZoom={false} 
            enablePan={false} 
            autoRotate 
            autoRotateSpeed={isLogin ? 0.8 : 0.5} 
          />
        </Canvas>
      </div>
      
      <div className="auth-visual-text">
        <h2>{isLogin ? "Welcome Back to the Future" : "Experience the Future"}</h2>
        <p>{isLogin ? "Continue where you left off with advanced AI insights." : "Advanced 3D visualization and AI-driven insights for your startup."}</p>
      </div>
    </div>
  )
}

export default AuthVisual

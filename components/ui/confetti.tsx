'use client';

import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number; // velocity X
  vy: number; // velocity Y
  rotation: number;
  rotationSpeed: number;
  color: string;
  shape: 'circle' | 'square' | 'rectangle';
  size: number;
  opacity: number;
}

interface ConfettiProps {
  trigger: boolean;
  duration?: number;
  particleCount?: number;
}

// Physics constants
const GRAVITY = 0.5;
const WIND = 0.1;
const FRICTION = 0.99;

// Confetti colors from design system
const COLORS = [
  'oklch(0.70 0.22 285)', // Primary
  'oklch(0.75 0.20 290)', // Primary light
  'oklch(0.65 0.24 280)', // Primary dark
  'oklch(0.80 0.15 300)', // Accent
  'oklch(0.85 0.10 310)', // Accent light
  'oklch(0.65 0.25 241)', // Chart-1
];

export function Confetti({
  trigger,
  duration = 3000,
  particleCount = 150,
}: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const particlesRef = useRef<Particle[]>([]);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    if (!trigger || prefersReducedMotion) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match container
    const resizeCanvas = () => {
      if (canvas.parentElement) {
        canvas.width = canvas.parentElement.offsetWidth;
        canvas.height = canvas.parentElement.offsetHeight;
      }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initialize particles
    const centerX = canvas.width / 2;
    const centerY = canvas.height * 0.8; // Launch from bottom center
    particlesRef.current = Array.from({ length: particleCount }, () =>
      createParticle(centerX, centerY)
    );
    startTimeRef.current = Date.now();

    // Animation loop
    const animate = () => {
      if (!canvas || !ctx) return;

      const elapsed = Date.now() - startTimeRef.current;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Update and draw particles
      particlesRef.current = particlesRef.current.filter((particle) => {
        // Update physics
        particle.vy += GRAVITY;
        particle.vx *= FRICTION;
        particle.vy *= FRICTION;
        particle.vx += WIND;

        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.rotation += particle.rotationSpeed;

        // Fade out after 2 seconds
        if (elapsed > 2000) {
          particle.opacity = Math.max(0, 1 - (elapsed - 2000) / 1000);
        }

        // Remove particles that are off-screen or fully transparent
        if (
          particle.opacity <= 0 ||
          particle.y > canvas.height + 50 ||
          particle.x < -50 ||
          particle.x > canvas.width + 50
        ) {
          return false;
        }

        // Draw particle
        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.rotation);
        ctx.globalAlpha = particle.opacity;
        ctx.fillStyle = particle.color;

        switch (particle.shape) {
          case 'circle':
            ctx.beginPath();
            ctx.arc(0, 0, particle.size / 2, 0, Math.PI * 2);
            ctx.fill();
            break;
          case 'square':
            ctx.fillRect(
              -particle.size / 2,
              -particle.size / 2,
              particle.size,
              particle.size
            );
            break;
          case 'rectangle':
            ctx.fillRect(
              -particle.size / 2,
              -particle.size / 4,
              particle.size,
              particle.size / 2
            );
            break;
        }

        ctx.restore();
        return true;
      });

      // Continue animation if particles remain and duration not exceeded
      if (particlesRef.current.length > 0 && elapsed < duration) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        // Clean up when done
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [trigger, duration, particleCount]);

  // Don't render canvas if reduced motion is preferred
  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-50"
      style={{ width: '100%', height: '100%' }}
    />
  );
}

function createParticle(centerX: number, centerY: number): Particle {
  // Spread angle: -90° to +90° (upward cone)
  const angle = Math.random() * Math.PI - Math.PI / 2;
  const speed = 10 + Math.random() * 10;

  // Shape distribution: 40% circles, 30% squares, 30% rectangles
  const shapeRandom = Math.random();
  let shape: 'circle' | 'square' | 'rectangle';
  if (shapeRandom < 0.4) {
    shape = 'circle';
  } else if (shapeRandom < 0.7) {
    shape = 'square';
  } else {
    shape = 'rectangle';
  }

  return {
    x: centerX,
    y: centerY,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - 15, // Initial upward boost
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.2,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    shape,
    size: 8 + Math.random() * 8, // 8-16 pixels
    opacity: 1,
  };
}

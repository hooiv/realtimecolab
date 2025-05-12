import React, { useEffect, useRef } from 'react';
import { animate, createTimeline, utils } from 'animejs';
import type { AnimeParams } from 'animejs';
import './MorphingAnimation.css';

interface MorphingAnimationProps {
  id: string;
  className?: string;
  color?: string;
  strokeWidth?: number;
  duration?: number;
  autoPlay?: boolean;
}

const MorphingAnimation: React.FC<MorphingAnimationProps> = ({
  id,
  className = '',
  color = '#4299e1',
  strokeWidth = 2,
  duration = 3000,
  autoPlay = true
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const animationRef = useRef<any>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    // Define different path shapes for morphing
    const shapes = {
      circle: 'M 50,50 m -40,0 a 40,40 0 1 1 80,0 a 40,40 0 1 1 -80,0',
      square: 'M 10,10 L 90,10 L 90,90 L 10,90 L 10,10',
      triangle: 'M 50,10 L 90,90 L 10,90 Z',
      star: 'M 50,10 L 61,40 L 93,42 L 67,63 L 76,94 L 50,79 L 24,94 L 33,63 L 7,42 L 39,40 Z',
      infinity: 'M 50,50 m -30,0 a 20,20 0 1 0 40,0 a 17,17 0 1 0 -40,0 M 50,50 m -10,0 a 20,20 0 1 1 40,0 a 17,17 0 1 1 -40,0'
    };

    const path = svgRef.current.querySelector('path');
    if (!path) return;

    const keys = Object.keys(shapes);
    const morphSequence: AnimeParams[] = [];

    // Create morphing sequence
    keys.forEach((key, index) => {
      const nextKey = keys[(index + 1) % keys.length];
      morphSequence.push({
        targets: path,
        d: [shapes[key as keyof typeof shapes], shapes[nextKey as keyof typeof shapes]],
        duration: duration,
        easing: 'easeInOutQuad',
        delay: 200,
        endDelay: 300
      });
    });

    // Create animation timeline
    const timeline = createTimeline({
      loop: true,
      autoplay: autoPlay
    });

    // Add morphing animations to timeline
    morphSequence.forEach(params => {
      // In anime.js v4, we need to create individual animations for each path
      if (params.targets) {
        // Extract the path element from params.targets
        const path = params.targets as SVGPathElement;

        // Create animation parameters without the targets
        const { targets, ...animParams } = params;

        // Add the animation to the timeline
        timeline.add(path, animParams);
      }
    });

    animationRef.current = timeline;

    // Add additional subtle animations
    animate(path, {
      strokeWidth: [strokeWidth, strokeWidth + 1, strokeWidth],
      opacity: [0.7, 1, 0.7],
      duration: 3000,
      easing: 'easeInOutSine',
      direction: 'alternate',
      loop: true
    });

    // Cleanup function
    return () => {
      if (animationRef.current) {
        animationRef.current.pause();
      }
      if (path) {
        utils.remove(path);
      }
    };
  }, [color, strokeWidth, duration, autoPlay]);

  return (
    <div className={`morphing-animation-container ${className}`}>
      <svg
        ref={svgRef}
        id={id}
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
      >
        <path
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          d="M 50,50 m -40,0 a 40,40 0 1 1 80,0 a 40,40 0 1 1 -80,0"
        />
      </svg>
    </div>
  );
};

export default MorphingAnimation;

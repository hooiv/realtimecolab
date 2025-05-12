import { useEffect, useRef } from 'react';
import { animate, utils } from 'animejs';
import './WaveAnimation.css';

interface WaveAnimationProps {
  color?: string;
  height?: number;
  speed?: number;
  amplitude?: number;
}

export const WaveAnimation = ({
  color = '#4facfe',
  height = 100,
  speed = 2000,
  amplitude = 20
}: WaveAnimationProps) => {
  const waveRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (!waveRef.current) return;

    const wave = waveRef.current;
    const width = window.innerWidth;
    const points = 8;
    const segmentLength = width / points;

    // Create wave points
    const getWavePoints = () => {
      let points = 'M 0 ' + height / 2;
      for (let i = 0; i <= width; i += segmentLength) {
        points += ` L ${i} ${height / 2}`;
      }
      return points;
    };

    wave.setAttribute('d', getWavePoints());

    // Animate wave
    animate(wave, {
      easing: 'linear',
      duration: speed,
      loop: true,
      d: [
        { value: getWavePoints().replace(/L \d+ \d+/g, (match) => {
          const [_, x, y] = match.split(' ');
          return `L ${x} ${Number(y) + amplitude}`;
        })},
        { value: getWavePoints() }
      ],
    });

    // Cleanup
    return () => {
      utils.remove(wave);
    };
  }, [height, speed, amplitude]);

  return (
    <div className="wave-animation-container" style={{ height }}>
      <svg width="100%" height={height} viewBox={`0 0 ${window.innerWidth} ${height}`}>
        <path
          ref={waveRef}
          fill="none"
          stroke={color}
          strokeWidth="2"
        />
      </svg>
    </div>
  );
};

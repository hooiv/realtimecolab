import { useRef, useEffect } from 'react';
import { animate } from 'animejs';
import type { AnimeInstance, AnimeParams } from 'animejs';

type AnimeTarget = string | HTMLElement | HTMLElement[] | SVGElement | SVGElement[] | null;

/**
 * Custom hook for easily using anime.js in React components
 * @param targets - Target elements to animate
 * @param animationProps - Animation properties to apply
 * @param deps - Dependencies array to control when animation should run (like useEffect deps)
 * @param autoplay - Whether the animation should auto-play when mounted
 * @returns Animation controls and reference object
 */
export const useAnime = (
  targets: AnimeTarget,
  animationProps: anime.AnimeParams,
  deps: any[] = [],
  autoplay: boolean = true
) => {
  const animeRef = useRef<AnimeInstance | null>(null);
  const targetRef = useRef<HTMLElement | SVGElement | null>(null);

  // Create and store animation instance
  useEffect(() => {
    // Clean up previous animation if exists
    if (animeRef.current) {
      animeRef.current.pause();
    }

    // Create new animation with provided targets and properties
    animeRef.current = animate(targets, {
      ...animationProps,
      autoplay
    });

    // Cleanup function
    return () => {
      if (animeRef.current) {
        animeRef.current.pause();
        // Reset is not available in v4, so we'll just pause
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Return controls and references
  return {
    anime: animeRef,
    targetRef,
    play: () => animeRef.current?.play(),
    pause: () => animeRef.current?.pause(),
    restart: () => animeRef.current?.restart(),
    seek: (time: number) => animeRef.current?.seek(time),
    reverse: () => animeRef.current?.reverse()
  };
};

export default useAnime;

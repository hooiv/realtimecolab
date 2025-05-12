import { useEffect, useRef } from 'react';
import { animate } from 'animejs';

interface ScrollAnimationOptions {
  threshold?: number;
  rootMargin?: string;
  animation?: {
    duration?: number;
    easing?: string;
    delay?: number;
    opacity?: [number, number];
    translateY?: [number, number];
    translateX?: [number, number];
    scale?: [number, number];
  };
}

const defaultOptions: ScrollAnimationOptions = {
  threshold: 0.1,
  rootMargin: '0px',
  animation: {
    duration: 800,
    easing: 'easeOutExpo',
    opacity: [0, 1],
    translateY: [20, 0],
  },
};

export const useScrollAnimation = (
  elementRef: React.RefObject<HTMLElement | null>,
  options: ScrollAnimationOptions = {}
) => {
  const mergedOptions = {
    ...defaultOptions,
    ...options,
    animation: {
      ...defaultOptions.animation,
      ...options.animation,
    },
  };

  const observerRef = useRef<IntersectionObserver | null>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!elementRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasAnimated.current) {
            animate(elementRef.current, {
              ...mergedOptions.animation,
              duration: mergedOptions.animation?.duration,
              easing: mergedOptions.animation?.easing,
              delay: mergedOptions.animation?.delay,
            });
            hasAnimated.current = true;

            // Cleanup observer after animation
            if (observerRef.current) {
              observerRef.current.disconnect();
            }
          }
        });
      },
      {
        threshold: mergedOptions.threshold,
        rootMargin: mergedOptions.rootMargin,
      }
    );

    observerRef.current.observe(elementRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [elementRef, mergedOptions]);
};

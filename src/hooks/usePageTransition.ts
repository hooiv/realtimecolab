import { useCallback } from 'react';
import { animate } from 'animejs';

interface PageTransitionOptions {
  duration?: number;
  easing?: string;
  enterAnimation?: {
    opacity?: [number, number];
    translateY?: [number, number];
    scale?: [number, number];
  };
  exitAnimation?: {
    opacity?: [number, number];
    translateY?: [number, number];
    scale?: [number, number];
  };
}

const defaultOptions: PageTransitionOptions = {
  duration: 800,
  easing: 'easeOutExpo',
  enterAnimation: {
    opacity: [0, 1],
    translateY: [20, 0],
    scale: [0.98, 1],
  },
  exitAnimation: {
    opacity: [1, 0],
    translateY: [0, -20],
    scale: [1, 1.02],
  },
};

export const usePageTransition = (options: PageTransitionOptions = {}) => {
  const mergedOptions = {
    ...defaultOptions,
    ...options,
    enterAnimation: {
      ...defaultOptions.enterAnimation,
      ...options.enterAnimation,
    },
    exitAnimation: {
      ...defaultOptions.exitAnimation,
      ...options.exitAnimation,
    },
  };

  const animateEnter = useCallback((element: HTMLElement) => {
    return animate(element, {
      ...mergedOptions.enterAnimation,
      duration: mergedOptions.duration,
      easing: mergedOptions.easing,
    }).finished;
  }, [mergedOptions]);

  const animateExit = useCallback((element: HTMLElement) => {
    return animate(element, {
      ...mergedOptions.exitAnimation,
      duration: mergedOptions.duration,
      easing: mergedOptions.easing,
    }).finished;
  }, [mergedOptions]);

  return { animateEnter, animateExit };
};

import { animate, stagger } from 'animejs';

/**
 * Helper utility for common anime.js animations
 */
export const animeUtils = {
  /**
   * Creates a staggered animation for multiple elements
   */
  staggerItems: (
    selector: string,
    properties: any,
    options?: {
      staggerValue?: number,
      staggerDirection?: 'normal' | 'reverse',
      grid?: [number, number],
      from?: string | number | [number, number],
      delay?: number
    }
  ) => {
    const { staggerValue = 50, staggerDirection = 'normal', grid, from, delay = 0 } = options || {};

    return animate(selector, {
      ...properties,
      delay: stagger(staggerValue, {
        from: from || 'center',
        direction: staggerDirection,
        grid: grid
      }),
      easing: properties.easing || 'easeOutExpo',
      duration: properties.duration || 800,
      begin: properties.begin,
      complete: properties.complete
    });
  },

  /**
   * Creates a text animation that reveals each character
   */
  textReveal: (
    selector: string,
    options?: {
      duration?: number,
      delay?: number,
      direction?: 'normal' | 'reverse',
      easing?: string
    }
  ) => {
    const { duration = 800, delay = 0, direction = 'normal', easing = 'easeOutExpo' } = options || {};

    // Split text into spans if it's not already split
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
      if (!el.querySelector('span')) {
        const text = el.textContent || '';
        el.textContent = '';

        text.split('').forEach(char => {
          const span = document.createElement('span');
          span.style.display = 'inline-block';
          span.style.opacity = '0';
          span.textContent = char === ' ' ? '\u00A0' : char;
          el.appendChild(span);
        });
      }
    });

    return animate(`${selector} > span`, {
      opacity: [0, 1],
      translateY: [20, 0],
      translateX: [10, 0],
      scale: [0.8, 1],
      rotate: [5, 0],
      duration: duration,
      delay: stagger(30, { start: delay }),
      direction: direction,
      easing: easing
    });
  },

  /**
   * Creates a path drawing animation for SVG paths
   */
  drawSVGPath: (
    selector: string,
    options?: {
      duration?: number,
      delay?: number,
      easing?: string,
      direction?: 'normal' | 'reverse',
      loop?: boolean | number
    }
  ) => {
    const { duration = 1500, delay = 0, easing = 'easeInOutQuad', direction = 'normal', loop = false } = options || {};

    // In anime.js v4, we need to manually calculate the path length
    const paths = document.querySelectorAll(selector);
    paths.forEach(path => {
      const length = (path as SVGPathElement).getTotalLength();
      path.setAttribute('stroke-dasharray', length.toString());
      path.setAttribute('stroke-dashoffset', length.toString());
    });

    return animate(selector, {
      strokeDashoffset: [(anime: any) => {
        // Manual implementation since utils.getPathLength is not available
        const el = anime.animatable.target;
        const pathLength = el.getTotalLength ? el.getTotalLength() : 0;
        return pathLength;
      }, 0], // Manual implementation for path length
      duration: duration,
      delay: delay,
      easing: easing,
      direction: direction,
      loop: loop
    });
  },

  /**
   * Creates a bounce effect animation
   */
  bounce: (
    selector: string,
    properties: any,
    options?: {
      amplitude?: number,
      frequency?: number,
      duration?: number,
      delay?: number
    }
  ) => {
    const { amplitude = 1.2, frequency = 0.4, duration = 1000, delay = 0 } = options || {};

    return animate(selector, {
      ...properties,
      duration: duration,
      delay: delay,
      easing: `easeOutElastic(${amplitude}, ${frequency})`,
      begin: properties.begin,
      complete: properties.complete
    });
  },

  /**
   * Creates an animation triggered on scroll
   */
  animateOnScroll: (
    selector: string,
    properties: any,
    options?: {
      offset?: number,
      threshold?: number
    }
  ) => {
    const { offset = 50, threshold = 0.2 } = options || {};

    // Create intersection observer
    const targets = document.querySelectorAll(selector);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const target = entry.target;
            animate(target, {
              ...properties,
              duration: properties.duration || 800,
              easing: properties.easing || 'easeOutExpo'
            });

            // Unobserve after animation
            observer.unobserve(target);
          }
        });
      },
      {
        rootMargin: `0px 0px -${offset}px 0px`,
        threshold: threshold
      }
    );

    // Observe all targets
    targets.forEach(target => observer.observe(target));

    // Return cleanup function
    return () => {
      targets.forEach(target => observer.unobserve(target));
    };
  }
};

export default animeUtils;

declare module 'animejs' {
  type FunctionBasedParameter = (el: Element, i: number, l: number) => number;
  type AnimeValue = number | string | ReadonlyArray<number | string>;
  type AnimeTarget = string | object | HTMLElement | SVGElement | NodeList | NodeListOf<Element> | null | undefined;

  export interface AnimeInstance {
    finished: Promise<void>;
    pause(): void;
    play(): void;
    restart(): void;
    reverse(): void;
    seek(time: number): void;
    remove(targets: AnimeTarget): void;
    tick: number;
    began: boolean;
    paused: boolean;
    completed: boolean;
    currentTime: number;
    progress: number;
    reversePlayback: boolean;
    remaining: number;
  }

  export interface AnimeParams {
    targets?: AnimeTarget;
    duration?: number | FunctionBasedParameter;
    delay?: number | FunctionBasedParameter | Function | ReadonlyArray<number>;
    endDelay?: number;
    elasticity?: number;
    round?: number;
    keyframes?: object[];
    easing?: string | ((el: Element) => string);
    direction?: 'normal' | 'reverse' | 'alternate';
    loop?: number | boolean;
    autoplay?: boolean;
    timelineOffset?: number;
    [key: string]: any;
    complete?: (anim: AnimeInstance) => void;
    update?: (anim: AnimeInstance) => void;
    begin?: (anim: AnimeInstance) => void;
    loopBegin?: (anim: AnimeInstance) => void;
    change?: (anim: AnimeInstance) => void;
    loopComplete?: (anim: AnimeInstance) => void;
  }

  // Main animation function
  export function animate(targets: AnimeTarget, params: AnimeParams): AnimeInstance;

  // Timeline creation
  export function createTimeline(params?: AnimeParams): AnimeInstance;

  // Utility functions
  export const utils: {
    $: (selector: string) => Element[];
    random: (min: number, max: number, decimalLength?: number) => number;
    remove: (targets: AnimeTarget, instance?: any, propertyName?: string) => Element[];
    // Add other utility functions as needed
  };

  // Spring creation
  export function createSpring(options?: { stiffness?: number, damping?: number, mass?: number }): string;

  // Draggable creation
  export function createDraggable(targets: AnimeTarget, options?: any): any;

  // Scope creation
  export function createScope(options?: { root?: any }): any;

  // Timer creation
  export function createTimer(options?: any): any;

  // Legacy functions for backward compatibility
  export const version: string;
  export const running: AnimeInstance[];
  export function remove(targets: AnimeTarget): void;
  export function random(min: number, max: number): number;
  export function stagger(value: number | string | ReadonlyArray<number | string>, options?: {
    start?: number | string;
    direction?: 'normal' | 'reverse';
    easing?: string | ((el: Element) => string);
    grid?: [number, number];
    axis?: 'x' | 'y';
    from?: number | string | ReadonlyArray<number | string> | 'first' | 'last' | 'center' | 'edges';
  }): Function | ReadonlyArray<number>;
}

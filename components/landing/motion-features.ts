import { domAnimation } from 'motion/react';

/**
 * The animation features `StageTimeline` needs, in a module of their own so
 * `LazyMotion` can load them after the page is interactive instead of shipping
 * them in the start page's first JavaScript (docs/perf/REPORT.md).
 */
export default domAnimation;

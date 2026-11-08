/**
 * Portal tuning. Edited by hand after a session in `tools/portal-tune.html`;
 * the numbers there map 1:1 to these keys.
 *
 *   far   radius (world px) while only two arms are out (no growth)
 *   near  radius at the door, three arms
 *   d3    distance where the third arm starts to appear; radius starts
 *         growing here too and reaches `near` once the third arm is full
 *         (at d3 - fade)
 *   fade  how many px closer it takes to reach full three arms
 *   spin  global rotation-rate multiplier (1 = authored speed)
 */
export const PORTAL = {
  far: 11,
  near: 23,
  d3: 110,
  fade: 30,
  spin: 3,
};

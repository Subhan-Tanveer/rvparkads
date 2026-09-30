// Decorative campground scene behind the login/signup card — Marie's ask
// for "something cool" on this page rather than a bare form. Purely
// visual/aria-hidden, so it degrades to a static illustration (no motion)
// under prefers-reduced-motion, and is hidden outright on narrow screens
// where the card covers it anyway (see .auth-scene's media query).
import { gsap } from 'gsap';
import { prefersReduced } from './core.js';

export function initAuthScene() {
  const scene = document.querySelector('.auth-scene svg');
  if (!scene) return;

  // Sun glow pulse.
  const sun = scene.querySelector('#authSun');
  if (sun && !prefersReduced) {
    gsap.to(sun, { scale: 1.08, opacity: 0.75, duration: 3.2, repeat: -1, yoyo: true, ease: 'sine.inOut', transformOrigin: '50% 50%' });
  }

  // Trees sway gently, each with its own timing so they don't move in
  // lockstep.
  const trees = scene.querySelectorAll('.auth-tree');
  if (!prefersReduced) {
    trees.forEach((tree, i) => {
      gsap.to(tree, {
        rotation: i % 2 === 0 ? 3 : -3,
        duration: 2.4 + (i % 3) * 0.4,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        delay: i * 0.25,
      });
    });
  }

  // Clouds drift left-to-right across the sky, looping seamlessly (a
  // plain .to() resets to its recorded starting x on each repeat).
  const clouds = scene.querySelectorAll('.auth-cloud');
  clouds.forEach((cloud, i) => {
    const startX = -60 - i * 40;
    const startY = 70 + i * 45;
    gsap.set(cloud, { x: startX, y: startY });
    if (!prefersReduced) {
      gsap.to(cloud, { x: 1260, duration: 50 + i * 18, repeat: -1, ease: 'none', delay: i * 6 });
    }
  });

  // Birds fly a shallow diagonal path across the upper sky.
  const birds = scene.querySelectorAll('.auth-bird');
  birds.forEach((bird, i) => {
    const startX = -40;
    const startY = 40 + i * 30;
    gsap.set(bird, { x: startX, y: startY });
    if (!prefersReduced) {
      gsap.to(bird, { x: 1240, y: startY - 30, duration: 14 + i * 4, repeat: -1, ease: 'sine.inOut', delay: i * 5, repeatDelay: 3 });
    }
  });

  // The RV drives the length of the road on a loop, wheels spinning.
  const rv = scene.querySelector('#authRv');
  if (rv) {
    gsap.set(rv, { x: -260, y: 395 });
    if (!prefersReduced) {
      gsap.to(rv, { x: 1300, duration: 17, repeat: -1, ease: 'none' });
      gsap.to(rv, { y: '+=3', duration: 0.35, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      rv.querySelectorAll('.auth-wheel').forEach((wheel) => {
        gsap.to(wheel, { rotation: 360, duration: 0.7, repeat: -1, ease: 'linear', transformOrigin: '50% 50%' });
      });
    }
  }
}

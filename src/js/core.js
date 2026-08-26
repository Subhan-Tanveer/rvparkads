import '../css/main.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

export const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function initSmoothScroll() {
  if (prefersReduced) return null;
  const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  return lenis;
}

function initHeaderShrink() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  ScrollTrigger.create({
    start: 'top -80',
    onUpdate: (self) => header.classList.toggle('is-scrolled', self.scroll() > 80),
  });
}

function initHeroEntrance() {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const targets = hero.querySelectorAll('[data-hero-in]');
  if (!targets.length) return;
  if (prefersReduced) {
    gsap.set(targets, { opacity: 1, y: 0 });
    return;
  }
  gsap.timeline({ defaults: { ease: 'power3.out' } })
    .fromTo(targets, { opacity: 0, y: 34 }, { opacity: 1, y: 0, duration: 1, stagger: 0.12 })
    .fromTo('.hero-blob', { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.4, ease: 'power2.out' }, 0);
}

function initReveal() {
  const groups = document.querySelectorAll('[data-reveal-stagger]');
  groups.forEach((group) => {
    const items = group.children.length ? Array.from(group.children) : [group];
    if (prefersReduced) {
      gsap.set(items, { opacity: 1, y: 0 });
      return;
    }
    gsap.fromTo(items, { opacity: 0, y: 36 }, {
      opacity: 1, y: 0, duration: 0.8, stagger: 0.1, ease: 'power3.out',
      scrollTrigger: { trigger: group, start: 'top 85%' },
    });
  });

  const singles = document.querySelectorAll('[data-reveal]:not([data-reveal-stagger] [data-reveal])');
  singles.forEach((el) => {
    if (prefersReduced) { gsap.set(el, { opacity: 1, y: 0 }); return; }
    gsap.fromTo(el, { opacity: 0, y: 30 }, {
      opacity: 1, y: 0, duration: 0.8, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%' },
    });
  });
}

function initCounters() {
  document.querySelectorAll('[data-count-to]').forEach((el) => {
    const target = parseFloat(el.dataset.countTo);
    const suffix = el.dataset.countSuffix || '';
    if (prefersReduced) { el.textContent = target + suffix; return; }
    const obj = { val: 0 };
    ScrollTrigger.create({
      trigger: el,
      start: 'top 90%',
      once: true,
      onEnter: () => {
        gsap.to(obj, {
          val: target, duration: 1.4, ease: 'power2.out',
          onUpdate: () => { el.textContent = Math.round(obj.val) + suffix; },
        });
      },
    });
  });
}

// Subtle continuous drift on the hero's decorative blobs — purely
// ambient motion, independent of scroll.
function initAmbientBlobs() {
  if (prefersReduced) return;
  gsap.utils.toArray('.hero-blob').forEach((blob, i) => {
    gsap.to(blob, {
      x: i % 2 === 0 ? 30 : -24,
      y: i % 2 === 0 ? -20 : 26,
      duration: 8 + i * 2,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });
  });
}

export function initPage() {
  try {
    initSmoothScroll();
    initHeaderShrink();
    initHeroEntrance();
    initAmbientBlobs();
    initReveal();
    initCounters();
  } catch (err) {
    console.error('initPage failed:', err);
    document.body.dataset.initPageError = err.message;
    // Fail-safe: never leave content invisible if an animation setup step
    // throws — show everything immediately instead of a blank page.
    document.querySelectorAll('[data-reveal], [data-reveal-stagger] > *, [data-hero-in]')
      .forEach((el) => { el.style.opacity = '1'; el.style.transform = 'none'; });
  }
}

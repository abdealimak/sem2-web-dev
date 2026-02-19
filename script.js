/**
 * SPACE INVADERS — LANDING PAGE
 * script.js — Production-grade JavaScript
 *
 * Architecture:
 *  ├── ThemeManager   — Handles theme switching with smooth transitions
 *  ├── CanvasEngine   — requestAnimationFrame loop for background effects
 *  │     ├── StarfieldRenderer (retro)
 *  │     ├── OrbRenderer       (futuristic)
 *  │     └── ParticleRenderer  (anime)
 *  ├── UIBuilder      — Populates dynamic DOM elements
 *  ├── ScrollReveal   — IntersectionObserver for reveal animations
 *  └── StatCounter    — Animates stat numbers when in viewport
 */

'use strict';

/* ==========================================================================
  CONSTANTS & CONFIGURATION
   ========================================================================== */

/** All theme identifiers */
const THEMES = ['retro', 'futuristic', 'anime'];

/** Canvas particle / star configurations per theme */
const CANVAS_CONFIG = {
  retro: {
    starCount: 150,
    starSpeed: 0.3,
    starSizeMin: 0.5,
    starSizeMax: 2,
    color: '#00ff00',
    glowColor: 'rgba(0,255,0,',
    shootingStarInterval: 4000,
    mode: 'starfield',
  },
  futuristic: {
    orbCount: 60,
    orbSpeed: 0.6,
    color: '#00e5ff',
    secondaryColor: '#7b2fff',
    glowColor: 'rgba(0,229,255,',
    connectionDist: 160,
    mode: 'orbs',
  },
  anime: {
    particleCount: 80,
    particleSpeed: 0.8,
    colors: ['#ff2dca', '#7a00ff', '#00e5ff', '#ff6bfe', '#c000ff'],
    mode: 'particles',
  },
};

/* ==========================================================================
  THEME MANAGER
  Manages data-theme attribute on <html>, coordinates transition animations,
  updates button states, and signals the CanvasEngine to switch modes.
   ========================================================================== */

class ThemeManager {
  constructor() {
    /** @type {string} */
    this.currentTheme = localStorage.getItem('si-theme') || 'retro';

    this.htmlEl  = document.documentElement;
    this.bodyEl  = document.body;
    this.veilEl  = document.getElementById('theme-veil');

    /** All theme-switcher buttons (nav + footer) */
    this.allBtns = document.querySelectorAll('[data-theme-target]');

    this._bindEvents();
    this._applyTheme(this.currentTheme, false);
  }

  /** Attach click listeners to all theme buttons */
  _bindEvents() {
    this.allBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.themeTarget;
        if (target !== this.currentTheme) {
          this.switchTo(target);
        }
      });
    });
  }

  /**
   * Public: Switch to a named theme with animation
   * @param {string} theme
   */
  switchTo(theme) {
    if (!THEMES.includes(theme)) return;
    this.currentTheme = theme;
    localStorage.setItem('si-theme', theme);
    this._animateTransition(theme);
  }

  /**
   * Performs the flash-veil → apply → fade sequence
   * 1. Flash veil on  (16ms)
   * 2. Apply theme    (immediate DOM change during veil)
   * 3. Flash veil off (300ms)
   * 4. Body gets transition classes for smooth color interpolation
   */
  _animateTransition(theme) {
    // Step 1: Add transitioning class so all CSS props animate
    this.bodyEl.classList.add('theme-transitioning');

    // Step 2: Flash veil
    this.veilEl.classList.add('flash');

    // Step 3: Apply theme while partially obscured
    setTimeout(() => {
      this._applyTheme(theme, true);
    }, 100);

    // Step 4: Remove veil
    setTimeout(() => {
      this.veilEl.classList.remove('flash');
    }, 320);

    // Step 5: Remove transitioning class after all transitions complete
    setTimeout(() => {
      this.bodyEl.classList.remove('theme-transitioning');
    }, 1100);
  }

  /**
   * Applies a theme: sets data-theme, updates buttons, notifies engine
   * @param {string} theme
   * @param {boolean} notify — whether to signal CanvasEngine
   */
  _applyTheme(theme, notify) {
    this.htmlEl.dataset.theme = theme;
    this._updateButtons(theme);

    // Notify global CanvasEngine instance (created later)
    if (notify && window.__canvasEngine) {
      window.__canvasEngine.setTheme(theme);
    }
    if (notify && window.__animeParticles) {
      window.__animeParticles.setTheme(theme);
    }
  }

  /** Updates aria-pressed and active class on all theme buttons */
  _updateButtons(theme) {
    this.allBtns.forEach(btn => {
      const isActive = btn.dataset.themeTarget === theme;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  }
}

/* ==========================================================================
  CANVAS ENGINE
  A single canvas element renders different effects depending on theme.
  Uses a clean state machine pattern — only one render mode active at a time.
   ========================================================================== */

class CanvasEngine {
  constructor(canvasId) {
    this.canvas  = document.getElementById(canvasId);
    this.ctx     = this.canvas.getContext('2d');
    this.theme   = document.documentElement.dataset.theme || 'retro';
    this.rafId   = null;
    this.running = true;

    // Particle pools — pre-allocated to avoid GC pressure during animation
    this.stars    = [];
    this.orbs     = [];
    this.particles = [];

    this._resize();
    this._buildPools();
    this._startLoop();

    // Respond to window resize efficiently (debounced)
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        this._resize();
        this._buildPools(); // Rebuild pools for new dimensions
      }, 150);
    });

    // Register globally so ThemeManager can signal us
    window.__canvasEngine = this;
  }

  /** Sync canvas pixel dimensions to display size */
  _resize() {
    this.W = this.canvas.width  = window.innerWidth;
    this.H = this.canvas.height = window.innerHeight;
  }

  /**
   * Builds all particle pools.
   * Called on init and on resize — pools are cheap to rebuild.
   */
  _buildPools() {
    this._buildStars();
    this._buildOrbs();
    this._buildParticlesPool();
  }

  /* ---- STARFIELD (Retro) ---- */
  _buildStars() {
    const cfg = CANVAS_CONFIG.retro;
    this.stars = Array.from({ length: cfg.starCount }, () => this._makestar());
    // Shooting star state
    this.shootingStar = null;
    this.lastShootingStarTime = 0;
  }

  _makestar(fromTop = false) {
    const cfg = CANVAS_CONFIG.retro;
    return {
      x:     Math.random() * this.W,
      y:     fromTop ? 0 : Math.random() * this.H,
      size:  cfg.starSizeMin + Math.random() * (cfg.starSizeMax - cfg.starSizeMin),
      speed: cfg.starSpeed * (0.5 + Math.random()),
      opacity: 0.3 + Math.random() * 0.7,
      twinkle: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.02 + Math.random() * 0.04,
    };
  }

  _updateStars(now) {
    const cfg = CANVAS_CONFIG.retro;
    this.stars.forEach(s => {
      s.y      += s.speed;
      s.twinkle += s.twinkleSpeed;
      s.opacity = 0.3 + 0.4 * Math.abs(Math.sin(s.twinkle));
      if (s.y > this.H) Object.assign(s, this._makestar(true));
    });

    // Occasional shooting star
    if (now - this.lastShootingStarTime > CANVAS_CONFIG.retro.shootingStarInterval) {
      this.lastShootingStarTime = now;
      this.shootingStar = {
        x:  Math.random() * this.W,
        y:  Math.random() * (this.H * 0.4),
        dx: 4 + Math.random() * 4,
        dy: 2 + Math.random() * 2,
        len: 80 + Math.random() * 80,
        life: 1,
      };
    }
    if (this.shootingStar) {
      const ss = this.shootingStar;
      ss.x    += ss.dx;
      ss.y    += ss.dy;
      ss.life -= 0.03;
      if (ss.life <= 0 || ss.x > this.W || ss.y > this.H) {
        this.shootingStar = null;
      }
    }
  }

  _drawStars() {
    const cfg = CANVAS_CONFIG.retro;
    this.stars.forEach(s => {
      this.ctx.beginPath();
      // Pixel-style squares for retro look
      this.ctx.fillStyle = `rgba(0,255,0,${s.opacity})`;
      this.ctx.fillRect(s.x, s.y, s.size, s.size);
    });

    // Shooting star
    if (this.shootingStar) {
      const ss = this.shootingStar;
      const grad = this.ctx.createLinearGradient(
        ss.x, ss.y,
        ss.x - ss.dx * (ss.len / 5),
        ss.y - ss.dy * (ss.len / 5)
      );
      grad.addColorStop(0, `rgba(0,255,0,${ss.life})`);
      grad.addColorStop(1, 'rgba(0,255,0,0)');
      this.ctx.beginPath();
      this.ctx.strokeStyle = grad;
      this.ctx.lineWidth = 1.5;
      this.ctx.moveTo(ss.x, ss.y);
      this.ctx.lineTo(ss.x - ss.dx * (ss.len / 5), ss.y - ss.dy * (ss.len / 5));
      this.ctx.stroke();
    }
  }

  /* ---- ORBITING NODES (Futuristic) ---- */
  _buildOrbs() {
    const cfg = CANVAS_CONFIG.futuristic;
    this.orbs = Array.from({ length: cfg.orbCount }, () => ({
      x:   Math.random() * this.W,
      y:   Math.random() * this.H,
      vx:  (Math.random() - 0.5) * cfg.orbSpeed,
      vy:  (Math.random() - 0.5) * cfg.orbSpeed,
      r:   1 + Math.random() * 2.5,
      hue: Math.random() > 0.5 ? 0 : 1, // 0=cyan, 1=purple
    }));
  }

  _updateOrbs() {
    const cfg = CANVAS_CONFIG.futuristic;
    this.orbs.forEach(o => {
      o.x += o.vx;
      o.y += o.vy;
      // Wrap around edges
      if (o.x < -10)       o.x = this.W + 10;
      if (o.x > this.W+10) o.x = -10;
      if (o.y < -10)       o.y = this.H + 10;
      if (o.y > this.H+10) o.y = -10;
    });
  }

  _drawOrbs() {
    const cfg = CANVAS_CONFIG.futuristic;
    const ctx = this.ctx;

    // Draw connection lines first (behind nodes)
    for (let i = 0; i < this.orbs.length; i++) {
      for (let j = i + 1; j < this.orbs.length; j++) {
        const a = this.orbs[i], b = this.orbs[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < cfg.connectionDist) {
          const alpha = (1 - dist / cfg.connectionDist) * 0.25;
          ctx.beginPath();
          ctx.strokeStyle = `rgba(0,229,255,${alpha})`;
          ctx.lineWidth = 0.5;
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // Draw orb nodes with glow
    this.orbs.forEach(o => {
      const color = o.hue === 0 ? [0, 229, 255] : [123, 47, 255];
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},0.85)`;
      ctx.shadowColor = `rgba(${color[0]},${color[1]},${color[2]},0.8)`;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  /* ---- RISING PARTICLES (Anime) ---- */
  _buildParticlesPool() {
    const cfg = CANVAS_CONFIG.anime;
    this.particles = Array.from({ length: cfg.particleCount }, () =>
      this._makeParticle()
    );
  }

  _makeParticle() {
    const cfg = CANVAS_CONFIG.anime;
    return {
      x:      Math.random() * this.W,
      y:      this.H + Math.random() * this.H,
      vx:     (Math.random() - 0.5) * 0.8,
      vy:     -(0.5 + Math.random() * cfg.particleSpeed * 2),
      r:      2 + Math.random() * 5,
      color:  cfg.colors[Math.floor(Math.random() * cfg.colors.length)],
      opacity: 0.1 + Math.random() * 0.5,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.01 + Math.random() * 0.02,
    };
  }

  _updateParticles() {
    this.particles.forEach((p, i) => {
      p.y      += p.vy;
      p.x      += p.vx + Math.sin(p.wobble) * 0.4;
      p.wobble += p.wobbleSpeed;
      if (p.y < -20) {
        this.particles[i] = this._makeParticle();
      }
    });
  }

  _drawParticles() {
    const ctx = this.ctx;
    this.particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.opacity;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.r * 3;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    });
  }

  /* ---- MAIN RENDER LOOP ---- */

  /**
   * The core animation loop.
   * Uses requestAnimationFrame for efficient 60fps rendering.
   * Only draws what is needed for the current theme.
   * @param {number} now — timestamp from rAF
   */
  _loop(now = 0) {
    if (!this.running) return;

    const ctx = this.ctx;

    // Clear with theme-appropriate background
    ctx.clearRect(0, 0, this.W, this.H);

    if (this.theme === 'retro') {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, this.W, this.H);
      this._updateStars(now);
      this._drawStars();
    }

    else if (this.theme === 'futuristic') {
      // Deep space radial clear
      const grad = ctx.createRadialGradient(
        this.W * 0.5, this.H * 0.3, 0,
        this.W * 0.5, this.H * 0.3, this.W * 0.7
      );
      grad.addColorStop(0,   'rgba(8, 22, 48, 0.6)');
      grad.addColorStop(1,   'rgba(3, 11, 24, 0.95)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.W, this.H);
      this._updateOrbs();
      this._drawOrbs();
    }

    else if (this.theme === 'anime') {
      // Vibrant dark with purple tinge
      ctx.fillStyle = 'rgba(13,0,26,0.3)';
      ctx.fillRect(0, 0, this.W, this.H);
      this._updateParticles();
      this._drawParticles();
    }

    this.rafId = requestAnimationFrame(ts => this._loop(ts));
  }

  /** Start the animation loop */
  _startLoop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(ts => this._loop(ts));
  }

  /**
   * Public API: switch theme
   * Rebuilds pools if needed and continues loop — no restart required.
   * @param {string} theme
   */
  setTheme(theme) {
    this.theme = theme;
    // Rebuild pools on theme switch to ensure fresh state
    this._buildPools();
  }

  /** Clean up — call if canvas needs to be destroyed */
  destroy() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }
}

/* ==========================================================================
  UI BUILDER
  Populates dynamic DOM elements that are driven by JavaScript data.
   ========================================================================== */

class UIBuilder {
  constructor() {
    this._buildMiniAlienGrid();
  }

  /**
   * Builds the animated mini alien grid inside the gameplay screen mockup.
   * Creates DOM elements programmatically to keep HTML lean.
   */
  _buildMiniAlienGrid() {
    const grid = document.getElementById('mini-grid');
    if (!grid) return;

    const ROWS = 4, COLS = 7;
    // Track which cells are "alive" to animate score
    const cells = [];

    for (let r = 0; r < ROWS; r++) {
      const row = document.createElement('div');
      row.classList.add('mini-alien-row');
      row.style.animationDelay = `${r * 0.08}s`;

      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('div');
        cell.classList.add('mini-alien-cell');
        // Random alpha for visual variety
        cell.style.opacity = 0.6 + Math.random() * 0.4;
        row.appendChild(cell);
        cells.push(cell);
      }
      grid.appendChild(row);
    }

    // Simulate score incrementing as random aliens disappear
    this._simulateGameplay(cells);
  }

  /**
   * Simulates a simplified "game" by removing mini cells over time
   * and incrementing the score display — purely cosmetic demo.
   */
  _simulateGameplay(cells) {
    const scoreEl = document.getElementById('demo-score');
    if (!scoreEl) return;

    let score = 360;
    const pointValues = [10, 10, 20, 20, 30];
    const shuffled = [...cells].sort(() => Math.random() - 0.5);
    let idx = 0;

    const kill = () => {
      if (idx >= shuffled.length) {
        // All killed — reset after delay
        setTimeout(() => {
          shuffled.forEach(c => {
            c.style.opacity = 0.6 + Math.random() * 0.4;
            c.style.visibility = 'visible';
          });
          score = 360;
          if (scoreEl) scoreEl.textContent = score.toString().padStart(4, '0');
          idx = 0;
          setTimeout(kill, 1200);
        }, 3000);
        return;
      }
      const cell = shuffled[idx++];
      // "Explode" animation
      cell.style.transition = 'opacity 0.2s, transform 0.2s';
      cell.style.opacity = '0';
      cell.style.transform = 'scale(2)';
      setTimeout(() => {
        cell.style.visibility = 'hidden';
        cell.style.transform = '';
      }, 200);

      // Update score
      const pts = pointValues[Math.floor(Math.random() * pointValues.length)];
      score += pts;
      if (scoreEl) scoreEl.textContent = score.toString().padStart(4, '0');

      // Schedule next kill with variable timing (faster as fewer remain)
      const delay = Math.max(200, 1200 - idx * 12);
      setTimeout(kill, delay);
    };

    setTimeout(kill, 2000);
  }
}

/* ==========================================================================
  SCROLL REVEAL
  IntersectionObserver watches for elements with .reveal class and
  adds .visible when they enter the viewport — triggering CSS transitions.
   ========================================================================== */

class ScrollReveal {
  constructor() {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            // Unobserve after reveal — no need to watch anymore
            this.observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    // Observe all reveal targets
    document.querySelectorAll(
      '.story-card, .mechanic-item, .alien-card, .stat-card, .legacy-quote, .section-title, .section-label'
    ).forEach(el => {
      el.classList.add('reveal');
      this.observer.observe(el);
    });
  }
}

/* ==========================================================================
  STAT COUNTER
  Animates numbers in .stat-number elements from 0 to their data-target
  value when they enter the viewport — uses easeOutExpo for snappy feel.
   ========================================================================== */

class StatCounter {
  constructor() {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this._animateCounter(entry.target);
            this.observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );

    document.querySelectorAll('.stat-number[data-target]').forEach(el => {
      this.observer.observe(el);
    });
  }

  /**
   * Animates a single counter element
   * @param {HTMLElement} el
   */
  _animateCounter(el) {
    const target   = parseInt(el.dataset.target, 10);
    const duration = 1800;
    const start    = performance.now();

    const step = (now) => {
      const elapsed  = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Easing: easeOutExpo
      const eased    = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current  = Math.floor(eased * target);
      el.textContent = current.toLocaleString();

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = target.toLocaleString();
      }
    };

    requestAnimationFrame(step);
  }
}

/* ==========================================================================
  MOBILE MENU
  Toggles the collapsible mobile nav menu.
   ========================================================================== */

class MobileMenu {
  constructor() {
    this.toggle = document.getElementById('nav-menu-toggle');
    this.menu   = document.getElementById('mobile-menu');
    if (!this.toggle || !this.menu) return;

    this.isOpen = false;
    this.toggle.addEventListener('click', () => this._toggleMenu());

    // Close on nav link click
    this.menu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => this._closeMenu());
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (this.isOpen && !e.target.closest('.site-nav')) {
        this._closeMenu();
      }
    });
  }

  _toggleMenu() {
    this.isOpen ? this._closeMenu() : this._openMenu();
  }

  _openMenu() {
    this.isOpen = true;
    this.menu.classList.add('open');
    this.menu.setAttribute('aria-hidden', 'false');
    this.toggle.setAttribute('aria-expanded', 'true');
  }

  _closeMenu() {
    this.isOpen = false;
    this.menu.classList.remove('open');
    this.menu.setAttribute('aria-hidden', 'true');
    this.toggle.setAttribute('aria-expanded', 'false');
  }
}

/* ==========================================================================
  NAV SCROLL BEHAVIOR
  Slightly shrinks/tightens the nav on scroll for a sticky header effect.
   ========================================================================== */

class NavScroll {
  constructor() {
    this.nav = document.querySelector('.site-nav');
    if (!this.nav) return;

    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          this._onScroll();
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  _onScroll() {
    const scrolled = window.scrollY > 60;
    this.nav.style.boxShadow = scrolled
      ? '0 4px 30px rgba(0,0,0,0.6)'
      : 'none';
  }
}

/* ==========================================================================
  PARALLAX HERO ELEMENTS
  Subtle mouse-follow parallax on the hero aliens and ship.
  Enhances the "3D" feel across all themes.
   ========================================================================== */

class HeroParallax {
  constructor() {
    this.heroAliens = document.querySelector('.hero-aliens');
    this.heroShip   = document.querySelector('.hero-ship-wrap');
    this.heroTitle  = document.querySelector('.hero-title');

    if (!this.heroAliens) return;

    // Store last mouse position for smooth lerp
    this.mouseX = 0;
    this.mouseY = 0;
    this.currX  = 0;
    this.currY  = 0;

    document.addEventListener('mousemove', (e) => {
      this.mouseX = (e.clientX / window.innerWidth  - 0.5) * 2; // -1 to 1
      this.mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    this._loop();
  }

  _loop() {
    // Lerp towards mouse target — smooth & laggy for organic feel
    this.currX += (this.mouseX - this.currX) * 0.04;
    this.currY += (this.mouseY - this.currY) * 0.04;

    if (this.heroAliens) {
      this.heroAliens.style.transform =
        `translate(${this.currX * -18}px, ${this.currY * -10}px)`;
    }
    if (this.heroShip) {
      this.heroShip.style.transform =
        `translate(${this.currX * 12}px, ${this.currY * 6}px)`;
    }
    if (this.heroTitle) {
      this.heroTitle.style.transform =
        `translate(${this.currX * 6}px, ${this.currY * 3}px)`;
    }

    requestAnimationFrame(() => this._loop());
  }
}

/* ==========================================================================
  BUTTON RIPPLE EFFECT
  Adds a material-design style ripple on primary button clicks.
   ========================================================================== */

class ButtonRipple {
  constructor() {
    document.querySelectorAll('.btn-primary').forEach(btn => {
      btn.addEventListener('click', (e) => this._createRipple(e, btn));
    });
  }

  _createRipple(e, btn) {
    const ripple  = document.createElement('span');
    const rect    = btn.getBoundingClientRect();
    const size    = Math.max(rect.width, rect.height) * 2;
    const x       = e.clientX - rect.left - size / 2;
    const y       = e.clientY - rect.top  - size / 2;

    ripple.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      left: ${x}px;
      top: ${y}px;
      background: rgba(255,255,255,0.35);
      border-radius: 50%;
      transform: scale(0);
      animation: ripple-expand 0.6s ease-out forwards;
      pointer-events: none;
    `;

    // Inject keyframes  e
    if (!document.getElementById('ripple-styles')) {
      const style = document.createElement('style');
      style.id = 'ripple-styles';
      style.textContent = `
        @keyframes ripple-expand {
          to { transform: scale(1); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    btn.style.overflow = 'hidden';
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 650);
  }
}

/* ==========================================================================
  KEYBOARD EASTER EGG — KONAMI CODE
  Press ↑↑↓↓←→←→BA then Enter to trigger a hidden animation.
  Because every Space Invaders tribute needs a easter egg.
   ========================================================================== */

class KonamiCode {
  constructor() {
    this.sequence  = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
    this.progress  = 0;

    document.addEventListener('keydown', (e) => {
      if (e.key === this.sequence[this.progress]) {
        this.progress++;
        if (this.progress === this.sequence.length) {
          this.progress = 0;
          this._activate();
        }
      } else {
        this.progress = e.key === this.sequence[0] ? 1 : 0;
      }
    });
  }

  _activate() {
    // Flash all aliens briefly with rainbow colors
    const aliens = document.querySelectorAll('.alien, .alien-big');
    const colors = ['#ff0000','#ff8800','#ffff00','#00ff00','#00ffff','#0088ff','#ff00ff'];
    let i = 0;
    const flash = setInterval(() => {
      aliens.forEach(a => {
        a.style.color = colors[i % colors.length];
        a.style.filter = `drop-shadow(0 0 20px ${colors[i % colors.length]})`;
      });
      i++;
      if (i > colors.length * 3) {
        clearInterval(flash);
        // Reset to theme color
        aliens.forEach(a => {
          a.style.color = '';
          a.style.filter = '';
        });
      }
    }, 100);

    // Show a message
    const msg = document.createElement('div');
    msg.textContent = '🎮 KONAMI CODE ACTIVATED! 👾';
    msg.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%,-50%);
      background: rgba(0,0,0,0.9);
      color: #00ff00;
      font-family: 'Press Start 2P', monospace;
      font-size: clamp(0.6rem, 2vw, 1rem);
      padding: 24px 40px;
      z-index: 99999;
      border: 2px solid #00ff00;
      box-shadow: 0 0 40px #00ff00;
      text-align: center;
      animation: konami-msg 3s ease forwards;
    `;
    const ks = document.createElement('style');
    ks.textContent = `
      @keyframes konami-msg {
        0%   { opacity:0; transform:translate(-50%,-50%) scale(0.5); }
        15%  { opacity:1; transform:translate(-50%,-50%) scale(1.05); }
        85%  { opacity:1; transform:translate(-50%,-50%) scale(1); }
        100% { opacity:0; transform:translate(-50%,-50%) scale(0.9); }
      }
    `;
    document.head.appendChild(ks);
    document.body.appendChild(msg);
    setTimeout(() => { msg.remove(); ks.remove(); }, 3000);
  }
}

/* ==========================================================================
  SMOOTH ANCHOR SCROLLING
  Enhances native scroll-behavior with offset for fixed nav.
   ========================================================================== */

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href').slice(1);
      const target   = document.getElementById(targetId);
      if (!target) return;
      e.preventDefault();
      const offset = 80; // nav height
      const top    = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
}

/* ==========================================================================
  HERO TEXT GLITCH EFFECT (Retro theme)
  Periodic random character replacement for the glitch aesthetic.
  Only runs in retro theme to preserve performance.
   ========================================================================== */

class GlitchText {
  constructor() {
    this.elements  = document.querySelectorAll('.hero-title-accent');
    this.glitchChars = '!@#$%^&*()_+-=[]{}|;:,.<>?/\\`~';
    this.isGlitching = false;

    setInterval(() => this._maybeGlitch(), 3500);
  }

  _maybeGlitch() {
    const theme = document.documentElement.dataset.theme;
    if (theme !== 'retro' || this.isGlitching) return;

    this.elements.forEach(el => {
      const original = el.textContent;
      this.isGlitching = true;

      let ticks = 0;
      const maxTicks = 8;
      const interval = setInterval(() => {
        if (ticks >= maxTicks) {
          el.textContent = original;
          clearInterval(interval);
          this.isGlitching = false;
          return;
        }
        // Replace random characters with glitch chars
        el.textContent = original
          .split('')
          .map(ch => (ch !== ' ' && Math.random() < 0.3)
            ? this.glitchChars[Math.floor(Math.random() * this.glitchChars.length)]
            : ch
          )
          .join('');
        ticks++;
      }, 50);
    });
  }
}

/* ==========================================================================
  INITIALIZATION
  All modules instantiated after DOM is fully loaded.
  Order matters: ThemeManager → CanvasEngine → UI modules
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Core
  const themeManager = new ThemeManager();
  const canvasEngine = new CanvasEngine('bg-canvas');

  // Ensure ThemeManager can notify CanvasEngine after both are created
  themeManager._applyTheme(themeManager.currentTheme, false);

  // UI & Interaction
  new UIBuilder();
  new ScrollReveal();
  new StatCounter();
  new MobileMenu();
  new NavScroll();
  new HeroParallax();
  new ButtonRipple();
  new KonamiCode();
  new GlitchText();

  initSmoothScroll();

  // Wire up ThemeManager → CanvasEngine for subsequent switches
  // (already registered via window.__canvasEngine)
  window.__canvasEngine = canvasEngine;

  // Ensure initial canvas theme matches html data-theme
  canvasEngine.setTheme(themeManager.currentTheme);

  // Log build info for developer inspection
  console.log(
    '%c🚀 Space Invaders Landing Page%c\n' +
    'Theme: ' + themeManager.currentTheme + '\n' +
    'Canvas: Active\n' +
    'Try the Konami Code: ↑↑↓↓←→←→BA',
    'color: #00ff00; font-family: monospace; font-weight: bold; font-size: 14px;',
    'color: #00cc00; font-family: monospace; font-size: 11px;'
  );
});
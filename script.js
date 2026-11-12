// Local time
const timeEl = document.getElementById('timeText');

function updateTime() {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York'
  }).toLowerCase();
  timeEl.innerHTML = time.replace(':', '<span class="colon">:</span>') + ' in New York';
}

updateTime();
setInterval(updateTime, 10000);

// GitHub contributions
const contribEl = document.getElementById('githubContribChart');
const contribStatsEl = document.getElementById('githubContribStats');

function contributionLevel(count) {
  if (count === 0) return 0;
  if (count < 3) return 1;
  if (count < 6) return 2;
  if (count < 10) return 3;
  return 4;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function formatContributionDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

function contributionText(count, dateString) {
  return `${count} contribution${count === 1 ? '' : 's'} on ${formatContributionDate(dateString)}`;
}

async function fetchGithubContributions() {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch('https://github-contributions-api.jogruber.de/v4/lhnmx?y=last', {
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`GitHub contribution request failed: ${res.status}`);

      const data = await res.json();
      if (!Array.isArray(data.contributions)) {
        throw new Error('GitHub contribution response is missing daily activity');
      }
      return data.contributions;
    } catch (error) {
      if (attempt === 1) throw error;
    } finally {
      clearTimeout(timeout);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function renderGithubContributions() {
  if (!contribEl) return;

  try {
    const contributions = await fetchGithubContributions();
    const countsByDate = new Map(
      contributions.map(day => [day.date, day.count])
    );
    const today = new Date();
    const start = new Date(today);
    start.setMonth(start.getMonth() - 3);
    const days = [];

    const grid = document.createElement('div');
    grid.className = 'github-contrib-grid';
    grid.setAttribute('aria-label', 'GitHub contributions over the last 3 months');

    for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
      const key = dateKey(d);
      const count = countsByDate.get(key) || 0;
      days.push({ date: new Date(d), key, count });
      const cell = document.createElement('span');
      cell.className = 'github-contrib-day';
      cell.tabIndex = 0;
      cell.dataset.level = contributionLevel(count);
      cell.dataset.detail = contributionText(count, key);
      cell.title = cell.dataset.detail;
      cell.setAttribute('aria-label', cell.dataset.detail);
      grid.appendChild(cell);
    }

    const total = days.reduce((sum, day) => sum + day.count, 0);
    const activeDays = days.filter(day => day.count > 0).length;

    if (contribStatsEl) {
      contribStatsEl.textContent = `last 3 months · ${total} contributions · ${activeDays} active days`;
    }

    contribEl.replaceChildren(grid);
  } catch (error) {
    console.warn('Unable to load GitHub contributions', error);
    const fallback = document.createElement('p');
    fallback.className = 'github-contrib-status';
    fallback.textContent = 'github activity is temporarily unavailable';
    contribEl.replaceChildren(fallback);
    if (contribStatsEl) contribStatsEl.textContent = '';
  }
}

renderGithubContributions();

const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.section-nav a');
const navDot = document.getElementById('navDot');
const sectionNav = document.getElementById('sectionNav');
let currentDotPos = null;
let navDotAnimId = null;

// Spring physics parameters: snappy fast spring (~220ms settling)
const springK = 520;
const springC = 36;
const springZeta = springC / (2 * Math.sqrt(springK));
const springW0 = Math.sqrt(springK);
const springWd = springW0 * Math.sqrt(1 - springZeta * springZeta);
const springDecay = springZeta * springW0;

function springProgress(t) {
  if (t <= 0) return 0;
  return 1 - Math.exp(-springDecay * t) * (Math.cos(springWd * t) + (springDecay / springWd) * Math.sin(springWd * t));
}

function getNavDotTarget(activeLink) {
  if (!activeLink || !sectionNav || !navDot) return null;
  const navRect = sectionNav.getBoundingClientRect();
  const linkRect = activeLink.getBoundingClientRect();
  const dotSize = navDot.offsetWidth || 5;

  const y = (linkRect.top - navRect.top) + (linkRect.height - dotSize) / 2;
  // Positioned on the left of text matching the original -0.9375rem active dot
  const x = (linkRect.left - navRect.left) - 15;
  return { x, y };
}

function updateNavDot(targetId, { instant = false } = {}) {
  if (!navDot || !sectionNav) return;

  const targetLink = Array.from(navLinks).find(a => a.getAttribute('href') === '#' + targetId);
  if (!targetLink) return;

  const endPos = getNavDotTarget(targetLink);
  if (!endPos) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (instant || !currentDotPos || prefersReducedMotion) {
    if (navDotAnimId) {
      cancelAnimationFrame(navDotAnimId);
      navDotAnimId = null;
    }
    currentDotPos = { ...endPos };
    navDot.style.transform = `translate3d(${endPos.x}px, ${endPos.y}px, 0)`;
    return;
  }

  // Find previous link to trigger subtle recoil
  const prevLink = Array.from(navLinks).find(a => a !== targetLink && Math.abs((getNavDotTarget(a)?.y ?? -999) - currentDotPos.y) < 6);
  if (prevLink) {
    prevLink.classList.remove('recoil-left');
    void prevLink.offsetWidth;
    prevLink.classList.add('recoil-left');
    setTimeout(() => prevLink.classList.remove('recoil-left'), 220);
  }

  if (navDotAnimId) cancelAnimationFrame(navDotAnimId);

  const startPos = { ...currentDotPos };
  const startTime = performance.now();
  const duration = 0.24; // ~240ms fast spring

  function frame(now) {
    const elapsedSec = (now - startTime) / 1000;
    const progress = springProgress(elapsedSec);

    const curX = startPos.x + (endPos.x - startPos.x) * progress;
    const curY = startPos.y + (endPos.y - startPos.y) * progress;
    currentDotPos = { x: curX, y: curY };
    navDot.style.transform = `translate3d(${curX}px, ${curY}px, 0)`;

    if (elapsedSec < duration) {
      navDotAnimId = requestAnimationFrame(frame);
    } else {
      currentDotPos = { ...endPos };
      navDot.style.transform = `translate3d(${endPos.x}px, ${endPos.y}px, 0)`;
      navDotAnimId = null;
    }
  }

  navDotAnimId = requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  const activeLink = document.querySelector('.section-nav a.active');
  if (activeLink) {
    const id = activeLink.getAttribute('href').slice(1);
    updateNavDot(id, { instant: true });
  }
});

if (document.fonts) {
  document.fonts.ready.then(() => {
    const activeLink = document.querySelector('.section-nav a.active');
    if (activeLink) {
      const id = activeLink.getAttribute('href').slice(1);
      updateNavDot(id, { instant: true });
    }
  });
}

let activeViewTransition = null;

function show(id, { updateHash = true, animate = true } = {}) {
  const currentActive = document.querySelector('.section-nav a.active');
  if (currentActive && currentActive.getAttribute('href') === '#' + id) {
    return;
  }

  const update = () => {
    if (id === 'writing') {
      closeWriting();
    }
    sections.forEach(s => s.classList.toggle('active', s.id === id));
    navLinks.forEach(a => {
      const active = a.getAttribute('href') === '#' + id;
      a.classList.toggle('active', active);
      if (active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.querySelector('.intro').classList.toggle('hidden', id !== 'about');
    updateNavDot(id, { instant: !animate });
    if (updateHash) history.replaceState(null, '', '#' + id);
  };

  if (animate) {
    transition(update);
  } else {
    update();
  }
}

function transition(update) {
  if (document.startViewTransition) {
    if (activeViewTransition) {
      try {
        activeViewTransition.skipTransition();
      } catch (err) {}
      activeViewTransition = null;
    }
    try {
      activeViewTransition = document.startViewTransition(update);
      activeViewTransition.finished.finally(() => {
        activeViewTransition = null;
      });
    } catch (err) {
      update();
    }
  } else {
    update();
  }
}

navLinks.forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    show(a.getAttribute('href').slice(1));
  });
});

// Expandable writing drafts
const writingList = document.querySelector('.writing-list');
const writingReader = document.querySelector('.writing-reader');
const writingPanels = document.querySelectorAll('[data-writing-panel]');
const writingBack = document.querySelector('.writing-back');

function closeWriting() {
  if (!writingList || !writingReader || !writingBack) return;
  writingReader.classList.remove('open');
  writingPanels.forEach(panel => panel.classList.remove('active'));
  writingList.classList.remove('hidden');
  writingBack.classList.remove('active');
}

document.querySelectorAll('[data-writing-target]').forEach(item => {
  item.addEventListener('click', () => {
    if (!writingList || !writingReader || !writingBack) return;
    const target = item.dataset.writingTarget;
    transition(() => {
      writingPanels.forEach(panel => {
        panel.classList.toggle('active', panel.dataset.writingPanel === target);
      });
      writingList.classList.add('hidden');
      writingReader.classList.add('open');
      writingBack.classList.add('active');
    });
  });
});

if (writingBack && writingReader) {
  writingBack.addEventListener('click', () => {
    if (!writingReader.classList.contains('open')) return;
    transition(closeWriting);
  });
}

// Show the initial section immediately without adding a URL fragment.
const initial = location.hash.slice(1);
show(initial && document.getElementById(initial) ? initial : 'about', {
  updateHash: false,
  animate: false
});

// Keep URL fragments from scrolling past the intro when the page opens.
window.addEventListener('load', () => {
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}, { once: true });

// WebMCP: share existing page content and reversible navigation with browser agents.
const portfolioSectionIds = Array.from(sections, section => section.id);
const experienceItems = Array.from(document.querySelectorAll('.exp-item'));
const experienceCompanies = experienceItems.map(item => item.querySelector('.exp-company').textContent.trim());

function readPortfolioSection(id) {
  const section = Array.from(sections).find(section => section.id === id);
  if (!section) return { error: 'Unknown section.', availableSections: portfolioSectionIds };

  return {
    section: id,
    url: new URL('#' + id, location.href).href,
    // textContent includes collapsed details; innerText would omit hidden sections.
    text: section.textContent.replace(/\s+/g, ' ').trim(),
    links: Array.from(section.querySelectorAll('a[href]'), link => ({
      text: link.textContent.trim(),
      url: link.href
    }))
  };
}

async function registerWebMcpTools() {
  if (!document.modelContext?.registerTool) return;

  const sectionSchema = {
    type: 'object',
    properties: {
      section: {
        type: 'string',
        enum: portfolioSectionIds,
        description: 'The portfolio section to read or show.'
      }
    },
    required: ['section'],
    additionalProperties: false
  };
  const tools = [
    {
      name: 'get_owner_profile',
      description: 'Read Morgan Le’s public background, target roles (Forward Deployed Engineer / FDE), career interests, and contact links.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, consequentialHint: false },
      execute: async () => {
        try {
          const response = await fetch('agent-profile.json');
          if (!response.ok) return { error: 'Profile unavailable. Read the about section instead.' };
          return await response.json();
        } catch {
          return { error: 'Profile could not be loaded. Read the about section instead.' };
        }
      }
    },
    {
      name: 'read_portfolio_section',
      description: 'Read a section of Morgan Le’s portfolio, including links and collapsed experience details, without changing the visible section.',
      inputSchema: sectionSchema,
      annotations: { readOnlyHint: true, consequentialHint: false },
      execute: ({ section } = {}) => readPortfolioSection(section)
    },
    {
      name: 'navigate_to_section',
      description: 'Show a section of Morgan Le’s portfolio and update the current page URL fragment.',
      inputSchema: sectionSchema,
      annotations: { readOnlyHint: false, consequentialHint: false },
      execute: ({ section } = {}) => {
        const content = readPortfolioSection(section);
        if (content.error) return content;
        // Apply immediately so the agent observes the completed navigation.
        show(section, { animate: false });
        return content;
      }
    },
    {
      name: 'set_experience_expanded',
      description: 'Show the experience section and expand or collapse the details for a named employer. Returns the experience text.',
      inputSchema: {
        type: 'object',
        properties: {
          company: { type: 'string', enum: experienceCompanies },
          expanded: { type: 'boolean', description: 'True to expand; false to collapse.' }
        },
        required: ['company', 'expanded'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, consequentialHint: false },
      execute: ({ company, expanded } = {}) => {
        const index = experienceCompanies.indexOf(company);
        if (index === -1 || typeof expanded !== 'boolean') {
          return { error: 'Provide a listed company and a boolean expanded value.', availableCompanies: experienceCompanies };
        }
        show('experience', { animate: false });
        experienceItems[index].classList.toggle('open', expanded);
        return {
          company,
          expanded,
          text: experienceItems[index].textContent.replace(/\s+/g, ' ').trim()
        };
      }
    }
  ];

  for (const tool of tools) {
    try {
      await document.modelContext.registerTool(tool);
    } catch (error) {
      console.warn(`WebMCP tool registration failed (${tool.name}):`, error);
    }
  }
}

registerWebMcpTools();

// Expandable experience items
document.querySelectorAll('.exp-summary').forEach(summary => {
  summary.addEventListener('click', () => {
    const item = summary.closest('.exp-item');
    item.classList.toggle('open');
  });
});

// Cursor spotlight on bordered cards
document.querySelectorAll('.exp-item, .writing-item').forEach(card => {
  let glow = 0, target = 0, raf;

  function animate() {
    glow += (target - glow) * 0.1;
    card.style.setProperty('--glow', glow.toFixed(3));
    if (Math.abs(target - glow) > 0.001) {
      raf = requestAnimationFrame(animate);
    } else {
      card.style.setProperty('--glow', target);
    }
  }

  card.addEventListener('mouseenter', () => {
    target = 1;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(animate);
  });

  card.addEventListener('mouseleave', () => {
    target = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(animate);
  });

  card.addEventListener('mousemove', e => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--x', `${e.clientX - rect.left}px`);
    card.style.setProperty('--y', `${e.clientY - rect.top}px`);
  });
});

// Applied AI Spirit: The Living Ink Companion
(function initAiSpirit() {
  const canvas = document.getElementById('aiSpiritCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const container = canvas.closest('.ai-spirit-widget') || canvas;

  let animId = null;
  let time = 0;
  let isHovered = false;
  let clickBounce = 0;
  let lastTime = performance.now();

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 90;
    const h = rect.height || 54;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });

  container.addEventListener('mouseenter', () => { isHovered = true; });
  container.addEventListener('mouseleave', () => { isHovered = false; });
  container.addEventListener('click', () => { clickBounce = 1.0; });

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function renderFrame(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    time += dt;

    if (clickBounce > 0) {
      clickBounce = Math.max(0, clickBounce - dt * 2.5);
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2 - 2;
    const bounceOffset = clickBounce * 9 * Math.sin(clickBounce * Math.PI);
    const shadowY = cy + 17;

    // ─────────────────────────────────────────────────────────────
    // ACTIVE CHARACTER: THE LIVING INK SPIRIT
    // ─────────────────────────────────────────────────────────────
    const breath = Math.sin(time * 2.8) * 1.8;
    const spiritY = cy + breath - bounceOffset;

    // Ground shadow expands/contracts with breathing & bouncing
    const shadowScale = 1 + (breath / 12) - (clickBounce * 0.35);
    ctx.fillStyle = 'rgba(26, 26, 26, 0.08)';
    ctx.beginPath();
    ctx.ellipse(cx, shadowY, 16 * shadowScale, 3.2 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Fluid harmonic ink droplet with jelly physics
    const baseR = 12.8;
    const points = 16;
    ctx.beginPath();

    for (let i = 0; i <= points; i++) {
      const theta = (i / points) * Math.PI * 2;
      const deform = Math.sin(theta * 3 + time * 3.2) * 1.4 + Math.cos(theta * 2 - time * 2.2) * 1.0;
      const hoverWiggle = isHovered ? Math.sin(theta * 4 + time * 6) * 1.2 : 0;
      const r = baseR + deform + hoverWiggle;
      const px = cx + Math.cos(theta) * r;
      const py = spiritY + Math.sin(theta) * (r * 0.9);

      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#1a1a1a';
    ctx.fill();

    // Ambient vital pulse rings
    const pulseT = (time % 2.8) / 2.8;
    const pulseR = baseR + pulseT * 18;
    const pulseAlpha = Math.max(0, 1 - pulseT) * 0.22;
    ctx.strokeStyle = `rgba(26, 26, 26, ${pulseAlpha})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(cx, spiritY, pulseR, 0, Math.PI * 2);
    ctx.stroke();

    // Expressive Anime-Bot Gleaming Eyes
    const eyeOffsetX = 4.6;
    const eyeY = spiritY - 1.2;

    // Natural blink timing
    const blinkCycle = time % 4.2;
    const isBlinking = blinkCycle > 2.8 && blinkCycle < 3.05;

    if (isBlinking) {
      ctx.strokeStyle = '#f3ecdf';
      ctx.lineWidth = 1.3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - eyeOffsetX - 2, eyeY);
      ctx.lineTo(cx - eyeOffsetX + 2, eyeY);
      ctx.moveTo(cx + eyeOffsetX - 2, eyeY);
      ctx.lineTo(cx + eyeOffsetX + 2, eyeY);
      ctx.stroke();
    } else if (isHovered) {
      // Joyful smiling eye arcs on hover (^ ^)
      ctx.strokeStyle = '#f3ecdf';
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx - eyeOffsetX, eyeY + 0.8, 2.2, Math.PI * 1.15, Math.PI * 1.85);
      ctx.arc(cx + eyeOffsetX, eyeY + 0.8, 2.2, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();

      // Floating '✦' spark
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✦', cx, spiritY - 16 + Math.sin(time * 5) * 1.5);
    } else {
      // Wide-awake glossy eyes
      const eyeR = 2.8;

      // Subtle inquisitive glance towards "Applied AI" text
      let glanceX = 0;
      if (blinkCycle > 1.2 && blinkCycle < 2.5) {
        glanceX = -0.8;
      }

      // Eye whites
      ctx.fillStyle = '#f3ecdf';
      ctx.beginPath();
      ctx.arc(cx - eyeOffsetX, eyeY, eyeR, 0, Math.PI * 2);
      ctx.arc(cx + eyeOffsetX, eyeY, eyeR, 0, Math.PI * 2);
      ctx.fill();

      // Pupils
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.arc(cx - eyeOffsetX + glanceX, eyeY + 0.2, eyeR * 0.52, 0, Math.PI * 2);
      ctx.arc(cx + eyeOffsetX + glanceX, eyeY + 0.2, eyeR * 0.52, 0, Math.PI * 2);
      ctx.fill();

      // Catchlight gleams
      ctx.fillStyle = '#f3ecdf';
      ctx.beginPath();
      ctx.arc(cx - eyeOffsetX + glanceX - 0.7, eyeY - 0.7, 0.85, 0, Math.PI * 2);
      ctx.arc(cx + eyeOffsetX + glanceX - 0.7, eyeY - 0.7, 0.85, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    if (!prefersReducedMotion) {
      animId = requestAnimationFrame(renderFrame);
    }
  }

  // Draw initial frame
  renderFrame(performance.now());

  // Pause when tab is inactive to preserve CPU / battery
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (animId) {
        cancelAnimationFrame(animId);
        animId = null;
      }
    } else if (!prefersReducedMotion && !animId) {
      lastTime = performance.now();
      animId = requestAnimationFrame(renderFrame);
    }
  });

  /* ─────────────────────────────────────────────────────────────
     ARCHIVED ALTERNATIVE: THE AWAKENED SPARK & ASCII BEING
     (Preserved in case we ever want to restore or switch back)
     ─────────────────────────────────────────────────────────────
     function renderSparkBeing(ctx, cx, cy, time, isHovered, bounceOffset, shadowY) {
       const hopSpeed = isHovered ? 6.5 : 3.8;
       const hopHeight = isHovered ? 7.5 : 4.8;
       const hop = Math.abs(Math.sin(time * hopSpeed)) * hopHeight;
       const charY = cy - hop - bounceOffset;

       const shadowScale = Math.max(0.6, 1 - hop / 14);
       ctx.fillStyle = 'rgba(26, 26, 26, 0.08)';
       ctx.beginPath();
       ctx.ellipse(cx, shadowY, 14 * shadowScale, 3 * shadowScale, 0, 0, Math.PI * 2);
       ctx.fill();

       const pulseT = (time % 2.5) / 2.5;
       const pulseR = 12 + pulseT * 20;
       const pulseAlpha = Math.max(0, 1 - pulseT) * 0.25;
       ctx.strokeStyle = `rgba(26, 26, 26, ${pulseAlpha})`;
       ctx.lineWidth = 0.8;
       ctx.beginPath();
       ctx.arc(cx, charY, pulseR, 0, Math.PI * 2);
       ctx.stroke();

       ctx.font = "600 12px 'JetBrains Mono', monospace";
       ctx.textAlign = 'center';
       ctx.textBaseline = 'middle';
       ctx.fillStyle = '#1a1a1a';

       if (isHovered) {
         ctx.fillText('( ≧ ◡ ≦ )', cx, charY);
         ctx.font = '9px sans-serif';
         ctx.fillText('✦', cx, charY - 15 + Math.sin(time * 6) * 1.5);
       } else {
         if (Math.sin(time * 2.2) > 0.2) {
           ctx.fillText('( ^ ◡ ^ )', cx, charY);
         } else {
           ctx.fillText('( • ᴗ • )', cx, charY);
         }
       }
     }
  */
})();

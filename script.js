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

async function renderGithubContributions() {
  if (!contribEl) return;

  try {
    const res = await fetch('https://github-contributions-api.jogruber.de/v4/lhnmx');
    if (!res.ok) throw new Error('GitHub contribution data unavailable');

    const data = await res.json();
    const countsByDate = new Map(
      data.contributions.map(day => [day.date, day.count])
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
  } catch {
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

function show(id, { updateHash = true, animate = true } = {}) {
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
    document.startViewTransition(update);
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

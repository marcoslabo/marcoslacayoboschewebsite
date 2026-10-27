/* ==========================================================================
   Homepage
   - "Things I've built" cards (edit BUILT_PROJECTS to add or remove)
   - Latest 3 blog posts into Insights (static cards in index.html are the fallback)
   - UTM pass-through to /diagnose and Calendly, plus click events for Vercel Analytics
   ========================================================================== */

// Cards with no link aren't clickable
const BUILT_PROJECTS = [
  {
    name: 'VytalMed',
    oneLiner: '6-suite AI radiology platform running inside one of the largest radiology groups in the U.S.',
    link: 'https://www.vytalmed.co',
    tag: 'With Nymbl'
  },
  {
    name: 'VytalList',
    oneLiner: 'Replaced a rented worklist (Clario) with their own. Projected $3.5M/yr in SaaS savings.',
    tag: 'With Nymbl'
  },
  {
    name: 'Estación Vital',
    oneLiner: 'Telehealth kiosk platform for 400,000 users, installed with Walmart.',
    tag: 'Founder'
  },
  {
    name: 'Movistar Health Club',
    oneLiner: 'Health platform for 100,000+ telecom subscribers.',
    tag: 'Founder'
  },
  {
    name: 'Philips wellness app',
    oneLiner: 'Obesity wellness app, a $1.5M partnership.',
    tag: 'Founder'
  },
  {
    name: 'Aló',
    oneLiner: 'The bilingual receptionist that never misses a call',
    link: 'https://marcoslabo.github.io/sofia-site/',
    tag: 'My lab'
  },
  {
    name: 'KeepMedCover',
    oneLiner: 'Helps Medicaid patients keep their coverage',
    link: 'https://keepmedcover.com',
    tag: 'My lab'
  }
];

// Same public anon key the blog uses (RLS-protected, read-only on published posts)
const HOME_SUPABASE_URL = 'https://eccodohheekwbywifipl.supabase.co';
const HOME_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjY29kb2hoZWVrd2J5d2lmaXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NTU3NTIsImV4cCI6MjA4NTEzMTc1Mn0.pU41NU8tPvcf9Js8UTFppcS983-zyxGocLj2OVONNwo';

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function renderBuiltCard(project) {
  const inner = `
      <span class="home-built-tag">${escapeHtml(project.tag)}</span>
      <h3 class="home-built-name">${escapeHtml(project.name)}</h3>
      <p class="home-built-text">${escapeHtml(project.oneLiner)}</p>
      ${project.link ? '<span class="home-card-link">Visit ↗</span>' : ''}
  `;
  return project.link
    ? `<a class="home-built-card is-link" href="${escapeHtml(project.link)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
    : `<div class="home-built-card">${inner}</div>`;
}

function renderPostCard(post, index) {
  const category = (post.category || 'ai-strategy').replace(/-/g, ' ');
  // Many excerpts just repeat the title (sometimes minus a parenthetical); skip those
  const normalize = text => String(text ?? '').replace(/\([^)]*\)/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const excerpt = post.excerpt && normalize(post.excerpt) !== normalize(post.title) ? post.excerpt : '';
  return `
    <a class="home-card" href="/blog/#${encodeURIComponent(post.slug)}">
      <span class="home-card-num">${String(index + 1).padStart(2, '0')}</span>
      <span class="home-card-cat">${escapeHtml(category)}</span>
      <h3 class="home-card-title">${escapeHtml(post.title)}</h3>
      <p class="home-card-text">${escapeHtml(excerpt)}</p>
      <span class="home-card-link">Read the article →</span>
    </a>
  `;
}

async function loadLatestPosts() {
  const grid = document.querySelector('#learn-cards');
  if (!grid) return;

  try {
    const url = `${HOME_SUPABASE_URL}/rest/v1/blog_posts` +
      '?select=slug,title,excerpt,category,published_at' +
      '&status=eq.published&order=published_at.desc&limit=3';
    const res = await fetch(url, {
      headers: {
        apikey: HOME_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${HOME_SUPABASE_ANON_KEY}`
      }
    });
    if (!res.ok) return;

    const posts = await res.json();
    if (!Array.isArray(posts) || posts.length === 0) return;

    grid.innerHTML = posts.map(renderPostCard).join('');
  } catch (err) {
    // Keep the static fallback cards
    console.warn('Could not load latest posts:', err);
  }
}

// Carry LinkedIn (or any) UTM tags from this page's URL onto /diagnose and Calendly links
function passThroughUtms() {
  const params = new URLSearchParams(window.location.search);
  const utms = UTM_KEYS.filter(key => params.get(key));
  if (utms.length === 0) return;

  document.querySelectorAll('a[href^="/diagnose"], a[href*="calendly.com"]').forEach(link => {
    const url = new URL(link.href, window.location.origin);
    utms.forEach(key => url.searchParams.set(key, params.get(key)));
    link.href = link.getAttribute('href').startsWith('/') ? url.pathname + url.search + url.hash : url.toString();
  });
}

function trackClicks() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-track]');
    if (link && window.va) window.va('event', { name: link.dataset.track });
  });
}

// The testimonial stays hidden until its quote has text
function showTestimonial() {
  const quote = document.querySelector('#testimonial');
  if (quote && quote.querySelector('.home-quote-text')?.textContent.trim()) quote.hidden = false;
}

document.addEventListener('DOMContentLoaded', () => {
  const built = document.querySelector('#built-cards');
  if (built) built.innerHTML = BUILT_PROJECTS.map(renderBuiltCard).join('');

  passThroughUtms();
  trackClicks();
  showTestimonial();
  loadLatestPosts();
});

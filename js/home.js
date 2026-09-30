/* ==========================================================================
   Homepage - load the latest blog posts into "Learn with Marcos"
   Falls back to the static cards in index.html if the fetch fails.
   ========================================================================== */

// Same public anon key the blog uses (RLS-protected, read-only on published posts)
const HOME_SUPABASE_URL = 'https://eccodohheekwbywifipl.supabase.co';
const HOME_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjY29kb2hoZWVrd2J5d2lmaXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NTU3NTIsImV4cCI6MjA4NTEzMTc1Mn0.pU41NU8tPvcf9Js8UTFppcS983-zyxGocLj2OVONNwo';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
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

document.addEventListener('DOMContentLoaded', async () => {
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
});

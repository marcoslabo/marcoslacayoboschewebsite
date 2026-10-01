/* ==========================================================================
   Newsletter sign-up forms
   Any <form class="mb-subscribe" data-source="..."> on the page posts to
   /api/subscribe, including forms rendered later (the blog draws its content
   with JS). Optional data-download-url reveals a download link on success.
   ========================================================================== */

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form.mb-subscribe');
  if (!form) return;
  e.preventDefault();

  const button = form.querySelector('button[type="submit"]');
  const error = form.querySelector('.mb-subscribe-error');
  const success = form.parentElement.querySelector('.mb-subscribe-success');
  const originalText = button.textContent;

  const data = Object.fromEntries(new FormData(form).entries());
  data.source = form.dataset.source || 'website';

  button.disabled = true;
  button.textContent = 'Sending…';
  if (error) error.hidden = true;

  try {
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Something went wrong. Please try again.');

    form.hidden = true;
    if (success) {
      const link = success.querySelector('.mb-subscribe-download');
      if (link && form.dataset.downloadUrl) {
        link.href = form.dataset.downloadUrl;
        link.hidden = false;
      }
      success.hidden = false;
    }
  } catch (err) {
    if (error) {
      error.textContent = err.message;
      error.hidden = false;
    }
    button.disabled = false;
    button.textContent = originalText;
  }
});

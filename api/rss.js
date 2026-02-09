export default async function handler(req, res) {
    const supabaseUrl = 'https://eccodohheekwbywifipl.supabase.co';
    const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjY29kb2hoZWVrd2J5d2lmaXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NTU3NTIsImV4cCI6MjA4NTEzMTc1Mn0.pU41NU8tPvcf9Js8UTFppcS983-zyxGocLj2OVONNwo';

    try {
        // Fetch published posts from Supabase
        const response = await fetch(
            `${supabaseUrl}/rest/v1/blog_posts?status=eq.published&order=published_at.desc&limit=20`,
            {
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`
                }
            }
        );

        const posts = await response.json();
        const siteUrl = 'https://marcoslacayobosche.com';

        // Build RSS XML
        const rssItems = (posts || []).map(post => {
            const pubDate = new Date(post.published_at).toUTCString();
            const link = `${siteUrl}/blog/#${post.slug}`;

            return `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <description><![CDATA[${post.excerpt || post.title}]]></description>
      <content:encoded><![CDATA[${post.content}]]></content:encoded>
      <pubDate>${pubDate}</pubDate>
      <author>marcos.bosche@nymbl.app (Marcos Bosche)</author>
      <category>${(post.category || 'ai-strategy').replace(/-/g, ' ')}</category>
    </item>`;
        }).join('');

        const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Marcos Bosche | AI Transformation Insights</title>
    <link>${siteUrl}/blog/</link>
    <description>Actionable insights on AI transformation for Healthcare and Private Equity.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${siteUrl}/api/rss" rel="self" type="application/rss+xml"/>
    ${rssItems}
  </channel>
</rss>`;

        res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.status(200).send(rss);
    } catch (error) {
        console.error('RSS feed error:', error);
        return res.status(500).json({ error: 'Failed to generate RSS feed' });
    }
}

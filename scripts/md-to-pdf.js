const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const markdown = fs.readFileSync(path.join(__dirname, '..', 'docs', 'S4_LIVE_TENANT_BRIDGE.md'), 'utf-8');

// Simple markdown to HTML conversion
function md2html(md) {
  let html = md;
  
  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre style="background:#1e1e2e;color:#cdd6f4;padding:16px;border-radius:8px;overflow-x:auto;font-size:13px;line-height:1.5"><code>${code.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code></pre>`;
  });
  
  // Tables
  html = html.replace(/\n(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/g, (match, header, sep, body) => {
    const headers = header.split('|').filter(c => c.trim()).map(c => `<th style="padding:10px 14px;text-align:left;border-bottom:2px solid #3b82f6;font-weight:600">${c.trim()}</th>`).join('');
    const rows = body.trim().split('\n').map(row => {
      const cells = row.split('|').filter(c => c.trim()).map(c => `<td style="padding:8px 14px;border-bottom:1px solid #e2e8f0">${c.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
  });

  // Headers
  html = html.replace(/^#### (.+)$/gm, '<h4 style="color:#1e40af;margin-top:20px;font-size:15px">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 style="color:#1e40af;margin-top:28px;font-size:17px;border-bottom:1px solid #e2e8f0;padding-bottom:6px">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 style="color:#1e3a8a;margin-top:36px;font-size:22px;border-bottom:2px solid #3b82f6;padding-bottom:8px">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 style="color:#0f172a;font-size:28px;margin-bottom:4px">$1</h1>');
  
  // Blockquotes / alerts
  html = html.replace(/^> ⚠️ (.+)$/gm, '<div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;margin:12px 0;border-radius:4px;font-size:14px">⚠️ $1</div>');
  html = html.replace(/^> (.+)$/gm, '<blockquote style="background:#f0f9ff;border-left:4px solid #3b82f6;padding:12px 16px;margin:12px 0;border-radius:4px;font-size:14px;color:#334155">$1</blockquote>');
  
  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0">');
  
  // Bold + Inline code
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:13px;color:#be185d">$1</code>');
  
  // Lists
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li style="margin:4px 0;font-size:14px">$2</li>');
  html = html.replace(/^- (.+)$/gm, '<li style="margin:4px 0;font-size:14px">$1</li>');
  
  // Emojis in text stay as-is
  
  // Paragraphs - wrap standalone lines
  html = html.replace(/^(?!<[hbltdup]|<\/)(.+)$/gm, (match, p1) => {
    if (p1.trim() === '') return '';
    if (p1.startsWith('<')) return p1;
    return `<p style="font-size:14px;line-height:1.7;color:#334155;margin:8px 0">${p1}</p>`;
  });
  
  return html;
}

const htmlContent = md2html(markdown);

const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 50px;
      color: #1e293b;
      line-height: 1.6;
    }
    h1 { margin-top: 0; }
  </style>
</head>
<body>
${htmlContent}
<div style="margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center">
  Clean-Core.io — S/4HANA Live Tenant Bridge Documentation — v1.6.0 — Generated ${new Date().toISOString().split('T')[0]}
</div>
</body>
</html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(fullHtml, { waitUntil: 'networkidle' });
  
  const pdfPath = path.join(__dirname, '..', 'docs', 'S4_LIVE_TENANT_BRIDGE.pdf');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    margin: { top: '30px', bottom: '30px', left: '20px', right: '20px' },
    printBackground: true
  });
  
  // Copy to Desktop
  const desktopPath = path.join('C:', 'Users', 'felix', 'OneDrive', 'Desktop', 'S4_LIVE_TENANT_BRIDGE.pdf');
  fs.copyFileSync(pdfPath, desktopPath);
  
  console.log('PDF created:', pdfPath);
  console.log('Desktop copy:', desktopPath);
  console.log('Size:', Math.round(fs.statSync(pdfPath).size / 1024), 'KB');
  
  await browser.close();
})();

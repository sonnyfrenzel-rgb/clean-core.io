const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

async function generateLinkedInWhitepaper() {
  console.log('Generating LinkedIn Clean-Core S/4HANA Modernization Whitepaper PDF...');
  const browser = await chromium.launch({ headless: true, args: ['--disable-web-security'] });
  const page = await browser.newPage();
  
  // Load template
  const templatePath = path.join(__dirname, '..', 'public', 'linkedin-whitepaper-template.html');
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found at: ${templatePath}`);
  }
  let html = fs.readFileSync(templatePath, 'utf8');
  
  // Replace current date dynamic placeholder if needed
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  html = html.replace('June 2026', dateStr);

  // The fonts are fetched here, by this local render, and not by the template:
  // the template is served publicly, and a visitor's browser would otherwise
  // call Google for them.
  html = html.replace('<style>', `<style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');`);
  
  // Write temporary file
  const tempPath = path.join(__dirname, '..', 'public', 'temp-linkedin-whitepaper.html');
  fs.writeFileSync(tempPath, html);
  
  // Navigate and print to PDF
  const fileUrl = `file://${tempPath.replace(/\\/g, '/')}`;
  await page.goto(fileUrl);
  
  // Wait for font loading
  await page.evaluateHandle(() => document.fonts.ready);
  
  const outputPath = path.join(__dirname, '..', 'public', 'Clean-Core_S4HANA_Modernization_Whitepaper.pdf');
  await page.pdf({
    path: outputPath,
    format: 'A4',
    margin: {
      top: '0mm',
      bottom: '0mm',
      left: '0mm',
      right: '0mm'
    },
    printBackground: true,
  });
  
  // Clean up
  fs.unlinkSync(tempPath);
  
  await browser.close();
  console.log(`Successfully generated Clean-Core_S4HANA_Modernization_Whitepaper.pdf at: ${outputPath}`);
}

generateLinkedInWhitepaper().catch(err => {
  console.error('Error generating LinkedIn whitepaper:', err);
  process.exit(1);
});

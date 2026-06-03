const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

async function generateWhitepaperPng() {
  console.log('Generating PNG images of the Clean-Core S/4HANA Modernization Whitepaper...');
  const browser = await chromium.launch({ headless: true, args: ['--disable-web-security'] });
  const page = await browser.newPage();
  
  // Set viewport to exact A4 size at 1.5x scale for high resolution (794 x 1123 * 1.5)
  await page.setViewportSize({ width: 1191, height: 1684 });

  // Load template
  const templatePath = path.join(__dirname, '..', 'public', 'linkedin-whitepaper-template.html');
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found at: ${templatePath}`);
  }
  let html = fs.readFileSync(templatePath, 'utf8');
  
  // Replace date
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  html = html.replace('June 2026', dateStr);
  
  // Write temporary file
  const tempPath = path.join(__dirname, '..', 'public', 'temp-linkedin-whitepaper-png.html');
  fs.writeFileSync(tempPath, html);
  
  // Navigate
  const fileUrl = `file://${tempPath.replace(/\\/g, '/')}`;
  await page.goto(fileUrl);
  
  // Wait for font loading
  await page.evaluateHandle(() => document.fonts.ready);
  
  // Find all page elements
  const pages = await page.$$('.page');
  console.log(`Found ${pages.length} pages in template.`);
  
  const desktopDir = 'C:\\Users\\felix\\OneDrive\\Desktop';
  
  for (let i = 0; i < pages.length; i++) {
    const pageNum = i + 1;
    const outputPath = path.join(desktopDir, `Clean-Core_Whitepaper_Page_${pageNum}.png`);
    await pages[i].screenshot({
      path: outputPath,
      type: 'png',
      omitBackground: false
    });
    console.log(`Successfully saved Page ${pageNum} as PNG to: ${outputPath}`);
  }
  
  // Clean up
  fs.unlinkSync(tempPath);
  
  await browser.close();
  console.log('All whitepaper pages generated successfully as PNG.');
}

generateWhitepaperPng().catch(err => {
  console.error('Error generating PNG whitepaper:', err);
  process.exit(1);
});

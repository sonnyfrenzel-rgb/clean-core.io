const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

async function generateWhitepaper() {
  console.log('Generating Enterprise Security & GDPR Compliance Whitepaper PDF...');
  const browser = await chromium.launch({ headless: true, args: ['--disable-web-security'] });
  const page = await browser.newPage();
  
  // Load template
  const templatePath = path.join(__dirname, '..', 'public', 'whitepaper-template.html');
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found at: ${templatePath}`);
  }
  const html = fs.readFileSync(templatePath, 'utf8');
  
  // Write temporary file
  const tempPath = path.join(__dirname, '..', 'public', 'temp-whitepaper.html');
  fs.writeFileSync(tempPath, html);
  
  // Navigate and print to PDF
  const fileUrl = `file://${tempPath.replace(/\\/g, '/')}`;
  await page.goto(fileUrl);
  
  const outputPath = path.join(__dirname, '..', 'public', 'Enterprise_Security_Compliance_Whitepaper.pdf');
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
  console.log(`Successfully generated Enterprise_Security_Compliance_Whitepaper.pdf at: ${outputPath}`);
}

generateWhitepaper().catch(err => {
  console.error('Error generating whitepaper:', err);
  process.exit(1);
});

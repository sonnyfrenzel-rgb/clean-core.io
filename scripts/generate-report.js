const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

async function generateReport() {
  console.log('Generating Quality Engineering PDF Report...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Load template
  const templatePath = path.join(__dirname, '..', 'public', 'report-template.html');
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found at: ${templatePath}`);
  }
  let html = fs.readFileSync(templatePath, 'utf8');
  
  // Replace placeholders
  const currentDate = new Date().toISOString().split('T')[0];
  html = html.replace('{{DATE}}', currentDate);
  
  // Write temporary file
  const tempPath = path.join(__dirname, '..', 'public', 'temp-report.html');
  fs.writeFileSync(tempPath, html);
  
  // Navigate and print to PDF
  const fileUrl = `file://${tempPath.replace(/\\/g, '/')}`;
  await page.goto(fileUrl);
  
  const outputPath = path.join(__dirname, '..', 'public', 'QE_Engineer_Report.pdf');
  await page.pdf({
    path: outputPath,
    format: 'A4',
    margin: {
      top: '20mm',
      bottom: '20mm',
      left: '20mm',
      right: '20mm'
    },
    printBackground: true,
  });
  
  // Clean up
  fs.unlinkSync(tempPath);
  
  await browser.close();
  console.log(`Successfully generated QE_Engineer_Report.pdf at: ${outputPath}`);
}

generateReport().catch(err => {
  console.error('Error generating report:', err);
  process.exit(1);
});

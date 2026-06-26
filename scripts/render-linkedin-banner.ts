import { chromium } from 'playwright';
import path from 'path';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1584, height: 396 },
    deviceScaleFactor: 2, // 2x for crisp retina quality
  });

  const htmlPath = path.join(__dirname, 'linkedin-banner.html');
  await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`);
  
  // Wait for font load
  await page.waitForTimeout(3000);
  
  const dest = path.join(__dirname, '..', 'public', 'linkedin-banner.png');
  await page.screenshot({ 
    path: dest, 
    fullPage: false,
    type: 'png'
  });
  
  console.log(`✅ LinkedIn banner saved to ${dest}`);
  console.log(`   Size: 1584×396 @2x = 3168×792 actual pixels`);
  
  await browser.close();
})();

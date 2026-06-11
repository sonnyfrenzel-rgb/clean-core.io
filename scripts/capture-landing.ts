import { chromium } from 'playwright';
import * as path from 'path';

const OUT = path.join(process.cwd(), 'public', 'screenshots');

async function run() {
  console.log('\n📸 Capturing Landing Page from clean-core.io\n');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Landing page - public, no auth needed
  await page.goto('https://clean-core.io', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Take full-page screenshot for reference
  await page.screenshot({ path: path.join(OUT, 'landing-full.jpg'), type: 'jpeg', quality: 92, fullPage: true });
  console.log('✅ landing-full.jpg saved');

  await browser.close();
  console.log('\n✅ Done\n');
}

run().catch(e => { console.error('❌ Failed:', e); process.exit(1); });

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

async function generateWhitepaperGrid() {
  console.log('Merging whitepaper pages into a single 2x3 grid PNG...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const pageWidth = 1191;
  const pageHeight = 1684;
  const gridWidth = pageWidth * 2;
  const gridHeight = pageHeight * 3;
  
  // Set viewport large enough for the full grid
  await page.setViewportSize({ width: gridWidth, height: gridHeight });
  
  const desktopDir = 'C:\\Users\\felix\\OneDrive\\Desktop';
  
  // Read all page images as base64
  const imagesBase64 = [];
  for (let i = 1; i <= 6; i++) {
    const imgPath = path.join(desktopDir, `Clean-Core_Whitepaper_Page_${i}.png`);
    if (!fs.existsSync(imgPath)) {
      throw new Error(`Page image not found: ${imgPath}. Please run generate-whitepaper-png.js first.`);
    }
    const data = fs.readFileSync(imgPath).toString('base64');
    imagesBase64.push(`data:image/png;base64,${data}`);
  }
  
  // Create HTML with canvas to draw and merge the images
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body, html { margin: 0; padding: 0; overflow: hidden; background: #f8fafc; }
        canvas { display: block; }
      </style>
    </head>
    <body>
      <canvas id="gridCanvas" width="${gridWidth}" height="${gridHeight}"></canvas>
      <script>
        window.mergeDone = false;
        const canvas = document.getElementById('gridCanvas');
        const ctx = canvas.getContext('2d');
        
        const imagesData = ${JSON.stringify(imagesBase64)};
        const pageWidth = ${pageWidth};
        const pageHeight = ${pageHeight};
        
        let loadedCount = 0;
        const positions = [
          { x: 0, y: 0 },
          { x: pageWidth, y: 0 },
          { x: 0, y: pageHeight },
          { x: pageWidth, y: pageHeight },
          { x: 0, y: pageHeight * 2 },
          { x: pageWidth, y: pageHeight * 2 }
        ];
        
        positions.forEach((pos, idx) => {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, pos.x, pos.y, pageWidth, pageHeight);
            
            // Draw a subtle border separating the pages
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 4;
            ctx.strokeRect(pos.x, pos.y, pageWidth, pageHeight);
            
            loadedCount++;
            if (loadedCount === 6) {
              window.mergeDone = true;
            }
          };
          img.src = imagesData[idx];
        });
      </script>
    </body>
    </html>
  `;
  
  // Write temporary HTML file
  const tempPath = path.join(__dirname, '..', 'public', 'temp-grid.html');
  fs.writeFileSync(tempPath, htmlContent);
  
  const fileUrl = `file://${tempPath.replace(/\\/g, '/')}`;
  await page.goto(fileUrl);
  
  // Wait until all images are loaded and drawn on canvas
  await page.waitForFunction(() => window.mergeDone === true, { timeout: 30000 });
  
  // Take screenshot of the full page canvas
  const outputPath = path.join(desktopDir, 'Clean-Core_Whitepaper_FullGrid.png');
  await page.screenshot({
    path: outputPath,
    fullPage: true
  });
  
  // Clean up
  fs.unlinkSync(tempPath);
  
  await browser.close();
  console.log(`Successfully generated combined 2x3 grid image at: ${outputPath}`);
}

generateWhitepaperGrid().catch(err => {
  console.error('Error generating grid image:', err);
  process.exit(1);
});

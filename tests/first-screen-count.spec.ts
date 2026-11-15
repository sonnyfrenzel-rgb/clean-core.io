import { test, expect } from './helpers/test';
import { countFirstScreen } from './helpers/first-screen-count';

/**
 * The first-screen counter (`tests/helpers/first-screen-count.ts`) counts only what a reader can see: a control
 * faded out by an ancestor, one wholly beside the viewport and one below it are not on the first screen.
 * Server-free: the page is written in place, no app is opened.
 */
test('a control under an opacity-0 ancestor, or wholly outside the viewport on either axis, is not counted', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.setContent(`
    <main>
      <button class="primary" data-cc-button="primary">Seen</button>
      <a href="#x">Seen link</a>
      <div style="opacity:0"><button data-cc-button="primary">Faded by its parent</button><span>gone words here</span></div>
      <div style="opacity:0.5"><button>Half faded</button></div>
      <button style="position:absolute; left:900px; top:10px">Beside the viewport</button>
      <button style="position:absolute; left:-300px; top:10px; width:100px">Left of the viewport</button>
      <button style="position:absolute; left:10px; top:900px">Below the viewport</button>
      <div style="visibility:hidden"><button>Hidden by its parent</button></div>
      <p style="position:absolute; left:1000px; top:40px">words off to the side</p>
    </main>
  `);
  const count = await countFirstScreen(page, { root: 'main', shell: '', primary: '[data-cc-button="primary"]' });
  expect(count.actions, JSON.stringify(count)).toBe(3);
  expect(count.primary).toBe(1);
  // "Seen", "Seen link", "Half faded".
  expect(count.words).toBe(5);
});

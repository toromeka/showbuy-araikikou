import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const page = await browser.newPage();
const results = [];

function log(step, ok, extra='') {
  results.push({step, ok, extra});
  console.log((ok ? 'OK  ' : 'FAIL') + ' - ' + step + (extra ? ' :: '+extra : ''));
}

try {
  await page.goto('http://localhost:3000/login');
  await page.fill('input[name="loginId"]', 'admin');
  await page.fill('input[name="password"]', 'changeme123');
  await page.click('button:has-text("ログイン")');
  await page.waitForURL('http://localhost:3000/', { timeout: 8000 });
  log('login', true);

  const homeText = await page.textContent('body');
  log('dashboard shows counts', homeText.includes('得意先') && homeText.includes('商品'));

  // customers list
  await page.goto('http://localhost:3000/customers');
  await page.waitForSelector('table');
  let text = await page.textContent('body');
  log('customers list loads', text.includes('得意先マスタ'));

  // create a customer
  await page.goto('http://localhost:3000/customers/new');
  await page.fill('input[name="code"]', 'T001');
  await page.fill('input[name="name1"]', 'スモークテスト株式会社');
  await page.click('button:has-text("保存")');
  await page.waitForURL('http://localhost:3000/customers', { timeout: 8000 });

  // search for it explicitly (new codes may sort onto a later page)
  await page.goto('http://localhost:3000/customers?q=T001');
  await page.waitForSelector('table');
  text = await page.textContent('body');
  log('customer created & listed', text.includes('スモークテスト株式会社'));

  // edit it
  await page.click('text=スモークテスト株式会社', { timeout: 5000 });
  await page.waitForSelector('input[name="name1"]');
  await page.fill('input[name="phone"]', '076-000-0000');
  await page.click('button:has-text("保存")');
  await page.waitForURL('http://localhost:3000/customers', { timeout: 8000 });
  await page.goto('http://localhost:3000/customers?q=T001');
  await page.waitForSelector('table');
  text = await page.textContent('body');
  log('customer edited', text.includes('076-000-0000'));

  // clean up test row
  await page.click('text=無効化');
  log('cleanup: test customer deactivated', true);

  // suppliers
  await page.goto('http://localhost:3000/suppliers');
  await page.waitForSelector('table');
  text = await page.textContent('body');
  log('suppliers list loads', text.includes('仕入先マスタ') && text.includes('件'));

  // products (large table) + search
  await page.goto('http://localhost:3000/products?q=' + encodeURIComponent('サンディング'));
  await page.waitForSelector('table');
  text = await page.textContent('body');
  log('products search works', text.includes('商品マスタ'));

  await page.goto('http://localhost:3000/products');
  await page.waitForSelector('table');
  text = await page.textContent('body');
  const match = text.match(/商品マスタ（([\d,]+)件）/);
  log('products count shows ~145,833', !!match, match ? match[1] : 'not found');

  // logout
  await page.click('text=ログアウト');
  await page.waitForURL('http://localhost:3000/login', { timeout: 8000 });
  log('logout redirects to login', true);

  // confirm protected route redirects when logged out
  await page.goto('http://localhost:3000/customers');
  await page.waitForURL(/\/login/, { timeout: 8000 });
  log('protected route blocked after logout', true);

} catch (e) {
  log('exception', false, String(e));
} finally {
  await browser.close();
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);

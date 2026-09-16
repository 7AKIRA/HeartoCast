const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  await page.emulateTimezone('Asia/Seoul');
  await page.setViewport({ width: 900, height: 1150, deviceScaleFactor: 2 });

  await page.goto('https://hearto.ixtj.dev/', {
    waitUntil: 'networkidle0',
    timeout: 60000,
  });
  await new Promise((r) => setTimeout(r, 4000));

  const shot = await page.screenshot({ type: 'png' });
  await browser.close();

  const form = new FormData();
  form.append('content', '두타예보');
  form.append(
    'files[0]',
    new Blob([shot], { type: 'image/png' }),
    'hearto.png'
  );

  const res = await fetch(process.env.DISCORD_WEBHOOK, {
    method: 'POST',
    body: form,
  });
  console.log('디스코드 응답:', res.status);
})();

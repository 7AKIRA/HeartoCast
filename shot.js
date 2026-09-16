const puppeteer = require('puppeteer');

const SITE = 'https://heartopia.th.gl/ko/forecast';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  await page.emulateTimezone('Asia/Seoul');
  await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });

  await page.goto(SITE, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 5000));

  // 배경을 흰색으로, 글자를 검은색으로
  await page.addStyleTag({
    content: `
      html, body, * {
        background-color: #ffffff !important;
        color: #111111 !important;
        border-color: #dddddd !important;
      }
    `,
  });
  await new Promise((r) => setTimeout(r, 500));

  // 시간별 예보 영역만 찾기
  const findBlock = async () =>
    await page.evaluateHandle(() => {
      const heads = [...document.querySelectorAll('*')].filter(
        (el) =>
          el.children.length === 0 &&
          /HOURLY FORECAST|시간별/i.test(el.textContent || '')
      );
      if (!heads.length) return null;
      let node = heads[0];
      for (let i = 0; i < 4 && node.parentElement; i++) node = node.parentElement;
      return node;
    });

  const shots = [];

  for (let day = 0; day < 2; day++) {
    if (day > 0) {
      // 오른쪽 화살표 클릭
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const next = btns.find((b) => (b.textContent || '').includes('→'));
        if (next) next.click();
      });
      await new Promise((r) => setTimeout(r, 3000));
    }

    const block = await findBlock();
    const el = block.asElement();
    shots.push(el ? await el.screenshot({ type: 'png' }) : await page.screenshot({ type: 'png' }));
  }

  await browser.close();

  const now = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const form = new FormData();
  form.append('content', `두타예보 · ${now} 기준\n출처: ${SITE}`);
  shots.forEach((s, i) => {
    form.append(`files[${i}]`, new Blob([s], { type: 'image/png' }), `day${i}.png`);
  });

  const res = await fetch(process.env.DISCORD_WEBHOOK, { method: 'POST', body: form });
  console.log('디스코드 응답:', res.status);
})();

const puppeteer = require('puppeteer');

const SITE = 'https://heartopia.th.gl/ko/forecast';

const grab = async (page) =>
  await page.evaluate(() => {
    const label = [...document.querySelectorAll('*')].find(
      (el) =>
        el.children.length === 0 &&
        /HOURLY FORECAST/i.test(el.textContent || '')
    );
    if (!label) return null;

    // 라벨에서 위로 올라가며 '4개 구간'을 모두 담은 가장 작은 상자를 찾는다
    let node = label.parentElement;
    for (let i = 0; i < 6 && node; i++) {
      const t = node.textContent || '';
      if (/00–06|00-06/.test(t) && /18–24|18-24/.test(t)) break;
      node = node.parentElement;
    }
    if (!node) return null;

    const r = node.getBoundingClientRect();
    return {
      x: r.x + window.scrollX,
      y: r.y + window.scrollY,
      width: r.width,
      height: r.height,
    };
  });

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  await page.emulateTimezone('Asia/Seoul');
  await page.setViewport({ width: 1500, height: 1200, deviceScaleFactor: 2 });

  await page.goto(SITE, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 6000));

  const shots = [];

  for (let day = 0; day < 2; day++) {
    if (day > 0) {
      // 날짜 헤더 오른쪽의 '다음' 버튼 클릭
      const moved = await page.evaluate(() => {
        const label = [...document.querySelectorAll('*')].find(
          (el) =>
            el.children.length === 0 &&
            /HOURLY FORECAST/i.test(el.textContent || '')
        );
        if (!label) return false;
        let box = label.parentElement;
        for (let i = 0; i < 6 && box; i++) {
          if (box.querySelectorAll('button').length >= 2) break;
          box = box.parentElement;
        }
        if (!box) return false;
        const btns = [...box.querySelectorAll('button')];
        if (btns.length < 2) return false;
        // 가장 오른쪽에 있는 버튼
        btns.sort(
          (a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x
        );
        btns[btns.length - 1].click();
        return true;
      });
      console.log('다음날 이동:', moved);
      await new Promise((r) => setTimeout(r, 3000));
    }

    const box = await grab(page);
    console.log(`day${day} 영역:`, box);

    if (box && box.width > 100 && box.height > 100) {
      shots.push(
        await page.screenshot({
          type: 'png',
          clip: {
            x: box.x - 8,
            y: box.y - 8,
            width: box.width + 16,
            height: box.height + 16,
          },
        })
      );
    } else {
      shots.push(await page.screenshot({ type: 'png' }));
    }
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
  form.append('content', `두타예보 · ${now} 기준\n출처: <${SITE}>`);
  shots.forEach((s, i) => {
    form.append(`files[${i}]`, new Blob([s], { type: 'image/png' }), `day${i}.png`);
  });

  const res = await fetch(process.env.DISCORD_WEBHOOK, { method: 'POST', body: form });
  console.log('디스코드 응답:', res.status);
})();

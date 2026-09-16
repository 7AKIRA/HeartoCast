const puppeteer = require('puppeteer');

const SITE = 'https://heartopia.th.gl/ko/forecast';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  await page.emulateTimezone('Asia/Seoul');
  await page.setViewport({ width: 1500, height: 2200, deviceScaleFactor: 2 });

  await page.goto(SITE, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 6000));

  const info = await page.evaluate(() => {
    const out = {};

    // 1) 구간 라벨(00–06 등)을 가진 말단 요소들 찾기
    const labels = [...document.querySelectorAll('*')].filter(
      (el) =>
        el.children.length === 0 &&
        /^\s*(00|06|12|18)[–-](06|12|18|24)\s*$/.test(el.textContent || '')
    );
    out.labelCount = labels.length;
    out.labelTexts = labels.map((el) => (el.textContent || '').trim());

    // 2) 각 라벨에서 위로 올라가며, 그 구간의 6개 시각을 모두 담은 상자 찾기
    out.columns = labels.map((label) => {
      const txt = (label.textContent || '').trim();
      const startH = parseInt(txt.slice(0, 2), 10);
      const hours = [];
      for (let i = 0; i < 6; i++) {
        hours.push(String(startH + i).padStart(2, '0') + ':00');
      }

      let node = label.parentElement;
      let steps = 0;
      for (let i = 0; i < 8 && node; i++) {
        const t = node.textContent || '';
        if (hours.every((h) => t.includes(h))) {
          steps = i + 1;
          break;
        }
        node = node.parentElement;
      }
      if (!node) return { label: txt, found: false };

      const r = node.getBoundingClientRect();
      return {
        label: txt,
        found: true,
        steps,
        tag: node.tagName,
        cls: (node.className || '').toString().slice(0, 80),
        x: Math.round(r.x),
        y: Math.round(r.y + window.scrollY),
        w: Math.round(r.width),
        h: Math.round(r.height),
        // 이 상자가 다른 구간 시각도 포함하는지 (너무 크게 잡혔는지 확인)
        leaked: ['00:00', '06:00', '12:00', '18:00'].filter(
          (h) => t0(node, h) && !hours.includes(h)
        ),
      };

      function t0(n, h) {
        return (n.textContent || '').includes(h);
      }
    });

    // 3) 날짜 헤더 텍스트
    const dateEl = [...document.querySelectorAll('*')].find(
      (el) => el.children.length === 0 && /\d+월\s*\d+일/.test(el.textContent || '')
    );
    out.dateText = dateEl ? (dateEl.textContent || '').trim() : null;

    return out;
  });

  console.log('=== 진단 결과 ===');
  console.log(JSON.stringify(info, null, 2));

  await browser.close();
})();

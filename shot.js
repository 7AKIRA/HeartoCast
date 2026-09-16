const puppeteer = require('puppeteer');
const sharp = require('sharp');

const SITE = 'https://heartopia.th.gl/ko/forecast';

// 현재 시각(KST) → 구간 인덱스 0~3
const kstHour = () =>
  Number(
    new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Seoul',
      hour: '2-digit',
      hour12: false,
    })
  );

const SLOTS = ['00–06', '06–12', '12–18', '18–24'];

// 특정 구간 열의 좌표를 구한다
const findCol = async (page, slotLabel) =>
  await page.evaluate((want) => {
    const label = [...document.querySelectorAll('*')].find(
      (el) =>
        el.children.length === 0 &&
        (el.textContent || '').trim().replace(/-/g, '–') === want
    );
    if (!label) return null;

    const startH = parseInt(want.slice(0, 2), 10);
    const hours = [];
    for (let i = 0; i < 6; i++) {
      hours.push(String(startH + i).padStart(2, '0') + ':00');
    }

    let node = label.parentElement;
    for (let i = 0; i < 8 && node; i++) {
      const t = node.textContent || '';
      if (hours.every((h) => t.includes(h))) break;
      node = node.parentElement;
    }
    if (!node) return null;

    // 라벨까지 포함하도록 위쪽을 조금 넓힌다
    const r = node.getBoundingClientRect();
    const lr = label.getBoundingClientRect();
    const top = Math.min(r.y, lr.y);
    return {
      x: r.x + window.scrollX,
      y: top + window.scrollY,
      width: r.width,
      height: r.bottom - top,
    };
  }, slotLabel);

// 날짜 헤더 읽기
const readDate = async (page) =>
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(
      (e) => e.children.length === 0 && /\d+월\s*\d+일/.test(e.textContent || '')
    );
    if (!el) return null;
    const m = (el.textContent || '').match(/(\d+)월\s*(\d+)일/);
    return m ? `${m[1]}/${m[2]}` : null;
  });

// 다음날로 이동
const goNextDay = async (page) => {
  const ok = await page.evaluate(() => {
    const label = [...document.querySelectorAll('*')].find(
      (el) =>
        el.children.length === 0 && /HOURLY FORECAST/i.test(el.textContent || '')
    );
    if (!label) return false;
    let box = label.parentElement;
    for (let i = 0; i < 8 && box; i++) {
      if (box.querySelectorAll('button').length >= 2) break;
      box = box.parentElement;
    }
    if (!box) return false;
    const btns = [...box.querySelectorAll('button')];
    if (btns.length < 2) return false;
    btns.sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x);
    btns[btns.length - 1].click();
    return true;
  });
  await new Promise((r) => setTimeout(r, 3000));
  return ok;
};

const shoot = async (page, slotLabel) => {
  const box = await findCol(page, slotLabel);
  console.log(`${slotLabel} 영역:`, box);
  if (!box || box.width < 50 || box.height < 50) return null;
  const pad = 10;
  return await page.screenshot({
    type: 'png',
    clip: {
      x: box.x - pad,
      y: box.y - pad,
      width: box.width + pad * 2,
      height: box.height + pad * 2,
    },
  });
};

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  await page.emulateTimezone('Asia/Seoul');
  await page.setViewport({ width: 1500, height: 2200, deviceScaleFactor: 2 });

  await page.goto(SITE, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 6000));

  const idx = Math.floor(kstHour() / 6); // 0~3
  const nowSlot = SLOTS[idx];
  const nextSlot = SLOTS[(idx + 1) % 4];
  const crossDay = idx === 3; // 18–24면 다음 구간은 내일 00–06

  console.log(`현재 구간: ${nowSlot} / 다음 구간: ${nextSlot} / 날짜넘김: ${crossDay}`);

  const dateNow = await readDate(page);
  const shotNow = await shoot(page, nowSlot);

  if (crossDay) {
    const moved = await goNextDay(page);
    console.log('다음날 이동:', moved);
  }

  const dateNext = await readDate(page);
  const shotNext = await shoot(page, nextSlot);

  await browser.close();

  const shots = [shotNow, shotNext].filter(Boolean);

  // 두 장을 가로로 나란히 합치기
  let merged;
  if (shots.length === 2) {
    const metas = await Promise.all(shots.map((s) => sharp(s).metadata()));
    const gap = 24;
    const height = Math.max(metas[0].height, metas[1].height);
    const width = metas[0].width + gap + metas[1].width;

    merged = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 10, g: 10, b: 10, alpha: 1 },
      },
    })
      .composite([
        { input: shots[0], left: 0, top: 0 },
        { input: shots[1], left: metas[0].width + gap, top: 0 },
      ])
      .png()
      .toBuffer();
  } else {
    merged = shots[0];
  }

  const line = `${dateNow} ${nowSlot} 현재 날씨 > ${dateNext} ${nextSlot} 다음 날씨`;

  const form = new FormData();
  form.append(
    'content',
    `${line}\n출처: <${SITE}> · <https://hearto.ixtj.dev/>`
  );
  form.append('files[0]', new Blob([merged], { type: 'image/png' }), 'forecast.png');

  const res = await fetch(process.env.DISCORD_WEBHOOK, { method: 'POST', body: form });
  console.log('디스코드 응답:', res.status);
})();

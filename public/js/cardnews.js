// 카드뉴스 렌더러 — 1080×1080 Canvas, 최대 8장, PNG 다운로드
// 브라우저에서만 동작하며, 슬라이드 텍스트 구성은 generator.js가 담당합니다.

const FONT_STACK =
  '"Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif';

export const CARD_SIZE = 1080;

export function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const rawLine of String(text).split('\n')) {
    if (!rawLine) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const ch of rawLine) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexToRgba(hex, alpha) {
  const h = String(hex || '#6366f1').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const num = parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 한 장의 카드뉴스를 그립니다.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} slide {kicker, headline, body, emphasis, small}
 * @param {object} options {index, total, accent, theme, brand, subtitle}
 */
export function drawSlide(ctx, slide, options = {}) {
  const { index = 0, total = 1, accent = '#6366f1', theme = 'dark', brand = 'SNS 오토파일럿' } = options;
  const S = CARD_SIZE;
  const dark = theme !== 'light';
  const ink = dark ? '#f8fafc' : '#0f172a';
  const sub = dark ? 'rgba(248,250,252,0.66)' : 'rgba(15,23,42,0.62)';

  ctx.clearRect(0, 0, S, S);

  // 배경
  const bg = ctx.createLinearGradient(0, 0, S, S);
  if (dark) {
    bg.addColorStop(0, '#0b1020');
    bg.addColorStop(0.55, hexToRgba(accent, 0.18));
    bg.addColorStop(1, '#0b1020');
  } else {
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(1, hexToRgba(accent, 0.12));
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);

  // 장식 원
  ctx.save();
  ctx.globalAlpha = dark ? 0.22 : 0.16;
  const glow = ctx.createRadialGradient(S * 0.85, S * 0.12, 40, S * 0.85, S * 0.12, S * 0.6);
  glow.addColorStop(0, accent);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, S, S);
  ctx.restore();

  const pad = 84;

  // 상단: 목표 배지 + 페이지
  ctx.save();
  ctx.font = `600 30px ${FONT_STACK}`;
  const kicker = String(slide.kicker || 'SNS');
  const kw = ctx.measureText(kicker).width;
  ctx.fillStyle = hexToRgba(accent, dark ? 0.22 : 0.16);
  roundRect(ctx, pad, pad, kw + 52, 62, 31);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.textBaseline = 'middle';
  ctx.fillText(kicker, pad + 26, pad + 33);

  ctx.textAlign = 'right';
  ctx.font = `600 28px ${FONT_STACK}`;
  ctx.fillStyle = sub;
  ctx.fillText(`${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, S - pad, pad + 32);
  ctx.restore();

  // 본문 (세로 중앙 정렬)
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const headlineSize = slide.small ? 44 : slide.emphasis ? 86 : 68;
  ctx.font = `800 ${headlineSize}px ${FONT_STACK}`;
  const headlineLines = wrapText(ctx, slide.headline || '', S - pad * 2).slice(0, 4);
  ctx.font = `500 ${slide.small ? 34 : 40}px ${FONT_STACK}`;
  const bodyLines = wrapText(ctx, slide.body || '', S - pad * 2).slice(0, slide.small ? 6 : 5);

  const headLineH = headlineSize * 1.24;
  const bodyLineH = (slide.small ? 34 : 40) * 1.6;
  const totalH = headlineLines.length * headLineH + (bodyLines.length ? 44 + bodyLines.length * bodyLineH : 0);
  let y = Math.max(pad + 150, (S - totalH) / 2 + headlineSize * 0.5);

  ctx.fillStyle = ink;
  ctx.font = `800 ${headlineSize}px ${FONT_STACK}`;
  for (const line of headlineLines) {
    ctx.fillText(line, pad, y);
    y += headLineH;
  }
  if (bodyLines.length) {
    y += 16;
    ctx.fillStyle = sub;
    ctx.font = `500 ${slide.small ? 34 : 40}px ${FONT_STACK}`;
    for (const line of bodyLines) {
      ctx.fillText(line, pad, y);
      y += bodyLineH;
    }
  }

  // 하단 브랜드 + 진행 바
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 28px ${FONT_STACK}`;
  ctx.fillStyle = sub;
  ctx.fillText(String(brand).slice(0, 28), pad, S - pad + 6);
  ctx.textAlign = 'right';
  ctx.fillText('sns-autopilot', S - pad, S - pad + 6);

  const barY = S - pad + 34;
  const barW = S - pad * 2;
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.1)';
  roundRect(ctx, pad, barY, barW, 6, 3);
  ctx.fill();
  ctx.fillStyle = accent;
  roundRect(ctx, pad, barY, Math.max(12, (barW * (index + 1)) / total), 6, 3);
  ctx.fill();
  ctx.restore();
}

/** 오프스크린 캔버스에 슬라이드를 렌더링해 반환 */
export function renderSlideCanvas(slide, options) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_SIZE;
  canvas.height = CARD_SIZE;
  const ctx = canvas.getContext('2d');
  drawSlide(ctx, slide, options);
  return canvas;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

export function downloadCanvas(canvas, filename) {
  return canvasToBlob(canvas).then((blob) => {
    if (!blob) return false;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    return true;
  });
}

/** 카드뉴스 전체를 순서대로 PNG 저장 (브라우저 다운로드) */
export async function downloadAll(cardnews, options) {
  const total = cardnews.slides.length;
  for (let i = 0; i < total; i += 1) {
    const canvas = renderSlideCanvas(cardnews.slides[i], { ...options, index: i, total });
    await downloadCanvas(canvas, `cardnews-${String(i + 1).padStart(2, '0')}.png`);
    await new Promise((r) => setTimeout(r, 350)); // 연속 다운로드 차단 방지
  }
  return total;
}

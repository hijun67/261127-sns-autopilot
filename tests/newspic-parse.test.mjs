// 뉴스픽 홈 HTML 파서 회귀 테스트 (A2)
// 2026-11-28: m.newspic.kr 마크업이 개편되며 앵커가 이미지만 감싸고 제목 <h1>이 형제 요소로
// 빠지는 구조가 섞였습니다. 제목·링크를 리스트 항목 단위로 짝지어 읽는지 고정합니다.
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseNewspicHtml } from '../functions/api/sources/_lib.js';

/* 제목이 앵커 밖(형제 요소)에 있는 개편 마크업 */
const SIBLING_TITLE_HTML = `
<header><nav><ul>
  <li class="swiper-slide menu1"><a href="/main?category=hot"><span>Pick</span></a></li>
</ul></nav></header>
<section class="textList mixList" style="clear: left;">
  <hgroup><a href="/main?category=hot"><button title="더보기">+</button><h1><span>Pick 뉴스</span></h1></a></hgroup>
  <ul>
    <li>
      <a href="/view.html?nid=202611280001&amp;pn=214">
        <div><img class="lazy" src="data:image/gif;base64,R0lGOD" data-original="https://rimages-cdn.newspic.kr/thumb1/one.jpg?w=240&amp;h=120"></div>
      </a>
      <h1>앵커 밖에 있는 첫 번째 기사 제목</h1>
      <h2>연합뉴스 11.28</h2>
    </li>
    <li>
      <a href="/view.html?nid=202611280002&amp;pn=82"><img class="lazy" src="https://images-cdn.newspic.kr/thumb1/two.jpg" alt=""></a>
      <span class="heading text_overflow2">heading 클래스를 가진 두 번째 기사 제목</span>
      <p class="des text_overflow1">이데일리 11.28</p>
    </li>
    <li>
      <a href="/view.html?nid=202611280003&amp;pn=179"><img class="lazy" src="https://images-cdn.newspic.kr/thumb1/three.jpg"></a>
      <h2>경기일보 11.28</h2>
    </li>
  </ul>
</section>`;

test('제목이 앵커 밖에 있어도 리스트 항목 단위로 제목·링크를 짝짓는다', () => {
  const articles = parseNewspicHtml(SIBLING_TITLE_HTML, { limit: 10 });

  assert.equal(articles.length, 2, '제목을 찾은 항목만, 제목 없는 항목은 버린다');
  assert.equal(articles[0].title, '앵커 밖에 있는 첫 번째 기사 제목');
  assert.equal(articles[0].link, 'https://m.newspic.kr/view.html?nid=202611280001&pn=214');
  assert.equal(articles[0].image, 'https://rimages-cdn.newspic.kr/thumb1/one.jpg?w=240&h=120');
  assert.equal(articles[0].summary, '연합뉴스 11.28');

  assert.equal(articles[1].title, 'heading 클래스를 가진 두 번째 기사 제목');
  assert.equal(articles[1].link, 'https://m.newspic.kr/view.html?nid=202611280002&pn=82');
  assert.equal(articles[1].summary, '이데일리 11.28');
});

test('출처 줄("경기일보 11.28")을 제목으로 쓰지 않는다', () => {
  const articles = parseNewspicHtml(SIBLING_TITLE_HTML, { limit: 10 });
  assert.ok(articles.every((article) => !/11\.28$/.test(article.title)), '출처 줄이 제목이 되면 안 된다');
});

test('같은 기사(nid)는 pn 파라미터가 달라도 한 번만 돌려준다', () => {
  const html = `
  <ul>
    <li><a href="/view.html?nid=202611280010&amp;pn=82"><h1>중복 기사 제목입니다</h1></a></li>
    <li><a href="/view.html?nid=202611280010&amp;pn=214"><h1>중복 기사 제목입니다</h1></a></li>
  </ul>`;
  const articles = parseNewspicHtml(html, { limit: 10 });
  assert.equal(articles.length, 1);
  assert.equal(articles[0].link, 'https://m.newspic.kr/view.html?nid=202611280010&pn=82');
});

test('네비게이션 링크(/main)와 기사 없는 HTML은 기사로 만들지 않는다', () => {
  assert.deepEqual(parseNewspicHtml('<html><body><a href="/main?category=hot"><h1>Pick 뉴스</h1></a></body></html>'), []);
  assert.deepEqual(parseNewspicHtml(''), []);
});

test('기존 마크업(제목이 앵커 안)도 그대로 읽는다', () => {
  const html = `
  <div class="wrap-slide">
    <a class="link_slide" href="/view.html?nid=202611280020&amp;pn=82">
      <div class="pic"><img class="lazy" src="https://images-cdn.newspic.kr/thumb1/hero.jpg"></div>
      <div class="info"><p class="heading text_overflow2">히어로 슬라이드 기사 제목</p><p class="des text_overflow1">스포츠동아 11.28</p></div>
    </a>
  </div>
  <ul><li><a href="/view.html?nid=202611280021&amp;pn=82"><h1>앵커 안에 제목이 있는 기사</h1><h2>연합뉴스 11.28</h2></a></li></ul>`;
  const articles = parseNewspicHtml(html, { limit: 10 });
  assert.equal(articles.length, 2);
  assert.equal(articles[0].title, '히어로 슬라이드 기사 제목');
  assert.equal(articles[0].summary, '스포츠동아 11.28');
  assert.equal(articles[1].title, '앵커 안에 제목이 있는 기사');
  assert.equal(articles[1].summary, '연합뉴스 11.28');
});

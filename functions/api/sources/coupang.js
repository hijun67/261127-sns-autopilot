// Cloudflare Pages Function — /api/sources/coupang
// 쿠팡파트너스 상품을 랜덤으로 골라 제휴 딥링크를 발급하고 상품 정보를 돌려줍니다.
// Access Key·Secret Key는 저장하지 않고 요청마다 받아 그 요청에서만 사용합니다(BYOK).

import {
  COUPANG_CATEGORIES,
  clampNumber,
  createCoupangDeeplinkSafe,
  selectCoupangProduct,
} from './_lib.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export async function onRequestGet() {
  return json({
    ok: true,
    service: 'coupang-partners',
    categories: COUPANG_CATEGORIES,
    note:
      'POST {accessKey, secretKey, subId, categoryId, limit} 로 호출하세요. 키는 서버에 저장하지 않습니다.',
  });
}

export async function onRequestPost({ request }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'JSON 본문이 필요합니다.' }, 400);
  }

  const accessKey = String(payload?.accessKey || '').trim();
  const secretKey = String(payload?.secretKey || '').trim();
  const subId = String(payload?.subId || '').trim().slice(0, 40);
  if (!accessKey || !secretKey) {
    return json(
      {
        ok: false,
        error:
          '쿠팡파트너스 Access Key·Secret Key가 없습니다. 연결 · 설정 → 소스 · 제휴 API 에서 먼저 입력해 주세요.',
      },
      400
    );
  }
  if (accessKey.length > 200 || secretKey.length > 200) {
    return json({ ok: false, error: '키 형식이 너무 깁니다. 다시 확인해 주세요.' }, 400);
  }

  const categoryId = clampNumber(payload?.categoryId, 0, 999999, 0);
  const limit = clampNumber(payload?.limit, 5, 50, 20);

  try {
    const picked = await selectCoupangProduct({ accessKey, secretKey, subId, categoryId, limit });
    if (!picked?.item?.productUrl) {
      return json({ ok: false, error: '쿠팡에서 상품을 가져오지 못했습니다. 잠시 뒤 다시 시도해 주세요.' }, 502);
    }

    const deeplink = await createCoupangDeeplinkSafe({
      accessKey,
      secretKey,
      subId,
      url: picked.item.productUrl,
    });
    const item = {
      title: picked.item.title,
      price: picked.item.price,
      isRocket: picked.item.isRocket,
      isFreeShipping: picked.item.isFreeShipping,
      imageUrl: picked.item.imageUrl,
      landingUrl: deeplink.landingUrl || picked.item.productUrl,
      originalUrl: picked.item.productUrl,
      category: picked.category.name,
      categoryId: picked.category.id,
      productId: picked.item.productId,
    };

    return json({
      ok: true,
      item,
      pickedFrom: picked.source,
      triedCategories: picked.triedCategories,
      deeplinkOk: deeplink.ok,
      deeplinkError: deeplink.error || null,
      note: deeplink.ok ? '제휴 딥링크가 발급되었습니다.' : '딥링크 발급에 실패해 원본 상품 URL을 사용합니다.',
    });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || '쿠팡 상품 조회에 실패했습니다.').slice(0, 200) }, err?.status || 502);
  }
}

# BookLive Demo (정답은 있다)

저자 IP 기반 대화형 커머스 체험용 정적 데모.
GitHub Pages 정적 호스팅 + 별도 BookLive FastAPI 백엔드(임시 cloudflared 터널)로 동작한다.

## 사용 방법

1. 백엔드(BookLive FastAPI)를 띄운다.
   ```bash
   cd ~/Projects/booklive
   BOOKLIVE_CORS_ORIGINS="*" \
   KAKAO_SKILL_SECRET= KAKAO_ALLOWED_IPS= \
   uvicorn booklive.api.main:app --host 0.0.0.0 --port 8000
   ```
2. cloudflared 임시 터널을 켠다.
   ```bash
   cloudflared tunnel --url http://localhost:8000
   ```
   출력되는 `https://xxxx-xxxx.trycloudflare.com` URL을 복사한다.
3. 데모 URL 뒤에 `?api=<위 URL>`을 붙여 공유한다.
   ```
   https://<github-username>.github.io/booklive-demo/?api=https://xxxx-xxxx.trycloudflare.com
   ```

## 구조

- `index.html` — 카카오톡 톡방 풍 UI 셸
- `style.css` — 카카오톡 톡방 색감(연한 파란 배경, 노랑 말풍선) 흉내
- `app.js` — `/query` 호출, 추천 질문 quick reply, 한 사이클 대화

## 한정 사항

- 책 1권(이정효 『정답은 있다』, author_id=3)만 노출한다.
- API URL은 query param `?api=`로 주입한다. localStorage에 저장되므로 두 번째 방문부터는 생략 가능.
- 백엔드 응답이 늦으면 그대로 대기한다. 카카오 채널의 5초 SLA 제약은 적용되지 않는다.

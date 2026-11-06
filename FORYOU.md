# 추천 타임라인 컬럼 — 실험 버전

원본: [dimdenGD/OldTweetDeck](https://github.com/dimdenGD/OldTweetDeck)

기준 커밋: `a53062756a7bed29aa3633157bee9e69faeaa7f8` (4.4.1)

## 설치 및 사용

1. 기존 OldTweetDeck의 Export state로 컬럼 설정을 백업합니다.
2. 기존 OldTweetDeck 확장을 잠시 끄고 이 빌드를 설치합니다. 두 확장을 같은 페이지에서 동시에 실행하지 마세요.
3. Edge의 `edge://extensions` 또는 Chrome의 `chrome://extensions`에서 개발자 모드를 켜고 압축해제된 확장 프로그램 로드를 선택합니다.
4. 저장소 폴더 또는 `OldTweetDeckForYouChrome.zip`을 풀어 놓은 폴더를 선택합니다. `manifest.json`이 있는 폴더여야 합니다.
5. `https://x.com/i/tweetdeck`을 열고 Add column → For You → 계정 선택 → Add column으로 추가합니다.

기존 Home 컬럼은 최신순으로 유지됩니다. For You는 별도 피드로 저장됩니다. 본 작업에서 실제 사용자 컬럼 설정은 변경하지 않았습니다.

Firefox 패키지는 원본과 마찬가지로 미서명 확장을 지원하는 환경이 필요합니다. 실험 포크의 확장 ID는 원본과 다릅니다.

## 구현

- 네이티브 컬럼/피드 타입 `foryou`와 계정 선택 메뉴를 추가했습니다.
- 별도 내부 경로 `statuses/for_you_timeline.json`을 X의 `HomeTimeline` POST 요청으로 변환합니다.
- 기존 Home의 `HomeLatestTimeline` 경로·커서·정렬은 공유하지 않습니다.
- 추천 순위는 API의 64비트 `sortIndex`를 BigInt로 처리해 보존합니다. 트윗 ID의 최신순으로 다시 정렬하지 않습니다.
- 대화 모듈의 게시물을 펼치고 중복·광고·차단·뮤트 항목을 제외합니다.
- 더 보기는 불투명한 커서를 그대로 전달하며 새로고침에서는 추천 피드를 새로 요청합니다.
- 최근 본 게시물 ID는 계정별 메모리에서만 최대 100개 관리합니다. 새 파일이나 서버에 저장하지 않습니다.
- 추천 컬럼의 최소 갱신 주기는 60초입니다.
- 일치하는 UI와 어댑터를 유지하기 위해 이 실험 빌드는 번들 파일만 사용합니다. 원본의 시작 시 원격 JavaScript 자동 교체와 추가 스크립트 로드는 비활성화했습니다. 원본의 challenge solver 의존성은 유지됩니다.
- Chromium 확장 권한은 원본과 같습니다.
- 원본의 인증 쿠키를 콘솔에 출력하는 디버그 로그는 제거했습니다.

## 검증

`npm ci --ignore-scripts` 후 `npm test`로 파서·순위·대화 모듈·오류·커서·계정 분리와 실제 XHR 인터셉터의 회귀 테스트를 실행합니다.

선택 사항인 `npm run test:browser`는 Playwright와 설치된 Edge를 사용합니다. 별도로 Playwright를 설치하거나 `NODE_PATH`를 지정하세요.
격리된 새 프로필에서 모든 페이지/네트워크 요청을 가상 응답으로 처리하므로 실제 X 로그인이나 사용자 세션을 사용하지 않습니다.

검증 결과: 자동 테스트 9개 통과. Edge에서 실제 Add column → For You 메뉴 조작, 계정 선택,
추천 게시물의 순위 표시, Home과의 공존, 새로고침 후 컬럼 복원을 확인했습니다.
테스트 중 원본의 Beta 버튼 React 렌더 오류가 관찰됐으며, 변경 전 upstream 번들에서도 같은 오류를 재현했습니다.
추천 컬럼 표시와 복원에는 영향을 주지 않았습니다. 브라우저 테스트는 이 알려진 오류를 제외한 다른 오류가 있으면 실패합니다.

`npm run build`는 실행 파일만 포함한 Chromium/Firefox 패키지를 `build/`에 생성합니다.

## 확인이 필요한 사항

이 버전은 실험 구현입니다. **실제 로그인 계정의 추천 API 응답은 아직 검증하지 않았습니다.**
`HomeTimeline`은 비공개 API이므로 X의 변경으로 실패할 수 있습니다. 현재 operation ID와 POST 형식은
[같은 개발자의 OldTwitter 구현](https://github.com/dimdenGD/OldTwitter/blob/master/scripts/apis.js)을 참고했습니다.
호환성이 깨지면 `src/for-you.js`의 operation ID와 feature 플래그를 업데이트해야 할 수 있습니다.

공식 X 화면의 광고·설문·추천 계정 등의 모듈을 모두 재현하는 것은 아닙니다. 여러 계정, 위임/Team 계정에서의 실제 추천 적용도 추가 확인이 필요합니다.
원본으로 돌아갈 때는 이 확장을 끄고 원래 확장을 다시 켜면 됩니다. 원본이 모르는 `foryou` 컬럼이 남아 있으면 실험 버전에서 해당 컬럼을 제거하거나 백업 상태를 복원하세요.

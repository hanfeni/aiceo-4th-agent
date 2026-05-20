# 테스트 fixture 파일

업로드 파일 추출(extractText.ts) 회귀 테스트용 실파일 샘플.

## sample.hwpx

- 출처: [neolord0/hwpxlib](https://github.com/neolord0/hwpxlib)
  `testFile/reader_writer/HeaderFooter.hwpx`
- 라이선스: Apache-2.0 (저작권 © neolord0)
- 용도: 실제 한글(한컴) 프로그램이 생성한 HWPX 구조(`<hs:sec>` 루트 +
  `hp:` 네임스페이스 + `<hp:t>` 텍스트 노드)에서 readHwpx 가 본문 텍스트를
  올바로 추출하는지 검증. 합성 fixture(테스트 코드에서 직접 만든 ZIP)와
  실제 구조가 일치함을 보장한다.
- 본문: "머리말 테스트" / "꼬리말" 등 짧은 텍스트.

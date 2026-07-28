import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Row,
  Stack,
  Stat,
  Table,
  Text,
  useHostTheme,
} from "cursor/canvas";

export default function ProChunkSizeLimit() {
  const theme = useHostTheme();

  return (
    <Stack gap={24} style={{ padding: 24, maxWidth: 920 }}>
      <Stack gap={8}>
        <H1>Gemini Pro 이론적 청크 사이즈 한도</H1>
        <Text tone="secondary" size="small">
          Source: docs/tuning/chunk-size-model.md §1·§5-2-1 · decisions.md §2-15 ·
          레버1 14런 실측 (2026-07-28 개정)
        </Text>
      </Stack>

      <Callout tone="danger">
        ⚠️ 이 카드의 초판(2026-07-28 오전)은 한도를 3,014로 냈다. **틀렸다** —
        flash 실측 v=220을 Pro에 그대로 썼고, thinking을 상수(5,245)로 놓았다.
        Pro 실측은 v≈100이고 HIGH의 thinking은 상수가 아니라 **B에 비례**한다
        (θ≈40 tok/블록). 바로잡은 값이 아래다.
      </Callout>

      <Grid columns={3} gap={12}>
        <Stat value="526" label="Pro HIGH 한도 (v=100 보수)" tone="warning" />
        <Stat value="1,080" label="출력 상한 (비바인딩)" />
        <Stat value="250" label="현재 운영 B (Pro)" tone="success" />
      </Grid>

      <Callout tone="warning">
        바인딩 제약이 flash와 **뒤바뀐다**. flash는 출력 상한(3,276 &lt; 4,097)이
        조였지만, Pro HIGH는 타임아웃(526)이 출력 상한(1,080)의 절반이라 타임아웃이
        조인다. θ(40)가 t_out(16)보다 2.5배 커서 청크 소요를 지배하기 때문.
        현재 B=250은 300초 예산의 48%를 쓴다 — flash B=100의 33배 여유와 달리
        2.1배뿐이다.
      </Callout>

      <Stack gap={12}>
        <H2>공식 — th를 상수로 두면 안 된다</H2>
        <Card>
          <CardBody>
            <Stack gap={8}>
              <Text weight="semibold">출력 상한</Text>
              <Text>B · (t_out · dens + θ) ≤ 65,536</Text>
              <Divider />
              <Text weight="semibold">라우트 타임아웃</Text>
              <Text>TTFT + B · (t_out + θ) / v ≤ 300</Text>
              <Divider />
              <Text tone="secondary" size="small">
                초판은 th를 상수(5,245)로 빼서 `B ≤ (65,536 − th)/(t_out·dens)`
                형태로 풀었다. Pro HIGH에서 thinking은 B에 비례하므로(θ ≈ 40
                tok/블록, 41.1·40.3 두 런) th = θ·B로 들어가야 하고, 그러면 B의
                계수가 16 → 56으로 **3.5배**가 된다. 이게 한도가 3,014에서 526으로
                내려간 주된 이유다.
              </Text>
            </Stack>
          </CardBody>
        </Card>
      </Stack>

      <Stack gap={12}>
        <H2>파라미터</H2>
        <Table
          headers={["기호", "값", "출처"]}
          rows={[
            ["outcap", "65,536", "gemini-limits §1 — Pro·Flash 공통"],
            ["timeout", "300s", "translate route maxDuration"],
            ["t_out", "16", "chunk-size-model §1 (flash 실측)"],
            ["dens", "1.25", "chunk-size-model §1"],
            ["TTFT", "2s", "추정"],
            [
              "v (Pro)",
              "~100 tok/s",
              "레버1 실측 — 단일청크 런 95.5~137.3, 보수값 100 (flash는 220)",
            ],
            [
              "θ (Pro HIGH)",
              "~40 tok/블록",
              "drama B=500 HIGH 40.3 · B=250 HIGH 41.1 — 표본 1개 파일",
            ],
          ]}
        />
      </Stack>

      <Stack gap={12}>
        <H2>시나리오별 한도</H2>
        <Table
          headers={["가정", "OUTCAP B", "TIMEOUT B", "바인딩", "한도"]}
          rows={[
            ["flash (v=220, th=0)", "3,276", "4,097", "OUTCAP", "3,276"],
            ["~~Pro 초판 (v=220, th=5,245 상수)~~", "3,014", "3,769", "—", "폐기"],
            ["Pro HIGH (v=130, θ=40) — drama 실측", "1,080", "683", "TIMEOUT", "683"],
            ["**Pro HIGH (v=100, θ=40) ★**", "1,080", "526", "TIMEOUT", "**526**"],
          ]}
          rowTone={[undefined, "danger", "info", "warning"]}
        />
        <Text tone="secondary" size="small">
          ★ 권고: 보수값. v는 full-movie(이탈리아어 장편) 단일청크 런의 95~103을
          기준으로 잡았다 — drama는 127~137로 더 빨라서, 파일에 따라 683까지 열린다.
          θ=40은 drama 한 파일에서만 나온 값이라, 대사 밀도가 높은 장편에서 커지면
          526도 같이 내려간다.
        </Text>
      </Stack>

      <Grid columns={2} gap={16}>
        <Stack gap={8}>
          <H3>산수 전개 (권고값)</H3>
          <Card>
            <CardHeader>TIMEOUT (바인딩)</CardHeader>
            <CardBody>
              <Stack gap={6}>
                <Text size="small">(300 − 2) × 100 / (16 + 40)</Text>
                <Text size="small">= 29,800 / 56 = 532.1</Text>
                <Text weight="semibold">→ B ≤ 526 (θ=40.7 정밀값)</Text>
              </Stack>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>OUTCAP (비바인딩)</CardHeader>
            <CardBody>
              <Stack gap={6}>
                <Text size="small">65,536 / (16 × 1.25 + 40)</Text>
                <Text size="small">= 65,536 / 60 = 1,092</Text>
                <Text weight="semibold">→ B ≤ 1,080 (θ=40.7 정밀값)</Text>
              </Stack>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>실측 대조 (공식 검증)</CardHeader>
            <CardBody>
              <Stack gap={6}>
                <Text size="small">B=500 HIGH: 예측 210.0s / 실측 208.0s</Text>
                <Text size="small">B=250 HIGH: 예측 111.7s / 실측 109.7s</Text>
                <Text tone="secondary" size="small">
                  오차 1% 이내 — 파라미터가 맞다는 근거
                </Text>
              </Stack>
            </CardBody>
          </Card>
        </Stack>

        <Stack gap={8}>
          <H3>이론 ≠ 운영</H3>
          <Card>
            <CardBody>
              <Stack gap={8}>
                <Row gap={8} align="center">
                  <Text weight="semibold">Pro HIGH 이론 천장</Text>
                  <Text>~526 블록</Text>
                </Row>
                <Row gap={8} align="center">
                  <Text weight="semibold">경험적 드리프트</Text>
                  <Text>~600 블록 (§8)</Text>
                </Row>
                <Row gap={8} align="center">
                  <Text weight="semibold">현재 운영 (Pro)</Text>
                  <Text
                    style={{ color: theme.accent.primary }}
                    weight="semibold"
                  >
                    B = 250
                  </Text>
                </Row>
                <Divider />
                <Text tone="secondary" size="small">
                  flash에서는 이론 천장(3,276)이 드리프트 한계(~600)보다 5배 위라
                  산수가 무의미했다. **Pro HIGH에서는 둘이 526 대 600으로 거의
                  겹친다** — 이론 벽과 경험 벽이 처음으로 같은 자리에 왔고, 그
                  아래인 B=250이 두 벽 모두에서 안전한 유일한 운영값이다.
                </Text>
              </Stack>
            </CardBody>
          </Card>
        </Stack>
      </Grid>
    </Stack>
  );
}

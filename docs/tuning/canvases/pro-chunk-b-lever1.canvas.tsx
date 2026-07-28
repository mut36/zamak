import {
  Callout,
  Grid,
  H1,
  H2,
  Stack,
  Stat,
  Table,
  Text,
} from "cursor/canvas";

export default function ProChunkBLever1Canvas() {
  return (
    <Stack gap={24} style={{ padding: 24, maxWidth: 1200 }}>
      <Stack gap={8}>
        <H1>Pro Chunk Size Lever 1</H1>
        <Text tone="secondary" size="small">
          Source: full-movie.srt (1874 blocks) · model `gemini-3.1-pro-preview`
          · 2026-07-28 harness runs
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value="B=500 LOW" label="Best Run" tone="success" />
        <Stat value="61.0s" label="Fastest Stable Time" tone="info" />
        <Stat value="0 / 1874" label="Lowest Error Candidates" tone="success" />
        <Stat value="$0.3822" label="Cheapest Run (Pro 단가)" tone="info" />
      </Grid>

      <Callout tone="warning">
        Harness summary headers still print `THINKING_LEVEL=LOW` for Pro runs.
        The actual LOW vs MEDIUM split here is inferred from the env used per run
        and the measured `thinking` token deltas.
      </Callout>

      <Callout tone="danger">
        ⚠️ 비용 열 정정(2026-07-28). 이 8런은 구 하네스 기본 단가
        (pin $1.5 / pout $7.5 = **flash 단가**)로 계산돼 초판에 ~55% 낮게 찍혀
        있었다. 아래 표는 Pro 단가(pin $2 / pout $12)로 다시 계산한 값이다.
        순위는 대부분 보존되지만 절대값은 전부 달라진다. 토큰 수·정렬실패는
        원본 그대로다.
      </Callout>

      <Stack gap={12}>
        <H2>Run Summary</H2>
        <Table
          headers={[
            "Condition",
            "Unmatched",
            "Error %",
            "Mismatch Chunks",
            "Prompt Tok",
            "Thinking Tok",
            "Output Tok",
            "Time",
            "Est. Cost",
          ]}
          rows={[
            ["B=2000 LOW", "0", "0.00%", "0", "28,013", "0", "27,184", "262.9s", "$0.3822"],
            ["B=2000 MEDIUM", "1", "0.05%", "1", "28,013", "1,591", "26,838", "297.6s", "$0.3972"],
            ["B=1000 LOW", "2", "0.11%", "1", "28,512", "362", "27,502", "131.1s", "$0.3914"],
            ["B=1000 MEDIUM", "24", "1.28%", "2", "28,512", "26,032", "26,905", "211.1s", "$0.6923"],
            ["B=500 LOW", "0", "0.00%", "0", "29,508", "149", "26,804", "61.0s", "$0.3825"],
            ["B=500 MEDIUM", "1", "0.05%", "1", "29,508", "41,028", "26,853", "163.1s", "$0.8736"],
            ["B=250 LOW", "0", "0.00%", "0", "31,504", "20,024", "26,803", "74.6s", "$0.6249"],
            ["B=250 MEDIUM", "0", "0.00%", "0", "31,504", "42,547", "26,956", "81.4s", "$0.8970"],
          ]}
          rowTone={[
            "info",
            "warning",
            "warning",
            "danger",
            "success",
            "warning",
            "warning",
            "warning",
          ]}
          columnAlign={["left", "right", "right", "right", "right", "right", "right", "right", "right"]}
        />
      </Stack>

      <Stack gap={12}>
        <H2>Checks</H2>
        <Table
          headers={["Condition", "`|` Residue", "Output Blocks", "Notes"]}
          rows={[
            ["All 8 runs", "0", "1874", "No pipe residue; block count preserved in every output"],
            ["B=2000 LOW", "0", "1874", "Single giant chunk, 0 unmatched"],
            ["B=1000 MEDIUM", "0", "1874", "Worst run: 24 unmatched, 2 mismatch chunks"],
            ["B=500 LOW", "0", "1874", "Fastest 0-error candidate"],
            ["B=250 MEDIUM", "0", "1874", "0 unmatched, but highest thinking cost"],
          ]}
          rowTone={[undefined, "info", "warning", "success", "warning"]}
        />
      </Stack>

      <Stack gap={12}>
        <H2>Notable Blocks</H2>
        <Table
          headers={["Block", "Why It Matters", "LOW / MEDIUM Difference"]}
          rows={[
            [
              "590",
              "LOW left the English source unchanged at B=2000/1000/500/250; every MEDIUM run translated it.",
              "Source: `You must remember this.` → B250 MEDIUM becomes `(노래) 이것만은 기억해 줘.`",
            ],
            [
              "1316",
              "B1000 MEDIUM left the Italian source unchanged while the other 7 runs translated it.",
              "Translation quality varies, but only B1000 MEDIUM fails to translate at all.",
            ],
            [
              "1329",
              "B1000 LOW left the source unchanged while the rest translated.",
              "`A proposito, tutto pronto, tutto a posto?` remained Italian only in B1000 LOW.",
            ],
            [
              "1581",
              "B500 MEDIUM left the source unchanged while the other 7 runs translated with widely different meanings.",
              "Range spans `뭔 소리야?` to `자, 춤춰.` — indicates local instability, not just style drift.",
            ],
            [
              "1868-1874",
              "B1000 MEDIUM shows the clearest end-of-file semantic drift cluster.",
              "1868-1874 include Italian leftovers and shifted meanings; B2000 MEDIUM also swaps 1871/1872/1873 content.",
            ],
            [
              "1874",
              "B2000 MEDIUM and B1000 MEDIUM leave the last line in Italian.",
              "Most other runs render `꼴찌가 기름값 내기` variants instead.",
            ],
          ]}
          rowTone={[ "warning", "warning", "warning", "warning", "danger", "warning" ]}
        />
      </Stack>

      <Stack gap={12}>
        <H2>Takeaways</H2>
        <Table
          headers={["Condition", "Interpretation"]}
          rows={[
            ["B=500 LOW", "Best balance in this grid: 0 unmatched, 0 mismatch chunks, 61.0s, near-minimum cost."],
            ["B=2000 LOW", "Technically clean in this one run, but much slower than B=500 LOW with no cost advantage."],
            ["B=250 LOW", "0 unmatched but surprisingly high thinking (20,024), so not a cheap safe fallback."],
            ["B=1000 MEDIUM", "Clear reject candidate: worst error rate and big thinking spend."],
            ["All MEDIUM runs", "MEDIUM did not buy consistent safety; it usually bought more thinking and higher cost."],
          ]}
          rowTone={["success", "info", "warning", "danger", "warning"]}
        />
      </Stack>
    </Stack>
  );
}

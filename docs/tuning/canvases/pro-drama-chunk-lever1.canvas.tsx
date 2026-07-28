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

export default function ProDramaChunkLever1Canvas() {
  return (
    <Stack gap={24} style={{ padding: 24, maxWidth: 1200 }}>
      <Stack gap={8}>
        <H1>Pro Drama Chunk Grid</H1>
        <Text tone="secondary" size="small">
          Source: drama-episode.srt (461 blocks) · title Esterno Notte · model
          `gemini-3.1-pro-preview` · gap-based harness · 2026-07-28 · pricing
          pin$2 / pout$12
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value="B=250 LOW" label="Best Run" tone="success" />
        <Stat value="90.3s" label="Fastest Time" tone="info" />
        <Stat value="0 / 461" label="Final Unmatched" tone="success" />
        <Stat value="$0.2087" label="Cheapest Est. Cost" tone="info" />
      </Grid>

      <Callout tone="info">
        461 blocks is smaller than B=500 and B=1000, so both land as a single
        chunk under gap-based chunking (`remaining ≤ maxSize`). The real B
        split only happens at B=250 (239 + 222).
      </Callout>

      <Stack gap={12}>
        <H2>Run Summary</H2>
        <Table
          headers={[
            "Condition",
            "Chunks",
            "Unmatched",
            "Mismatch",
            "Sweep",
            "Prompt",
            "Thinking",
            "Output",
            "Time",
            "Est. Cost",
          ]}
          rows={[
            [
              "B=1000 LOW",
              "1",
              "0 (after sweep)",
              "1",
              "1 recovered / 1 call",
              "8,993",
              "8,974",
              "7,801",
              "132.2s",
              "$0.2193",
            ],
            [
              "B=500 LOW",
              "1",
              "0",
              "0",
              "none",
              "8,469 (+4,078 cached)",
              "15,365",
              "8,136",
              "171.2s",
              "$0.2990",
            ],
            [
              "B=250 LOW",
              "2",
              "0",
              "0",
              "none",
              "8,970",
              "7,898",
              "7,995",
              "90.3s",
              "$0.2087",
            ],
            [
              "B=250 MEDIUM",
              "2",
              "0",
              "0",
              "none",
              "8,970",
              "12,887",
              "8,025",
              "98.1s",
              "$0.2689",
            ],
          ]}
          rowTone={["warning", "warning", "success", "info"]}
          columnAlign={[
            "left",
            "right",
            "right",
            "right",
            "left",
            "right",
            "right",
            "right",
            "right",
            "right",
          ]}
        />
      </Stack>

      <Stack gap={12}>
        <H2>Checks</H2>
        <Table
          headers={["Condition", "`|` Residue", "Output Blocks", "Notes"]}
          rows={[
            ["All 4 runs", "0", "461", "Block count preserved; no pipe residue"],
            [
              "B=1000 LOW",
              "0",
              "461",
              "Main pass missed 1 block; recovery sweep fixed it. Still shows a 46–47 merge glitch",
            ],
            [
              "B=500 LOW",
              "0",
              "461",
              "Clean 1-chunk run, but highest thinking in this grid",
            ],
            [
              "B=250 LOW",
              "0",
              "461",
              "Best balance: 2 gap-based chunks, 0 errors, lowest cost/time",
            ],
            [
              "B=250 MEDIUM",
              "0",
              "461",
              "Same stability as LOW, +63% thinking tokens, +29% cost",
            ],
          ]}
          rowTone={[undefined, "warning", "warning", "success", "info"]}
        />
      </Stack>

      <Stack gap={12}>
        <H2>Notable Blocks</H2>
        <Table
          headers={["Block", "Why It Matters", "Difference"]}
          rows={[
            [
              "46–47",
              "B=1000 LOW splits the Communist Party line across two blocks incorrectly.",
              "B1000: `우리는 우리를 향해 증오와 조롱을` / `쏟아낸 공산당을…` · others keep `우리는 공산당을 믿지 않습니다` on 46",
            ],
            [
              "11",
              "Formality split between runs.",
              "B1000: `막을 이유가 있나?` · B500/B250 MEDIUM: `…있습니까?`",
            ],
            [
              "58",
              "Tone swings hard at the same line.",
              "B1000: `기다려야 합니다!` · B250 LOW: `기다리라고 하쇼!` · B250 MEDIUM: `기다리라고 하십시오!`",
            ],
            [
              "225",
              "Opposite polarity on the same rebuttal.",
              "B1000/B500: `아니요/아닙니다!` · B250 LOW: `맞습니다!` · B250 MEDIUM: `바로 여기야!`",
            ],
            [
              "231",
              "Banmal vs formal on a short exchange.",
              "B1000: `- 거짓말 / - 진짜야` · B500: `- 거짓말 / - 사실입니다` · B250 MEDIUM: `- 그렇지 않습니다 / - 맞아`",
            ],
            [
              "246",
              "Register and wording diverge on violence slang.",
              "B1000: `무릎 쏘기군` · B500: `다리에 총질이니` · B250 LOW: `무릎 쏘기군요`",
            ],
          ]}
          rowTone={["danger", "warning", "warning", "warning", "info", "info"]}
        />
      </Stack>

      <Stack gap={12}>
        <H2>Takeaways</H2>
        <Table
          headers={["Condition", "Interpretation"]}
          rows={[
            [
              "B=250 LOW",
              "Winner for this drama sample: only condition that actually splits chunks, fastest, cheapest, zero final errors.",
            ],
            [
              "B=1000 / B=500 LOW",
              "Not a real B comparison on 461 blocks — both are one-chunk runs. Prefer larger files (full-movie) to distinguish them.",
            ],
            [
              "Sweep path",
              "New harness recovery worked once (B=1000 LOW recovered 1 block). Still did not prevent the 46–47 merge glitch.",
            ],
            [
              "MEDIUM @ B=250",
              "No stability gain over LOW here; mainly buys more thinking cost and slightly more formal diction.",
            ],
          ]}
          rowTone={["success", "warning", "info", "warning"]}
        />
      </Stack>

      <Stack gap={8}>
        <Text tone="secondary" size="small">
          Artifacts: `.harness/lever1-drama-b1000-low/2026-07-28T10-12-21-996Z`,
          `.harness/lever1-drama-b500-low/2026-07-28T10-15-13-562Z`,
          `.harness/lever1-drama-b250-low/2026-07-28T10-16-44-285Z`,
          `.harness/lever1-drama-b250-medium/2026-07-28T10-18-22-711Z`
        </Text>
      </Stack>
    </Stack>
  );
}
